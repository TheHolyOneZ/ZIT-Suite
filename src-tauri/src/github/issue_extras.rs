use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;

use super::client::GitHubClient;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
pub struct TimelineEvent {
    pub id: String,


    pub event: String,
    pub actor: Option<String>,
    pub created_at: String,

    pub subject: Option<String>,
    pub color: Option<String>,

    pub from: Option<String>,

    pub source_title: Option<String>,
    pub source_url: Option<String>,
    pub state_reason: Option<String>,
}


const SHOWN: &[&str] = &[
    "labeled", "unlabeled", "assigned", "unassigned", "milestoned", "demilestoned", "renamed", "closed", "reopened", "cross-referenced",
    "referenced", "locked", "unlocked", "pinned", "unpinned", "transferred", "connected", "disconnected", "marked_as_duplicate",
];

pub fn parse_event(v: &Value) -> Option<TimelineEvent> {
    let event = v["event"].as_str()?.to_string();
    if !SHOWN.contains(&event.as_str()) {
        return None;
    }
    let s = |p: &str| v.pointer(p).and_then(Value::as_str).map(str::to_string);
    let created_at = s("/created_at").or_else(|| s("/updated_at"))?;
    let (subject, color) = match event.as_str() {
        "labeled" | "unlabeled" => (s("/label/name"), s("/label/color")),
        "assigned" | "unassigned" => (s("/assignee/login"), None),
        "milestoned" | "demilestoned" => (s("/milestone/title"), None),
        "renamed" => (s("/rename/to"), None),
        "referenced" | "closed" => (s("/commit_id").map(|c| c.chars().take(7).collect()), None),
        _ => (None, None),
    };
    Some(TimelineEvent {
        id: v["id"].as_u64().map(|x| x.to_string()).or_else(|| s("/node_id")).unwrap_or_else(|| format!("{event}-{created_at}")),
        actor: s("/actor/login"),
        created_at,
        subject,
        color,
        from: s("/rename/from"),
        source_title: s("/source/issue/title"),
        source_url: s("/source/issue/html_url"),
        state_reason: s("/state_reason"),
        event,
    })
}

pub async fn timeline(c: &GitHubClient, repo: &str, number: u32) -> AppResult<Vec<TimelineEvent>> {
    let raw: Vec<Value> = c.paginate(&format!("/repos/{repo}/issues/{number}/timeline?per_page=100")).await?;
    Ok(raw.iter().filter_map(parse_event).collect())
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Reaction {
    pub id: u64,

    pub content: String,
    pub user: String,
}


fn reactions_path(repo: &str, target: &str) -> AppResult<String> {
    match target.split_once('/') {
        Some(("issue", n)) => Ok(format!("/repos/{repo}/issues/{n}/reactions")),
        Some(("comment", id)) => Ok(format!("/repos/{repo}/issues/comments/{id}/reactions")),
        _ => Err(AppError::new("issues.bad_target").detail(target.to_string())),
    }
}

pub async fn reactions(c: &GitHubClient, repo: &str, target: &str, fresh: bool) -> AppResult<Vec<Reaction>> {
    let raw: Vec<Value> = c.paginate_with(&format!("{}?per_page=100", reactions_path(repo, target)?), fresh).await?;
    Ok(raw
        .iter()
        .map(|r| Reaction { id: r["id"].as_u64().unwrap_or(0), content: r["content"].as_str().unwrap_or_default().to_string(), user: r["user"]["login"].as_str().unwrap_or_default().to_string() })
        .collect())
}

pub async fn react(c: &GitHubClient, repo: &str, target: &str, content: &str) -> AppResult<()> {
    c.send_json(Method::POST, &reactions_path(repo, target)?, Some(&json!({ "content": content }))).await.map(drop)
}

pub async fn unreact(c: &GitHubClient, repo: &str, target: &str, id: u64) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("{}/{id}", reactions_path(repo, target)?), None).await.map(drop)
}

fn split(repo: &str) -> AppResult<(&str, &str)> {
    repo.split_once('/').ok_or_else(|| AppError::new("github.not_found"))
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct IssueExtras {
    pub node_id: String,
    pub pinned: bool,

    pub pinned_count: u32,
}

pub async fn extras(c: &GitHubClient, repo: &str, number: u32) -> AppResult<IssueExtras> {
    let (owner, name) = split(repo)?;
    let d = c
        .graphql(
            "query($o:String!,$n:String!,$num:Int!){repository(owner:$o,name:$n){pinnedIssues(first:3){totalCount} issue(number:$num){id isPinned}}}",
            json!({ "o": owner, "n": name, "num": number }),
        )
        .await?;
    let issue = &d["repository"]["issue"];
    Ok(IssueExtras {
        node_id: issue["id"].as_str().ok_or_else(|| AppError::new("github.not_found"))?.to_string(),
        pinned: issue["isPinned"].as_bool().unwrap_or(false),
        pinned_count: d["repository"]["pinnedIssues"]["totalCount"].as_u64().unwrap_or(0) as u32,
    })
}

pub async fn set_pinned(c: &GitHubClient, node_id: &str, pinned: bool) -> AppResult<()> {
    let m = if pinned { "mutation($id:ID!){pinIssue(input:{issueId:$id}){issue{id}}}" } else { "mutation($id:ID!){unpinIssue(input:{issueId:$id}){issue{id}}}" };
    c.graphql(m, json!({ "id": node_id })).await.map(drop)
}


pub async fn transfer(c: &GitHubClient, node_id: &str, to_repo: &str) -> AppResult<String> {
    let (owner, name) = split(to_repo)?;
    let r = c.graphql("query($o:String!,$n:String!){repository(owner:$o,name:$n){id}}", json!({ "o": owner, "n": name })).await?;
    let repo_id = r["repository"]["id"].as_str().ok_or_else(|| AppError::new("github.not_found").detail(to_repo.to_string()))?;
    let d = c
        .graphql("mutation($i:ID!,$r:ID!){transferIssue(input:{issueId:$i,repositoryId:$r}){issue{url}}}", json!({ "i": node_id, "r": repo_id }))
        .await?;
    Ok(d["transferIssue"]["issue"]["url"].as_str().unwrap_or_default().to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SubIssue {
    pub id: u64,
    pub number: u32,
    pub title: String,
    pub state: String,
    pub html_url: String,
}

pub async fn sub_issues(c: &GitHubClient, repo: &str, number: u32) -> AppResult<Vec<SubIssue>> {
    match c.paginate::<Value>(&format!("/repos/{repo}/issues/{number}/sub_issues?per_page=100")).await {
        Ok(raw) => Ok(raw
            .iter()
            .map(|v| SubIssue {
                id: v["id"].as_u64().unwrap_or(0),
                number: v["number"].as_u64().unwrap_or(0) as u32,
                title: v["title"].as_str().unwrap_or_default().to_string(),
                state: v["state"].as_str().unwrap_or("open").to_string(),
                html_url: v["html_url"].as_str().unwrap_or_default().to_string(),
            })
            .collect()),

        Err(e) if e.code == "github.not_found" => Ok(vec![]),
        Err(e) => Err(e),
    }
}


pub async fn add_sub_issue(c: &GitHubClient, repo: &str, number: u32, child: u32) -> AppResult<()> {
    let v: Value = c.get_json(&format!("/repos/{repo}/issues/{child}")).await?;
    let id = v["id"].as_u64().ok_or_else(|| AppError::new("github.not_found"))?;
    c.send_json(Method::POST, &format!("/repos/{repo}/issues/{number}/sub_issues"), Some(&json!({ "sub_issue_id": id }))).await.map(drop)
}

pub async fn remove_sub_issue(c: &GitHubClient, repo: &str, number: u32, sub_issue_id: u64) -> AppResult<()> {
    c.send_json(Method::DELETE, &format!("/repos/{repo}/issues/{number}/sub_issue"), Some(&json!({ "sub_issue_id": sub_issue_id }))).await.map(drop)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_meaningful_events() {
        let l = parse_event(&json!({ "id": 1, "event": "labeled", "actor": { "login": "z" }, "created_at": "2026-01-01T00:00:00Z", "label": { "name": "bug", "color": "d73a4a" } })).unwrap();
        assert_eq!((l.subject.as_deref(), l.color.as_deref()), (Some("bug"), Some("d73a4a")));
        let r = parse_event(&json!({ "event": "renamed", "created_at": "2026-01-01T00:00:00Z", "rename": { "from": "a", "to": "b" } })).unwrap();
        assert_eq!((r.from.as_deref(), r.subject.as_deref()), (Some("a"), Some("b")));
        let x = parse_event(&json!({ "event": "cross-referenced", "created_at": "2026-01-01T00:00:00Z", "source": { "issue": { "title": "T", "html_url": "u" } } })).unwrap();
        assert_eq!(x.source_title.as_deref(), Some("T"));
        assert!(parse_event(&json!({ "event": "subscribed", "created_at": "x" })).is_none());
        assert!(parse_event(&json!({ "event": "commented", "created_at": "x" })).is_none());
    }
}
