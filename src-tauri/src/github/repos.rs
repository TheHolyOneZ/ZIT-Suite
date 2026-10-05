use std::collections::BTreeMap;

use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::json;
use specta::Type;

use super::GitHubClient;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RepoOwner {
    pub login: String,
    pub avatar_url: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
pub struct RepoPermissions {
    pub admin: bool,
    pub push: bool,
    pub pull: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RepoLicense {
    pub spdx_id: Option<String>,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Repo {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    pub owner: RepoOwner,
    pub private: bool,
    pub fork: bool,
    pub archived: bool,
    pub is_template: bool,
    pub description: Option<String>,
    pub html_url: String,
    pub homepage: Option<String>,
    pub language: Option<String>,
    pub topics: Option<Vec<String>>,
    pub stargazers_count: u32,
    pub forks_count: u32,
    pub watchers_count: u32,
    pub open_issues_count: u32,

    pub size: u32,
    pub default_branch: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub pushed_at: Option<String>,
    pub visibility: Option<String>,
    pub permissions: Option<RepoPermissions>,
    pub license: Option<RepoLicense>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LanguageShare {
    pub name: String,
    pub bytes: u64,
}

pub async fn list_for_user(c: &GitHubClient, fresh: bool) -> AppResult<Vec<Repo>> {
    c.paginate_with("/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member", fresh)
        .await
}

pub async fn list_for_org(c: &GitHubClient, org: &str, fresh: bool) -> AppResult<Vec<Repo>> {
    c.paginate_with(&format!("/orgs/{org}/repos?per_page=100&type=all&sort=updated"), fresh).await
}

pub async fn get(c: &GitHubClient, full_name: &str) -> AppResult<Repo> {
    c.get_json(&format!("/repos/{full_name}")).await
}

pub async fn languages(c: &GitHubClient, full_name: &str) -> AppResult<Vec<LanguageShare>> {
    let map: BTreeMap<String, u64> = c.get_json(&format!("/repos/{full_name}/languages")).await?;
    let mut v: Vec<_> = map.into_iter().map(|(name, bytes)| LanguageShare { name, bytes }).collect();
    v.sort_by_key(|l| std::cmp::Reverse(l.bytes));
    Ok(v)
}

pub async fn patch(c: &GitHubClient, full_name: &str, body: serde_json::Value) -> AppResult<()> {
    c.send_json(Method::PATCH, &format!("/repos/{full_name}"), Some(&body)).await?;
    Ok(())
}

pub async fn set_archived(c: &GitHubClient, full_name: &str, archived: bool) -> AppResult<()> {
    patch(c, full_name, json!({ "archived": archived })).await
}

pub async fn set_private(c: &GitHubClient, full_name: &str, private: bool) -> AppResult<()> {
    patch(c, full_name, json!({ "private": private })).await
}


pub fn valid_repo_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 100 && name != "." && name != ".." && name.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
}


pub async fn rename(c: &GitHubClient, full_name: &str, new_name: &str) -> AppResult<()> {
    if !valid_repo_name(new_name) {
        return Err(crate::error::AppError::new("migration.bad_name").detail(new_name.to_string()));
    }
    patch(c, full_name, json!({ "name": new_name })).await
}


pub async fn transfer(c: &GitHubClient, full_name: &str, new_owner: &str, new_name: Option<&str>) -> AppResult<()> {
    let mut body = json!({ "new_owner": new_owner });
    if let Some(n) = new_name.filter(|n| !n.is_empty()) {
        if !valid_repo_name(n) {
            return Err(crate::error::AppError::new("migration.bad_name").detail(n.to_string()));
        }
        body["new_name"] = json!(n);
    }
    c.send_json(Method::POST, &format!("/repos/{full_name}/transfer"), Some(&body)).await.map(drop)
}

pub async fn delete(c: &GitHubClient, full_name: &str) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/repos/{full_name}"), None).await?;
    Ok(())
}


pub async fn create(c: &GitHubClient, name: &str, private: bool, description: Option<&str>) -> AppResult<Repo> {
    let body = json!({ "name": name, "private": private, "description": description, "auto_init": false });
    let v = c.send_json(Method::POST, "/user/repos", Some(&body)).await?.unwrap_or_default();
    Ok(serde_json::from_value(v)?)
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RepoDraft {
    pub name: String,
    pub description: String,
    pub private: bool,

    pub org: Option<String>,

    pub template: Option<String>,

    pub all_branches: bool,

    pub readme: bool,
    pub gitignore: Option<String>,
    pub license: Option<String>,
}

pub async fn create_new(c: &GitHubClient, n: &RepoDraft) -> AppResult<Repo> {
    let name = n.name.trim();
    if !valid_repo_name(name) {
        return Err(crate::error::AppError::new("migration.bad_name").detail(name.to_string()));
    }
    let description = n.description.trim().replace(['\n', '\r'], " ");
    let v = if let Some(t) = n.template.as_deref().filter(|t| !t.is_empty()) {
        let mut body = json!({ "name": name, "description": description, "private": n.private, "include_all_branches": n.all_branches });
        if let Some(o) = &n.org {
            body["owner"] = json!(o);
        }
        c.send_json(Method::POST, &format!("/repos/{t}/generate"), Some(&body)).await?
    } else {
        let mut body = json!({ "name": name, "description": description, "private": n.private, "auto_init": n.readme || n.gitignore.is_some() || n.license.is_some() });
        if let Some(g) = n.gitignore.as_deref().filter(|g| !g.is_empty()) {
            body["gitignore_template"] = json!(g);
        }
        if let Some(l) = n.license.as_deref().filter(|l| !l.is_empty()) {
            body["license_template"] = json!(l);
        }
        let path = match &n.org {
            Some(o) => format!("/orgs/{}/repos", super::client::enc(o)),
            None => "/user/repos".to_string(),
        };
        c.send_json(Method::POST, &path, Some(&body)).await.map_err(|e| if e.code == "github.validation" && e.detail.as_deref().is_some_and(|d| d.contains("name already exists")) { crate::error::AppError::new("repos.name_exists").detail(name.to_string()) } else { e })?
    };
    Ok(serde_json::from_value(v.unwrap_or_default())?)
}


pub async fn gitignore_templates(c: &GitHubClient) -> AppResult<Vec<String>> {
    c.get_json("/gitignore/templates").await
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LicenseChoice {
    pub key: String,
    pub name: String,
}

pub async fn licenses(c: &GitHubClient) -> AppResult<Vec<LicenseChoice>> {
    c.get_json("/licenses?per_page=100").await
}


pub async fn set_description(c: &GitHubClient, full_name: &str, description: &str) -> AppResult<()> {
    let d: String = description.trim().replace(['\n', '\r'], " ").chars().take(350).collect();
    patch(c, full_name, json!({ "description": d })).await
}


pub fn merged_topics(current: &[String], add: &[String], remove: &[String]) -> AppResult<Vec<String>> {
    let remove: Vec<String> = remove.iter().map(|t| super::about::normalize_topic(t)).collect();
    let mut all: Vec<String> = current.iter().filter(|t| !remove.contains(t)).cloned().collect();
    all.extend(add.iter().cloned());
    super::about::normalize_topics(&all)
}

pub async fn edit_topics(c: &GitHubClient, full_name: &str, add: &[String], remove: &[String]) -> AppResult<()> {
    let current = get(c, full_name).await?.topics.unwrap_or_default();
    let names = merged_topics(&current, add, remove)?;
    c.send_json(Method::PUT, &format!("/repos/{full_name}/topics"), Some(&json!({ "names": names }))).await.map(drop)
}

#[cfg(test)]
mod live_tests {

    #[tokio::test]
    #[ignore]
    async fn live_lists_all_pages() {
        let token = std::env::var("ZIT_TEST_TOKEN").expect("ZIT_TEST_TOKEN");
        let c = super::GitHubClient::new(token).unwrap();
        let repos = super::list_for_user(&c, false).await.unwrap();
        println!("repos: {}", repos.len());
        assert!(repos.len() > 100, "pagination stopped at {}", repos.len());

        let again = super::list_for_user(&c, false).await.unwrap();
        assert_eq!(again.len(), repos.len(), "cached pass stopped early");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn topic_edits() {
        let cur = vec!["rust".to_string(), "old".to_string()];
        assert_eq!(merged_topics(&cur, &["Tauri App".into(), "rust".into()], &["OLD".into()]).unwrap(), ["rust", "tauri-app"]);
    }

    #[test]
    fn repo_names() {
        for ok in ["ZIT-Suite", "my_repo.js", "a", ".github"] {
            assert!(valid_repo_name(ok), "{ok}");
        }
        for bad in ["", ".", "..", "has space", "ümlaut", "a/b"] {
            assert!(!valid_repo_name(bad), "{bad}");
        }
    }
}
