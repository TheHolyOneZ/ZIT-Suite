use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;

use super::client::GitHubClient;
use super::issues::SimpleUser;
use super::labels::Label;
use crate::error::{AppError, AppResult};


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PullSummary {
    pub repo: String,
    pub number: u32,
    pub title: String,
    pub url: String,

    pub state: String,
    pub is_draft: bool,
    pub author: Option<SimpleUser>,
    pub head_ref: String,
    pub base_ref: String,
    pub additions: u32,
    pub deletions: u32,
    pub changed_files: u32,
    pub comments: u32,

    pub review_decision: Option<String>,

    pub mergeable: String,

    pub checks: Option<String>,
    pub labels: Vec<Label>,
    pub assignees: Vec<SimpleUser>,
    pub created_at: String,
    pub updated_at: String,
    pub merged_at: Option<String>,
    pub closed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PullSearch {
    pub total_count: u32,
    pub items: Vec<PullSummary>,
    pub end_cursor: Option<String>,
    pub has_next: bool,
}

const SEARCH_QUERY: &str = r#"
query($q: String!, $first: Int!, $after: String) {
  search(query: $q, type: ISSUE, first: $first, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number title url state isDraft createdAt updatedAt mergedAt closedAt
        repository { nameWithOwner }
        author { login avatarUrl }
        headRefName baseRefName additions deletions changedFiles
        comments { totalCount }
        reviewDecision mergeable
        labels(first: 12) { nodes { name color description } }
        assignees(first: 6) { nodes { login avatarUrl } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
}"#;

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(Value::as_str).unwrap_or_default().to_string()
}
fn os(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(Value::as_str).map(str::to_string)
}
fn n(v: &Value, k: &str) -> u32 {
    v.get(k).and_then(Value::as_u64).unwrap_or(0) as u32
}
fn user(v: &Value) -> Option<SimpleUser> {
    v.as_object()?;
    Some(SimpleUser { login: s(v, "login"), avatar_url: s(v, "avatarUrl") })
}

pub fn parse_summary(node: &Value) -> Option<PullSummary> {
    node.get("number")?;
    Some(PullSummary {
        repo: node.pointer("/repository/nameWithOwner").and_then(Value::as_str).unwrap_or_default().to_string(),
        number: n(node, "number"),
        title: s(node, "title"),
        url: s(node, "url"),
        state: s(node, "state"),
        is_draft: node.get("isDraft").and_then(Value::as_bool).unwrap_or(false),
        author: node.get("author").and_then(user),
        head_ref: s(node, "headRefName"),
        base_ref: s(node, "baseRefName"),
        additions: n(node, "additions"),
        deletions: n(node, "deletions"),
        changed_files: n(node, "changedFiles"),
        comments: node.pointer("/comments/totalCount").and_then(Value::as_u64).unwrap_or(0) as u32,
        review_decision: os(node, "reviewDecision"),
        mergeable: s(node, "mergeable"),
        checks: node.pointer("/commits/nodes/0/commit/statusCheckRollup/state").and_then(Value::as_str).map(str::to_string),
        labels: node
            .pointer("/labels/nodes")
            .and_then(Value::as_array)
            .map(|a| a.iter().map(|l| Label { name: s(l, "name"), color: s(l, "color"), description: os(l, "description") }).collect())
            .unwrap_or_default(),
        assignees: node.pointer("/assignees/nodes").and_then(Value::as_array).map(|a| a.iter().filter_map(user).collect()).unwrap_or_default(),
        created_at: s(node, "createdAt"),
        updated_at: s(node, "updatedAt"),
        merged_at: os(node, "mergedAt"),
        closed_at: os(node, "closedAt"),
    })
}

pub async fn search(c: &GitHubClient, query: &str, after: Option<String>) -> AppResult<PullSearch> {
    let data = c.graphql(SEARCH_QUERY, json!({ "q": query, "first": 40, "after": after })).await?;
    let search = data.get("search").cloned().unwrap_or_default();
    Ok(PullSearch {
        total_count: n(&search, "issueCount"),
        items: search.get("nodes").and_then(Value::as_array).map(|a| a.iter().filter_map(parse_summary).collect()).unwrap_or_default(),
        end_cursor: search.pointer("/pageInfo/endCursor").and_then(Value::as_str).map(str::to_string),
        has_next: search.pointer("/pageInfo/hasNextPage").and_then(Value::as_bool).unwrap_or(false),
    })
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BranchRef {
    #[serde(rename = "ref")]
    #[specta(rename = "ref")]
    pub ref_name: String,
    pub sha: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Pull {
    pub repo: String,
    pub number: u32,
    pub node_id: String,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub draft: bool,
    pub merged: bool,
    pub mergeable: Option<bool>,

    pub mergeable_state: String,
    pub html_url: String,
    pub user: SimpleUser,
    pub head: BranchRef,
    pub base: BranchRef,
    pub labels: Vec<Label>,
    pub assignees: Vec<SimpleUser>,
    pub requested_reviewers: Vec<SimpleUser>,
    pub milestone: Option<super::labels::Milestone>,
    pub comments: u32,
    pub review_comments: u32,
    pub commits: u32,
    pub additions: u32,
    pub deletions: u32,
    pub changed_files: u32,
    pub auto_merge: bool,

    pub auto_merge_method: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
    pub merged_at: Option<String>,
    pub merged_by: Option<SimpleUser>,
}

#[derive(Deserialize)]
struct PullRaw {
    number: u32,
    node_id: String,
    title: String,
    body: Option<String>,
    state: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    merged: bool,
    mergeable: Option<bool>,
    #[serde(default)]
    mergeable_state: String,
    html_url: String,
    user: Option<SimpleUser>,
    head: BranchRef,
    base: BranchRaw,
    #[serde(default)]
    labels: Vec<Label>,
    #[serde(default)]
    assignees: Vec<SimpleUser>,
    #[serde(default)]
    requested_reviewers: Vec<SimpleUser>,
    milestone: Option<super::labels::Milestone>,
    #[serde(default)]
    comments: u32,
    #[serde(default)]
    review_comments: u32,
    #[serde(default)]
    commits: u32,
    #[serde(default)]
    additions: u32,
    #[serde(default)]
    deletions: u32,
    #[serde(default)]
    changed_files: u32,
    auto_merge: Option<Value>,
    created_at: String,
    updated_at: String,
    closed_at: Option<String>,
    merged_at: Option<String>,
    merged_by: Option<SimpleUser>,
}

#[derive(Deserialize)]
struct BranchRaw {
    #[serde(rename = "ref")]
    ref_name: String,
    sha: String,
    label: String,
    repo: Option<RepoName>,
}

#[derive(Deserialize)]
struct RepoName {
    full_name: String,
}

impl From<PullRaw> for Pull {
    fn from(r: PullRaw) -> Self {
        Pull {
            repo: r.base.repo.as_ref().map(|x| x.full_name.clone()).unwrap_or_default(),
            number: r.number,
            node_id: r.node_id,
            title: r.title,
            body: r.body,
            state: r.state,
            draft: r.draft,
            merged: r.merged,
            mergeable: r.mergeable,
            mergeable_state: r.mergeable_state,
            html_url: r.html_url,
            user: r.user.unwrap_or(SimpleUser { login: "ghost".into(), avatar_url: String::new() }),
            head: r.head,
            base: BranchRef { ref_name: r.base.ref_name, sha: r.base.sha, label: r.base.label },
            labels: r.labels,
            assignees: r.assignees,
            requested_reviewers: r.requested_reviewers,
            milestone: r.milestone,
            comments: r.comments,
            review_comments: r.review_comments,
            commits: r.commits,
            additions: r.additions,
            deletions: r.deletions,
            changed_files: r.changed_files,
            auto_merge: r.auto_merge.as_ref().is_some_and(|v| !v.is_null()),
            auto_merge_method: r.auto_merge.as_ref().and_then(|v| v.get("merge_method")).and_then(Value::as_str).map(str::to_uppercase),
            created_at: r.created_at,
            updated_at: r.updated_at,
            closed_at: r.closed_at,
            merged_at: r.merged_at,
            merged_by: r.merged_by,
        }
    }
}

pub async fn get(c: &GitHubClient, repo: &str, number: u32) -> AppResult<Pull> {
    let raw: PullRaw = c.get_json(&format!("/repos/{repo}/pulls/{number}")).await?;
    Ok(raw.into())
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct MergeSettings {
    pub merge: bool,
    pub squash: bool,
    pub rebase: bool,
    pub auto_merge: bool,
}

pub async fn merge_settings(c: &GitHubClient, repo: &str) -> AppResult<MergeSettings> {
    let v: Value = c.get_json(&format!("/repos/{repo}")).await?;
    let flag = |k: &str| v.get(k).and_then(Value::as_bool).unwrap_or(true);
    Ok(MergeSettings {
        merge: flag("allow_merge_commit"),
        squash: flag("allow_squash_merge"),
        rebase: flag("allow_rebase_merge"),
        auto_merge: flag("allow_auto_merge"),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PullFile {
    pub filename: String,
    pub previous_filename: Option<String>,

    pub status: String,
    pub additions: u32,
    pub deletions: u32,

    pub patch: Option<String>,
}

pub async fn files(c: &GitHubClient, repo: &str, number: u32) -> AppResult<Vec<PullFile>> {
    c.paginate_with(&format!("/repos/{repo}/pulls/{number}/files?per_page=100"), true).await
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PullCommit {
    pub sha: String,
    pub message: String,
    pub author: Option<SimpleUser>,
    pub author_name: String,
    pub date: String,
    pub html_url: String,
}

pub async fn commits(c: &GitHubClient, repo: &str, number: u32) -> AppResult<Vec<PullCommit>> {
    let raw: Vec<Value> = c.paginate_with(&format!("/repos/{repo}/pulls/{number}/commits?per_page=100"), true).await?;
    Ok(raw
        .iter()
        .map(|v| PullCommit {
            sha: s(v, "sha"),
            message: v.pointer("/commit/message").and_then(Value::as_str).unwrap_or_default().to_string(),
            author: v.get("author").and_then(|a| serde_json::from_value(a.clone()).ok()),
            author_name: v.pointer("/commit/author/name").and_then(Value::as_str).unwrap_or_default().to_string(),
            date: v.pointer("/commit/author/date").and_then(Value::as_str).unwrap_or_default().to_string(),
            html_url: s(v, "html_url"),
        })
        .collect())
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Review {
    pub id: u64,
    pub user: SimpleUser,
    pub body: String,

    pub state: String,
    pub submitted_at: Option<String>,
    pub html_url: String,
}

#[derive(Deserialize)]
struct ReviewRaw {
    id: u64,
    user: Option<SimpleUser>,
    #[serde(default)]
    body: String,
    state: String,
    submitted_at: Option<String>,
    html_url: String,
}

pub async fn reviews(c: &GitHubClient, repo: &str, number: u32) -> AppResult<Vec<Review>> {
    let raw: Vec<ReviewRaw> = c.paginate_with(&format!("/repos/{repo}/pulls/{number}/reviews?per_page=100"), true).await?;
    Ok(raw
        .into_iter()
        .map(|r| Review {
            id: r.id,
            user: r.user.unwrap_or(SimpleUser { login: "ghost".into(), avatar_url: String::new() }),
            body: r.body,
            state: r.state,
            submitted_at: r.submitted_at,
            html_url: r.html_url,
        })
        .collect())
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DraftComment {
    pub path: String,
    pub line: u32,

    pub side: String,
    pub start_line: Option<u32>,
    pub body: String,
}

pub fn review_payload(event: &str, body: &str, comments: &[DraftComment]) -> Value {
    let cs: Vec<Value> = comments
        .iter()
        .map(|d| {
            let mut c = json!({ "path": d.path, "line": d.line, "side": d.side, "body": d.body });
            if let Some(s) = d.start_line.filter(|s| *s < d.line) {
                c["start_line"] = json!(s);
                c["start_side"] = json!(d.side);
            }
            c
        })
        .collect();
    let mut p = json!({ "event": event, "body": body });
    if !cs.is_empty() {
        p["comments"] = Value::Array(cs);
    }
    p
}


pub async fn submit_review(c: &GitHubClient, repo: &str, number: u32, event: &str, body: &str, comments: &[DraftComment]) -> AppResult<()> {
    let payload = review_payload(event, body, comments);
    c.send_json(Method::POST, &format!("/repos/{repo}/pulls/{number}/reviews"), Some(&payload)).await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CheckRun {
    pub name: String,

    pub status: String,

    pub conclusion: Option<String>,
    pub html_url: Option<String>,
    pub app: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

pub async fn checks(c: &GitHubClient, repo: &str, sha: &str) -> AppResult<Vec<CheckRun>> {
    let v: Value = c.get_json(&format!("/repos/{repo}/commits/{sha}/check-runs?per_page=100")).await?;
    Ok(v.get("check_runs")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .map(|r| CheckRun {
                    name: s(r, "name"),
                    status: s(r, "status"),
                    conclusion: os(r, "conclusion"),
                    html_url: os(r, "html_url"),
                    app: r.pointer("/app/name").and_then(Value::as_str).map(str::to_string),
                    started_at: os(r, "started_at"),
                    completed_at: os(r, "completed_at"),
                })
                .collect()
        })
        .unwrap_or_default())
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MergeMethod {
    Merge,
    Squash,
    Rebase,
}

pub async fn merge(c: &GitHubClient, repo: &str, number: u32, method: MergeMethod) -> AppResult<()> {
    let m = match method {
        MergeMethod::Merge => "merge",
        MergeMethod::Squash => "squash",
        MergeMethod::Rebase => "rebase",
    };
    c.send_json(Method::PUT, &format!("/repos/{repo}/pulls/{number}/merge"), Some(&json!({ "merge_method": m })))
        .await
        .map_err(|e| if e.code == "github.http" && e.status == Some(405) { AppError::new("pulls.not_mergeable").detail(e.detail.unwrap_or_default()) } else { e })?;
    Ok(())
}

pub async fn set_state(c: &GitHubClient, repo: &str, number: u32, open: bool) -> AppResult<()> {
    let body = json!({ "state": if open { "open" } else { "closed" } });
    c.send_json(Method::PATCH, &format!("/repos/{repo}/pulls/{number}"), Some(&body)).await?;
    Ok(())
}

pub async fn update(c: &GitHubClient, repo: &str, number: u32, title: Option<String>, body: Option<String>, base: Option<String>) -> AppResult<Pull> {
    let mut b = serde_json::Map::new();
    if let Some(t) = title {
        b.insert("title".into(), json!(t));
    }
    if let Some(t) = body {
        b.insert("body".into(), json!(t));
    }
    if let Some(t) = base {
        b.insert("base".into(), json!(t));
    }
    let v = c.send_json(Method::PATCH, &format!("/repos/{repo}/pulls/{number}"), Some(&Value::Object(b))).await?;
    let raw: PullRaw = serde_json::from_value(v.unwrap_or_default())?;
    Ok(raw.into())
}

pub async fn update_branch(c: &GitHubClient, repo: &str, number: u32) -> AppResult<()> {
    c.send_json(Method::PUT, &format!("/repos/{repo}/pulls/{number}/update-branch"), Some(&json!({}))).await?;
    Ok(())
}

pub async fn request_reviewers(c: &GitHubClient, repo: &str, number: u32, reviewers: &[String], remove: bool) -> AppResult<()> {
    let method = if remove { Method::DELETE } else { Method::POST };
    c.send_json(method, &format!("/repos/{repo}/pulls/{number}/requested_reviewers"), Some(&json!({ "reviewers": reviewers }))).await?;
    Ok(())
}


pub async fn set_draft(c: &GitHubClient, node_id: &str, draft: bool) -> AppResult<()> {
    let q = if draft {
        "mutation($id: ID!) { convertPullRequestToDraft(input: { pullRequestId: $id }) { clientMutationId } }"
    } else {
        "mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { clientMutationId } }"
    };
    c.graphql(q, json!({ "id": node_id })).await?;
    Ok(())
}


pub async fn set_auto_merge(c: &GitHubClient, node_id: &str, method: Option<MergeMethod>) -> AppResult<()> {
    match method {
        Some(m) => {
            let m = match m {
                MergeMethod::Merge => "MERGE",
                MergeMethod::Squash => "SQUASH",
                MergeMethod::Rebase => "REBASE",
            };
            let q = "mutation($id: ID!, $m: PullRequestMergeMethod!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: $m }) { clientMutationId } }";
            c.graphql(q, json!({ "id": node_id, "m": m })).await.map_err(|e| {
                let msg = e.detail.clone().unwrap_or_default().to_lowercase();
                if msg.contains("auto merge is not allowed") {
                    AppError::new("pulls.auto_merge_disabled").detail(e.detail.unwrap_or_default())
                } else if msg.contains("clean status") {
                    AppError::new("pulls.auto_merge_clean").detail(e.detail.unwrap_or_default())
                } else {
                    e
                }
            })?;
        }
        None => {
            let q = "mutation($id: ID!) { disablePullRequestAutoMerge(input: { pullRequestId: $id }) { clientMutationId } }";
            c.graphql(q, json!({ "id": node_id })).await?;
        }
    }
    Ok(())
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ReviewComment {
    pub id: u64,
    pub user: SimpleUser,
    pub body: String,
    pub path: String,

    pub line: Option<u32>,
    pub start_line: Option<u32>,
    pub original_line: Option<u32>,

    pub side: Option<String>,
    pub in_reply_to_id: Option<u64>,

    pub pull_request_review_id: Option<u64>,
    pub created_at: String,
    pub updated_at: String,
    pub html_url: String,
}

#[derive(Deserialize)]
struct ReviewCommentRaw {
    id: u64,
    user: Option<SimpleUser>,
    #[serde(default)]
    body: String,
    path: String,
    line: Option<u32>,
    start_line: Option<u32>,
    original_line: Option<u32>,
    side: Option<String>,
    in_reply_to_id: Option<u64>,
    pull_request_review_id: Option<u64>,
    created_at: String,
    updated_at: String,
    html_url: String,
}

impl From<ReviewCommentRaw> for ReviewComment {
    fn from(r: ReviewCommentRaw) -> Self {
        ReviewComment {
            id: r.id,
            user: r.user.unwrap_or(SimpleUser { login: "ghost".into(), avatar_url: String::new() }),
            body: r.body,
            path: r.path,
            line: r.line,
            start_line: r.start_line,
            original_line: r.original_line,
            side: r.side,
            in_reply_to_id: r.in_reply_to_id,
            pull_request_review_id: r.pull_request_review_id,
            created_at: r.created_at,
            updated_at: r.updated_at,
            html_url: r.html_url,
        }
    }
}

fn review_comment_from(v: Option<Value>) -> AppResult<ReviewComment> {
    let raw: ReviewCommentRaw = serde_json::from_value(v.unwrap_or_default())?;
    Ok(raw.into())
}

pub async fn review_comments(c: &GitHubClient, repo: &str, number: u32) -> AppResult<Vec<ReviewComment>> {
    let raw: Vec<ReviewCommentRaw> = c.paginate_with(&format!("/repos/{repo}/pulls/{number}/comments?per_page=100"), true).await?;
    Ok(raw.into_iter().map(Into::into).collect())
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct NewReviewComment {
    pub body: String,

    pub commit_id: String,
    pub path: String,
    pub line: u32,

    pub side: String,

    pub start_line: Option<u32>,
}

pub async fn create_review_comment(c: &GitHubClient, repo: &str, number: u32, input: &NewReviewComment) -> AppResult<ReviewComment> {
    let mut body = json!({ "body": input.body, "commit_id": input.commit_id, "path": input.path, "line": input.line, "side": input.side });
    if let Some(s) = input.start_line.filter(|s| *s < input.line) {
        body["start_line"] = json!(s);
        body["start_side"] = json!(input.side);
    }
    review_comment_from(c.send_json(Method::POST, &format!("/repos/{repo}/pulls/{number}/comments"), Some(&body)).await?)
}

pub async fn reply_review_comment(c: &GitHubClient, repo: &str, number: u32, comment_id: u64, body: &str) -> AppResult<ReviewComment> {
    let path = format!("/repos/{repo}/pulls/{number}/comments/{comment_id}/replies");
    review_comment_from(c.send_json(Method::POST, &path, Some(&json!({ "body": body }))).await?)
}

pub async fn update_review_comment(c: &GitHubClient, repo: &str, comment_id: u64, body: &str) -> AppResult<ReviewComment> {
    let path = format!("/repos/{repo}/pulls/comments/{comment_id}");
    review_comment_from(c.send_json(Method::PATCH, &path, Some(&json!({ "body": body }))).await?)
}

pub async fn delete_review_comment(c: &GitHubClient, repo: &str, comment_id: u64) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/repos/{repo}/pulls/comments/{comment_id}"), None).await?;
    Ok(())
}

pub async fn branches(c: &GitHubClient, repo: &str) -> AppResult<Vec<String>> {
    let v: Vec<Value> = c.paginate_with(&format!("/repos/{repo}/branches?per_page=100"), true).await?;
    Ok(v.iter().map(|b| s(b, "name")).collect())
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Compare {

    pub status: String,
    pub ahead_by: u32,
    pub behind_by: u32,
    pub total_commits: u32,
    pub files: u32,
}

pub async fn compare(c: &GitHubClient, repo: &str, base: &str, head: &str) -> AppResult<Compare> {
    let v: Value = c.get_json(&format!("/repos/{repo}/compare/{}...{}", super::client::enc(base), super::client::enc(head))).await?;
    Ok(Compare {
        status: s(&v, "status"),
        ahead_by: n(&v, "ahead_by"),
        behind_by: n(&v, "behind_by"),
        total_commits: n(&v, "total_commits"),
        files: v.get("files").and_then(Value::as_array).map(|a| a.len() as u32).unwrap_or(0),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct NewPull {
    pub title: String,
    pub head: String,
    pub base: String,
    pub body: Option<String>,
    pub draft: bool,
}

pub async fn create(c: &GitHubClient, repo: &str, input: &NewPull) -> AppResult<Pull> {
    let v = c.send_json(Method::POST, &format!("/repos/{repo}/pulls"), Some(input)).await?;
    let raw: PullRaw = serde_json::from_value(v.unwrap_or_default())?;
    Ok(raw.into())
}

#[cfg(test)]
pub mod tests_support {
    pub fn from_value(v: serde_json::Value) -> super::Pull {
        serde_json::from_value::<super::PullRaw>(v).unwrap().into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn review_with_batch() {
        let p = review_payload("COMMENT", "", &[DraftComment { path: "a.rs".into(), line: 5, side: "RIGHT".into(), start_line: Some(3), body: "x".into() }]);
        assert_eq!(p["comments"][0]["start_line"], 3);
        assert_eq!(p["comments"][0]["start_side"], "RIGHT");
        assert!(review_payload("APPROVE", "ok", &[]).get("comments").is_none());
    }

    #[test]
    fn parses_graphql_summary() {
        let node = json!({
            "number": 7, "title": "Add X", "url": "u", "state": "OPEN", "isDraft": true,
            "createdAt": "a", "updatedAt": "b", "mergedAt": null, "closedAt": null,
            "repository": { "nameWithOwner": "o/r" }, "author": { "login": "me", "avatarUrl": "" },
            "headRefName": "feat", "baseRefName": "main", "additions": 10, "deletions": 2, "changedFiles": 3,
            "comments": { "totalCount": 4 }, "reviewDecision": "APPROVED", "mergeable": "MERGEABLE",
            "labels": { "nodes": [{ "name": "bug", "color": "ff0000", "description": null }] },
            "assignees": { "nodes": [] },
            "commits": { "nodes": [{ "commit": { "statusCheckRollup": { "state": "FAILURE" } } }] }
        });
        let p = parse_summary(&node).unwrap();
        assert_eq!(p.repo, "o/r");
        assert!(p.is_draft);
        assert_eq!(p.checks.as_deref(), Some("FAILURE"));
        assert_eq!(p.comments, 4);
        assert_eq!(p.labels[0].name, "bug");
    }

    #[test]
    fn skips_non_pr_nodes() {
        assert!(parse_summary(&json!({})).is_none());
    }
}
