use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use specta::Type;

use super::client::GitHubClient;
use super::labels::{Label, Milestone};
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
pub struct SimpleUser {
    pub login: String,
    pub avatar_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Issue {

    pub repo: String,
    pub number: u32,
    pub title: String,
    pub body: Option<String>,

    pub state: String,

    pub state_reason: Option<String>,
    pub html_url: String,
    pub user: SimpleUser,
    pub labels: Vec<Label>,
    pub assignees: Vec<SimpleUser>,
    pub milestone: Option<Milestone>,
    pub comments: u32,
    pub locked: bool,
    pub author_association: String,
    pub reactions: u32,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
    pub is_pull_request: bool,
}

#[derive(Deserialize)]
struct IssueRaw {
    repository_url: String,
    number: u32,
    title: String,
    body: Option<String>,
    state: String,
    state_reason: Option<String>,
    html_url: String,
    user: Option<SimpleUser>,
    #[serde(default)]
    labels: Vec<Label>,
    #[serde(default)]
    assignees: Vec<SimpleUser>,
    milestone: Option<Milestone>,
    #[serde(default)]
    comments: u32,
    #[serde(default)]
    locked: bool,
    #[serde(default)]
    author_association: String,
    reactions: Option<ReactionsRaw>,
    created_at: String,
    updated_at: String,
    closed_at: Option<String>,
    pull_request: Option<Value>,
}

#[derive(Deserialize)]
struct ReactionsRaw {
    total_count: u32,
}

impl From<IssueRaw> for Issue {
    fn from(r: IssueRaw) -> Self {
        let repo = r.repository_url.split_once("/repos/").map(|x| x.1).unwrap_or_default().to_string();
        Issue {
            repo,
            number: r.number,
            title: r.title,
            body: r.body,
            state: r.state,
            state_reason: r.state_reason,
            html_url: r.html_url,
            user: r.user.unwrap_or(SimpleUser { login: "ghost".into(), avatar_url: String::new() }),
            labels: r.labels,
            assignees: r.assignees,
            milestone: r.milestone,
            comments: r.comments,
            locked: r.locked,
            author_association: r.author_association,
            reactions: r.reactions.map(|x| x.total_count).unwrap_or(0),
            created_at: r.created_at,
            updated_at: r.updated_at,
            closed_at: r.closed_at,
            is_pull_request: r.pull_request.is_some(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct IssueSearch {
    pub total_count: u32,
    pub incomplete_results: bool,
    pub items: Vec<Issue>,
}

#[derive(Deserialize)]
struct SearchRaw {
    total_count: u32,
    incomplete_results: bool,
    items: Vec<IssueRaw>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Comment {
    pub id: u64,
    pub user: SimpleUser,
    pub body: String,
    pub html_url: String,
    pub author_association: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
struct CommentRaw {
    id: u64,
    user: Option<SimpleUser>,
    #[serde(default)]
    body: String,
    html_url: String,
    #[serde(default)]
    author_association: String,
    created_at: String,
    updated_at: String,
}

impl From<CommentRaw> for Comment {
    fn from(r: CommentRaw) -> Self {
        Comment {
            id: r.id,
            user: r.user.unwrap_or(SimpleUser { login: "ghost".into(), avatar_url: String::new() }),
            body: r.body,
            html_url: r.html_url,
            author_association: r.author_association,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct NewIssue {
    pub title: String,
    pub body: Option<String>,
    pub labels: Vec<String>,
    pub assignees: Vec<String>,
    pub milestone: Option<u32>,
}


#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
pub struct IssuePatch {
    pub title: Option<String>,
    pub body: Option<String>,

    pub state: Option<String>,

    pub state_reason: Option<String>,

    pub labels: Option<Vec<String>>,

    pub assignees: Option<Vec<String>>,
    pub milestone: Option<u32>,
    pub clear_milestone: bool,
}

impl IssuePatch {
    pub fn to_json(&self) -> Value {
        let mut m = Map::new();
        if let Some(v) = &self.title {
            m.insert("title".into(), json!(v));
        }
        if let Some(v) = &self.body {
            m.insert("body".into(), json!(v));
        }
        if let Some(v) = &self.state {
            m.insert("state".into(), json!(v));
        }
        if let Some(v) = &self.state_reason {
            m.insert("state_reason".into(), json!(v));
        }
        if let Some(v) = &self.labels {
            m.insert("labels".into(), json!(v));
        }
        if let Some(v) = &self.assignees {
            m.insert("assignees".into(), json!(v));
        }
        if self.clear_milestone {
            m.insert("milestone".into(), Value::Null);
        } else if let Some(v) = self.milestone {
            m.insert("milestone".into(), json!(v));
        }
        Value::Object(m)
    }
}

pub const SEARCH_PER_PAGE: u32 = 50;


pub async fn search(c: &GitHubClient, query: &str, sort: &str, order: &str, page: u32) -> AppResult<IssueSearch> {
    let mut q = vec![
        ("q", query.to_string()),
        ("per_page", SEARCH_PER_PAGE.to_string()),
        ("page", page.max(1).to_string()),
    ];
    if sort != "best-match" {
        q.push(("sort", sort.to_string()));
        q.push(("order", order.to_string()));
    }
    let raw: SearchRaw = c.get_json_query("/search/issues", &q).await?;
    Ok(IssueSearch {
        total_count: raw.total_count,
        incomplete_results: raw.incomplete_results,
        items: raw.items.into_iter().map(Into::into).collect(),
    })
}

pub async fn get(c: &GitHubClient, repo: &str, number: u32) -> AppResult<Issue> {
    let raw: IssueRaw = c.get_json(&format!("/repos/{repo}/issues/{number}")).await?;
    Ok(raw.into())
}

fn issue_from(v: Option<Value>) -> AppResult<Issue> {
    let raw: IssueRaw = serde_json::from_value(v.unwrap_or_default())?;
    Ok(raw.into())
}

pub async fn create(c: &GitHubClient, repo: &str, input: &NewIssue) -> AppResult<Issue> {
    let mut body = json!({ "title": input.title, "labels": input.labels, "assignees": input.assignees });
    if let Some(b) = &input.body {
        body["body"] = json!(b);
    }
    if let Some(m) = input.milestone {
        body["milestone"] = json!(m);
    }
    issue_from(c.send_json(Method::POST, &format!("/repos/{repo}/issues"), Some(&body)).await?)
}

pub async fn update(c: &GitHubClient, repo: &str, number: u32, patch: &IssuePatch) -> AppResult<Issue> {
    issue_from(c.send_json(Method::PATCH, &format!("/repos/{repo}/issues/{number}"), Some(&patch.to_json())).await?)
}

pub async fn add_labels(c: &GitHubClient, repo: &str, number: u32, labels: &[String]) -> AppResult<()> {
    c.send_json(Method::POST, &format!("/repos/{repo}/issues/{number}/labels"), Some(&json!({ "labels": labels })))
        .await?;
    Ok(())
}

pub async fn remove_label(c: &GitHubClient, repo: &str, number: u32, label: &str) -> AppResult<()> {
    let path = format!("/repos/{repo}/issues/{number}/labels/{}", super::client::enc(label));
    c.send_json::<()>(Method::DELETE, &path, None).await?;
    Ok(())
}

pub async fn add_assignees(c: &GitHubClient, repo: &str, number: u32, assignees: &[String]) -> AppResult<()> {
    let body = json!({ "assignees": assignees });
    c.send_json(Method::POST, &format!("/repos/{repo}/issues/{number}/assignees"), Some(&body)).await?;
    Ok(())
}

pub async fn remove_assignees(c: &GitHubClient, repo: &str, number: u32, assignees: &[String]) -> AppResult<()> {
    let body = json!({ "assignees": assignees });
    c.send_json(Method::DELETE, &format!("/repos/{repo}/issues/{number}/assignees"), Some(&body)).await?;
    Ok(())
}

pub async fn set_locked(c: &GitHubClient, repo: &str, number: u32, locked: bool) -> AppResult<()> {
    let path = format!("/repos/{repo}/issues/{number}/lock");
    if locked {
        c.send_json(Method::PUT, &path, Some(&json!({}))).await?;
    } else {
        c.send_json::<()>(Method::DELETE, &path, None).await?;
    }
    Ok(())
}

pub async fn comments(c: &GitHubClient, repo: &str, number: u32) -> AppResult<Vec<Comment>> {
    let raw: Vec<CommentRaw> = c.paginate_with(&format!("/repos/{repo}/issues/{number}/comments?per_page=100"), true).await?;
    Ok(raw.into_iter().map(Into::into).collect())
}

fn comment_from(v: Option<Value>) -> AppResult<Comment> {
    let raw: CommentRaw = serde_json::from_value(v.unwrap_or_default())?;
    Ok(raw.into())
}

pub async fn create_comment(c: &GitHubClient, repo: &str, number: u32, body: &str) -> AppResult<Comment> {
    let path = format!("/repos/{repo}/issues/{number}/comments");
    comment_from(c.send_json(Method::POST, &path, Some(&json!({ "body": body }))).await?)
}

pub async fn update_comment(c: &GitHubClient, repo: &str, id: u64, body: &str) -> AppResult<Comment> {
    let path = format!("/repos/{repo}/issues/comments/{id}");
    comment_from(c.send_json(Method::PATCH, &path, Some(&json!({ "body": body }))).await?)
}

pub async fn delete_comment(c: &GitHubClient, repo: &str, id: u64) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/repos/{repo}/issues/comments/{id}"), None).await?;
    Ok(())
}

pub async fn assignable(c: &GitHubClient, repo: &str) -> AppResult<Vec<SimpleUser>> {
    c.paginate(&format!("/repos/{repo}/assignees?per_page=100")).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_serializes_only_set_fields() {
        let p = IssuePatch { state: Some("closed".into()), state_reason: Some("not_planned".into()), ..Default::default() };
        assert_eq!(p.to_json(), json!({ "state": "closed", "state_reason": "not_planned" }));
        let p = IssuePatch { clear_milestone: true, milestone: Some(3), ..Default::default() };
        assert_eq!(p.to_json(), json!({ "milestone": null }));
    }

    #[test]
    fn derives_repo_from_repository_url() {
        let raw: IssueRaw = serde_json::from_value(json!({
            "repository_url": "https://api.github.com/repos/octo/hello", "number": 7, "title": "t", "body": null,
            "state": "open", "state_reason": null, "html_url": "h", "user": { "login": "u", "avatar_url": "" },
            "created_at": "x", "updated_at": "y", "closed_at": null
        }))
        .unwrap();
        let i: Issue = raw.into();
        assert_eq!(i.repo, "octo/hello");
        assert!(!i.is_pull_request);
    }
}
