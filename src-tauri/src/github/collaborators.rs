use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;

use super::client::{enc, GitHubClient};
use crate::error::{AppError, AppResult};


#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Read,
    Triage,
    Write,
    Maintain,
    Admin,
}

impl Role {

    pub fn api(self) -> &'static str {
        match self {
            Role::Read => "pull",
            Role::Triage => "triage",
            Role::Write => "push",
            Role::Maintain => "maintain",
            Role::Admin => "admin",
        }
    }


    pub fn parse(s: &str) -> Option<Role> {
        Some(match s {
            "read" | "pull" => Role::Read,
            "triage" => Role::Triage,
            "write" | "push" => Role::Write,
            "maintain" => Role::Maintain,
            "admin" => Role::Admin,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Collaborator {
    pub login: String,
    pub avatar_url: String,
    pub html_url: String,
    pub role: Role,

    pub role_name: String,

    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Invitation {
    pub id: u64,
    pub login: String,
    pub avatar_url: String,
    pub role: Role,
    pub created_at: String,
    pub expired: bool,
    pub html_url: String,
}

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(Value::as_str).unwrap_or_default().to_string()
}

fn role_from_perms(v: &Value) -> Role {
    let p = |k: &str| v.pointer(&format!("/permissions/{k}")).and_then(Value::as_bool).unwrap_or(false);
    if p("admin") {
        Role::Admin
    } else if p("maintain") {
        Role::Maintain
    } else if p("push") {
        Role::Write
    } else if p("triage") {
        Role::Triage
    } else {
        Role::Read
    }
}

pub fn parse_collaborator(v: &Value) -> Collaborator {
    let role_name = s(v, "role_name");
    Collaborator {
        login: s(v, "login"),
        avatar_url: s(v, "avatar_url"),
        html_url: s(v, "html_url"),
        role: Role::parse(&role_name).unwrap_or_else(|| role_from_perms(v)),
        role_name,
        kind: s(v, "type"),
    }
}


pub async fn list(c: &GitHubClient, repo: &str, fresh: bool) -> AppResult<Vec<Collaborator>> {
    let raw: Vec<Value> = c.paginate_with(&format!("/repos/{repo}/collaborators?affiliation=all&per_page=100"), fresh).await?;
    Ok(raw.iter().map(parse_collaborator).collect())
}

pub async fn invitations(c: &GitHubClient, repo: &str, fresh: bool) -> AppResult<Vec<Invitation>> {
    let raw: Vec<Value> = c.paginate_with(&format!("/repos/{repo}/invitations?per_page=100"), fresh).await?;
    Ok(raw
        .iter()
        .map(|v| Invitation {
            id: v.get("id").and_then(Value::as_u64).unwrap_or(0),
            login: v.pointer("/invitee/login").and_then(Value::as_str).unwrap_or("?").to_string(),
            avatar_url: v.pointer("/invitee/avatar_url").and_then(Value::as_str).unwrap_or_default().to_string(),
            role: Role::parse(&s(v, "permissions")).unwrap_or(Role::Read),
            created_at: s(v, "created_at"),
            expired: v.get("expired").and_then(Value::as_bool).unwrap_or(false),
            html_url: s(v, "html_url"),
        })
        .collect())
}


pub async fn permission_of(c: &GitHubClient, repo: &str, user: &str) -> AppResult<Option<Role>> {
    let v: Value = c.get_json(&format!("/repos/{repo}/collaborators/{}/permission", enc(user))).await?;
    let name = v.get("role_name").and_then(Value::as_str).unwrap_or_else(|| v.get("permission").and_then(Value::as_str).unwrap_or("none"));
    Ok(Role::parse(name))
}

pub async fn is_collaborator(c: &GitHubClient, repo: &str, user: &str) -> AppResult<bool> {
    match c.send_json::<()>(Method::GET, &format!("/repos/{repo}/collaborators/{}", enc(user)), None).await {
        Ok(_) => Ok(true),
        Err(e) if e.code == "github.not_found" => Ok(false),
        Err(e) => Err(e),
    }
}


pub async fn set(c: &GitHubClient, repo: &str, user: &str, role: Role) -> AppResult<()> {
    let path = format!("/repos/{repo}/collaborators/{}", enc(user));
    c.send_json(Method::PUT, &path, Some(&json!({ "permission": role.api() }))).await?;
    Ok(())
}

pub async fn remove(c: &GitHubClient, repo: &str, user: &str) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/repos/{repo}/collaborators/{}", enc(user)), None).await?;
    Ok(())
}

pub async fn cancel_invitation(c: &GitHubClient, repo: &str, id: u64) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/repos/{repo}/invitations/{id}"), None).await?;
    Ok(())
}

pub async fn update_invitation(c: &GitHubClient, repo: &str, id: u64, role: Role) -> AppResult<()> {
    let perm = match role {
        Role::Read => "read",
        Role::Triage => "triage",
        Role::Write => "write",
        Role::Maintain => "maintain",
        Role::Admin => "admin",
    };
    c.send_json(Method::PATCH, &format!("/repos/{repo}/invitations/{id}"), Some(&json!({ "permissions": perm }))).await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RepoAccess {
    pub repo: String,
    pub collaborators: Vec<Collaborator>,
    pub invitations: Vec<Invitation>,
    pub error: Option<AppError>,
}

pub async fn access(c: &GitHubClient, repo: &str, fresh: bool) -> RepoAccess {
    let (collabs, invites) = tokio::join!(list(c, repo, fresh), invitations(c, repo, fresh));
    match (collabs, invites) {
        (Ok(collaborators), Ok(invitations)) => RepoAccess { repo: repo.into(), collaborators, invitations, error: None },
        (Err(e), _) | (_, Err(e)) => RepoAccess { repo: repo.into(), collaborators: vec![], invitations: vec![], error: Some(e) },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roles_parse_and_order() {
        assert_eq!(Role::parse("write"), Some(Role::Write));
        assert_eq!(Role::parse("push"), Some(Role::Write));
        assert_eq!(Role::parse("none"), None);
        assert!(Role::Admin > Role::Maintain && Role::Write > Role::Triage);
        assert_eq!(Role::Read.api(), "pull");
    }

    #[test]
    fn collaborator_role_falls_back_to_permissions() {
        let v = json!({ "login": "a", "avatar_url": "", "html_url": "", "type": "User", "role_name": "custom-auditor",
            "permissions": { "admin": false, "maintain": false, "push": true, "triage": true, "pull": true } });
        let c = parse_collaborator(&v);
        assert_eq!(c.role, Role::Write);
        assert_eq!(c.role_name, "custom-auditor");
    }
}
