use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;

use super::client::{enc, GitHubClient};
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BranchPr {
    pub number: u32,
    pub title: String,
    pub draft: bool,
    pub base: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RemoteBranch {
    pub name: String,
    pub sha: String,

    pub date: Option<String>,
    pub message: String,
    pub author: Option<String>,
    pub author_login: Option<String>,

    pub protected: bool,
    pub rule: Option<String>,

    pub prs: u32,
    pub pr: Option<BranchPr>,

    pub ahead: Option<u32>,
    pub behind: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BranchList {
    pub default_branch: Option<String>,
    pub branches: Vec<RemoteBranch>,

    pub truncated: bool,
}

const QUERY: &str = r#"
query($owner: String!, $name: String!, $after: String, $base: String!, $hasBase: Boolean!) {
  repository(owner: $owner, name: $name) {
    refs(refPrefix: "refs/heads/", first: 100, after: $after, orderBy: {field: TAG_COMMIT_DATE, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        branchProtectionRule { pattern }
        target { ... on Commit { oid committedDate messageHeadline author { name user { login } } } }
        associatedPullRequests(states: OPEN, first: 1) { totalCount nodes { number title isDraft baseRefName } }
        compare(headRef: $base) @include(if: $hasBase) { aheadBy behindBy }
      }
    }
  }
}"#;

const MAX_PAGES: usize = 10;

fn split(repo: &str) -> AppResult<(&str, &str)> {
    repo.split_once('/').ok_or_else(|| AppError::new("github.not_found"))
}


pub async fn list(c: &GitHubClient, repo: &str, default_branch: Option<&str>) -> AppResult<BranchList> {
    let (owner, name) = split(repo)?;
    let mut out = Vec::new();
    let mut after: Option<String> = None;
    let mut truncated = false;
    for page in 0.. {
        let vars = json!({ "owner": owner, "name": name, "after": after, "base": default_branch.unwrap_or(""), "hasBase": default_branch.is_some() });
        let d = c.graphql(QUERY, vars).await?;
        let refs = &d["repository"]["refs"];
        if refs.is_null() {
            return Err(AppError::new("github.not_found"));
        }
        out.extend(refs["nodes"].as_array().into_iter().flatten().map(parse_node));
        if refs["pageInfo"]["hasNextPage"].as_bool() != Some(true) {
            break;
        }
        if page + 1 == MAX_PAGES {
            truncated = true;
            break;
        }
        after = refs["pageInfo"]["endCursor"].as_str().map(str::to_string);
    }
    Ok(BranchList { default_branch: default_branch.map(str::to_string), branches: out, truncated })
}

fn parse_node(n: &Value) -> RemoteBranch {
    let s = |v: &Value| v.as_str().map(str::to_string);
    let t = &n["target"];
    let pr = &n["associatedPullRequests"];

    let cmp = &n["compare"];
    RemoteBranch {
        name: s(&n["name"]).unwrap_or_default(),
        sha: s(&t["oid"]).unwrap_or_default(),
        date: s(&t["committedDate"]),
        message: s(&t["messageHeadline"]).unwrap_or_default(),
        author: s(&t["author"]["name"]),
        author_login: s(&t["author"]["user"]["login"]),
        protected: !n["branchProtectionRule"].is_null(),
        rule: s(&n["branchProtectionRule"]["pattern"]),
        prs: pr["totalCount"].as_u64().unwrap_or(0) as u32,
        pr: pr["nodes"].get(0).map(|p| BranchPr {
            number: p["number"].as_u64().unwrap_or(0) as u32,
            title: s(&p["title"]).unwrap_or_default(),
            draft: p["isDraft"].as_bool().unwrap_or(false),
            base: s(&p["baseRefName"]).unwrap_or_default(),
        }),
        ahead: cmp["behindBy"].as_u64().map(|x| x as u32),
        behind: cmp["aheadBy"].as_u64().map(|x| x as u32),
    }
}

pub fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 250
        && !name.starts_with(['/', '-', '.'])
        && !name.ends_with(['/', '.'])
        && !name.ends_with(".lock")
        && !name.contains("..")
        && !name.contains("//")
        && !name.contains("@{")
        && name != "@"
        && !name.chars().any(|ch| ch.is_control() || ch.is_whitespace() || "~^:?*[\\".contains(ch))
}


pub async fn head(c: &GitHubClient, repo: &str, branch: &str) -> AppResult<String> {
    let v: Value = c.get_json(&format!("/repos/{repo}/git/ref/heads/{}", branch.split('/').map(enc).collect::<Vec<_>>().join("/"))).await?;
    v["object"]["sha"].as_str().map(str::to_string).ok_or_else(|| AppError::new("github.not_found"))
}


pub async fn create(c: &GitHubClient, repo: &str, name: &str, from: Option<&str>) -> AppResult<()> {
    if !valid_name(name) {
        return Err(AppError::new("branches.bad_name").detail(name.to_string()));
    }
    let from = match from {
        Some(f) => f.to_string(),
        None => super::repos::get(c, repo).await?.default_branch.ok_or_else(|| AppError::new("branches.empty_repo"))?,
    };
    let sha = head(c, repo, &from).await?;
    c.send_json(Method::POST, &format!("/repos/{repo}/git/refs"), Some(&json!({ "ref": format!("refs/heads/{name}"), "sha": sha })))
        .await
        .map_err(|e| if e.code == "github.validation" { AppError::new("branches.exists").detail(name.to_string()) } else { e })
        .map(drop)
}


pub async fn rename(c: &GitHubClient, repo: &str, from: &str, to: &str) -> AppResult<()> {
    if !valid_name(to) {
        return Err(AppError::new("branches.bad_name").detail(to.to_string()));
    }
    c.send_json(Method::POST, &format!("/repos/{repo}/branches/{}/rename", enc(from)), Some(&json!({ "new_name": to }))).await.map(drop)
}

pub async fn delete(c: &GitHubClient, repo: &str, name: &str) -> AppResult<()> {
    let path = name.split('/').map(enc).collect::<Vec<_>>().join("/");
    c.send_json::<()>(Method::DELETE, &format!("/repos/{repo}/git/refs/heads/{path}"), None).await.map(drop)
}

pub async fn set_default(c: &GitHubClient, repo: &str, name: &str) -> AppResult<()> {
    c.send_json(Method::PATCH, &format!("/repos/{repo}"), Some(&json!({ "default_branch": name }))).await.map(drop)
}


#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
pub struct Protection {
    pub require_pr: bool,
    pub approvals: u8,
    pub dismiss_stale: bool,
    pub code_owners: bool,
    pub last_push_approval: bool,
    pub status_checks: bool,

    pub strict: bool,
    pub contexts: Vec<String>,
    pub enforce_admins: bool,
    pub linear_history: bool,
    pub conversation_resolution: bool,
    pub force_pushes: bool,
    pub deletions: bool,
}

fn unavailable(e: AppError) -> AppError {
    let d = e.detail.as_deref().unwrap_or("").to_lowercase();
    if e.code == "github.forbidden" && (d.contains("upgrade") || d.contains("github pro") || d.contains("not available")) {
        AppError::new("branches.protection_unavailable")
    } else {
        e
    }
}

fn path_of(branch: &str) -> String {
    enc(branch)
}


pub async fn protection(c: &GitHubClient, repo: &str, branch: &str) -> AppResult<Option<Protection>> {
    match c.get_json::<Value>(&format!("/repos/{repo}/branches/{}/protection", path_of(branch))).await {
        Ok(v) => Ok(Some(parse_protection(&v))),
        Err(e) if e.code == "github.not_found" => Ok(None),
        Err(e) => Err(unavailable(e)),
    }
}

pub fn parse_protection(v: &Value) -> Protection {
    let on = |k: &str| v[k]["enabled"].as_bool().unwrap_or(false);
    let pr = &v["required_pull_request_reviews"];
    let sc = &v["required_status_checks"];
    let mut contexts: Vec<String> = sc["contexts"].as_array().into_iter().flatten().filter_map(|x| x.as_str().map(str::to_string)).collect();
    for ch in sc["checks"].as_array().into_iter().flatten() {
        if let Some(n) = ch["context"].as_str() {
            if !contexts.iter().any(|c| c == n) {
                contexts.push(n.to_string());
            }
        }
    }
    Protection {
        require_pr: !pr.is_null(),
        approvals: pr["required_approving_review_count"].as_u64().unwrap_or(0) as u8,
        dismiss_stale: pr["dismiss_stale_reviews"].as_bool().unwrap_or(false),
        code_owners: pr["require_code_owner_reviews"].as_bool().unwrap_or(false),
        last_push_approval: pr["require_last_push_approval"].as_bool().unwrap_or(false),
        status_checks: !sc.is_null(),
        strict: sc["strict"].as_bool().unwrap_or(false),
        contexts,
        enforce_admins: on("enforce_admins"),
        linear_history: on("required_linear_history"),
        conversation_resolution: on("required_conversation_resolution"),
        force_pushes: on("allow_force_pushes"),
        deletions: on("allow_deletions"),
    }
}

pub fn protection_body(p: &Protection) -> Value {
    json!({
        "required_status_checks": if p.status_checks { json!({ "strict": p.strict, "contexts": p.contexts }) } else { Value::Null },
        "enforce_admins": p.enforce_admins,
        "required_pull_request_reviews": if p.require_pr {
            json!({
                "dismiss_stale_reviews": p.dismiss_stale,
                "require_code_owner_reviews": p.code_owners,
                "required_approving_review_count": p.approvals.min(6),
                "require_last_push_approval": p.last_push_approval,
            })
        } else { Value::Null },
        "restrictions": Value::Null,
        "required_linear_history": p.linear_history,
        "allow_force_pushes": p.force_pushes,
        "allow_deletions": p.deletions,
        "required_conversation_resolution": p.conversation_resolution,
    })
}

pub async fn protect(c: &GitHubClient, repo: &str, branch: &str, p: &Protection) -> AppResult<()> {
    c.send_json(Method::PUT, &format!("/repos/{repo}/branches/{}/protection", path_of(branch)), Some(&protection_body(p))).await.map(drop).map_err(unavailable)
}

pub async fn unprotect(c: &GitHubClient, repo: &str, branch: &str) -> AppResult<()> {
    match c.send_json::<()>(Method::DELETE, &format!("/repos/{repo}/branches/{}/protection", path_of(branch)), None).await {
        Ok(_) => Ok(()),
        Err(e) if e.code == "github.not_found" => Ok(()),
        Err(e) => Err(unavailable(e)),
    }
}


pub async fn check_names(c: &GitHubClient, repo: &str, sha: &str) -> AppResult<Vec<String>> {
    let v: Value = c.get_json(&format!("/repos/{repo}/commits/{sha}/check-runs?per_page=100")).await?;
    let mut names: Vec<String> = v["check_runs"].as_array().into_iter().flatten().filter_map(|r| r["name"].as_str().map(str::to_string)).collect();
    names.sort();
    names.dedup();
    Ok(names)
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Ruleset {
    pub id: u64,
    pub name: String,

    pub enforcement: String,
    pub target: Option<String>,

    #[serde(default)]
    pub source_type: Option<String>,
}


pub async fn rulesets(c: &GitHubClient, repo: &str) -> AppResult<Vec<Ruleset>> {
    match c.get_json::<Vec<Ruleset>>(&format!("/repos/{repo}/rulesets?includes_parents=true&per_page=100")).await {
        Ok(v) => Ok(v),
        Err(e) if matches!(e.code.as_str(), "github.not_found" | "github.forbidden") => Ok(vec![]),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn branch_names() {
        for ok in ["main", "feature/x", "fix-1.2", "release/v1.0"] {
            assert!(valid_name(ok), "{ok}");
        }
        for bad in ["", "-x", "a..b", "a b", "x.lock", "a//b", "x/", "a~1", "a:b", "@", "a@{b"] {
            assert!(!valid_name(bad), "{bad}");
        }
    }

    #[test]
    fn node_ahead_behind_are_from_the_branch_side() {
        let n = json!({
            "name": "dev", "branchProtectionRule": null,
            "target": { "oid": "abc", "committedDate": "2026-01-01T00:00:00Z", "messageHeadline": "x", "author": { "name": "A", "user": { "login": "a" } } },
            "associatedPullRequests": { "totalCount": 1, "nodes": [{ "number": 7, "title": "T", "isDraft": false, "baseRefName": "main" }] },
            "compare": { "aheadBy": 3, "behindBy": 2 }
        });
        let b = parse_node(&n);
        assert_eq!((b.ahead, b.behind), (Some(2), Some(3)));
        assert_eq!(b.pr.unwrap().number, 7);
        assert!(!b.protected);
    }

    #[test]
    fn protection_round_trip() {
        let p = Protection { require_pr: true, approvals: 1, status_checks: true, strict: true, contexts: vec!["build".into()], linear_history: true, ..Default::default() };
        let body = protection_body(&p);

        let answer = json!({
            "required_status_checks": body["required_status_checks"],
            "required_pull_request_reviews": body["required_pull_request_reviews"],
            "enforce_admins": { "enabled": false },
            "required_linear_history": { "enabled": true },
            "allow_force_pushes": { "enabled": false },
            "allow_deletions": { "enabled": false },
            "required_conversation_resolution": { "enabled": false }
        });
        assert_eq!(parse_protection(&answer), p);
        assert!(protection_body(&Protection::default())["required_pull_request_reviews"].is_null());
    }
}
