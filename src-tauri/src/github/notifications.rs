use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;

use super::client::GitHubClient;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Thread {

    pub id: String,
    pub unread: bool,


    pub reason: String,
    pub updated_at: String,
    pub last_read_at: Option<String>,
    pub repo: String,
    pub repo_private: bool,
    pub owner_avatar: String,

    pub kind: String,
    pub title: String,

    pub number: Option<u32>,

    pub web_url: String,
}


fn number_of(api_url: &str) -> Option<u32> {
    let mut parts = api_url.rsplit('/');
    let n = parts.next()?.parse().ok()?;
    matches!(parts.next(), Some("issues" | "pulls")).then_some(n)
}


pub fn web_url(repo: &str, kind: &str, api_url: Option<&str>) -> String {
    let base = format!("https://github.com/{repo}");
    let Some(u) = api_url else {
        return match kind {
            "CheckSuite" => format!("{base}/actions"),
            "RepositoryVulnerabilityAlert" | "RepositoryDependabotAlertsThread" => format!("{base}/security/dependabot"),
            "Discussion" => format!("{base}/discussions"),
            _ => base,
        };
    };
    let rest = u.split_once(&format!("/repos/{repo}")).map(|(_, r)| r).unwrap_or("");
    if let Some(n) = number_of(u) {
        return if kind == "PullRequest" { format!("{base}/pull/{n}") } else { format!("{base}/issues/{n}") };
    }
    if let Some(sha) = rest.strip_prefix("/commits/") {
        return format!("{base}/commit/{sha}");
    }
    if rest.starts_with("/releases") {
        return format!("{base}/releases");
    }
    base
}

fn thread_of(v: &Value) -> Thread {
    let s = |p: &str| v.pointer(p).and_then(Value::as_str).unwrap_or_default().to_string();
    let repo = s("/repository/full_name");
    let kind = s("/subject/type");
    let api = v.pointer("/subject/url").and_then(Value::as_str);
    Thread {
        id: match v.get("id") {
            Some(Value::String(x)) => x.clone(),
            Some(x) => x.to_string(),
            None => String::new(),
        },
        unread: v.get("unread").and_then(Value::as_bool).unwrap_or(false),
        reason: s("/reason"),
        updated_at: s("/updated_at"),
        last_read_at: v.get("last_read_at").and_then(Value::as_str).map(str::to_string),
        repo_private: v.pointer("/repository/private").and_then(Value::as_bool).unwrap_or(false),
        owner_avatar: s("/repository/owner/avatar_url"),
        title: s("/subject/title"),
        number: api.and_then(number_of),
        web_url: web_url(&repo, &kind, api),
        repo,
        kind,
    }
}


pub async fn list(c: &GitHubClient, all: bool, participating: bool, fresh: bool) -> AppResult<Vec<Thread>> {
    let raw: Vec<Value> = c.paginate_with(&format!("/notifications?per_page=50&all={all}&participating={participating}"), fresh).await?;
    Ok(raw.iter().map(thread_of).collect())
}

pub async fn mark_read(c: &GitHubClient, id: &str) -> AppResult<()> {
    c.send_json::<()>(Method::PATCH, &format!("/notifications/threads/{id}"), None).await.map(drop)
}


pub async fn mark_done(c: &GitHubClient, id: &str) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/notifications/threads/{id}"), None).await.map(drop)
}


pub async fn mute(c: &GitHubClient, id: &str) -> AppResult<()> {
    c.send_json(Method::PUT, &format!("/notifications/threads/{id}/subscription"), Some(&json!({ "ignored": true }))).await.map(drop)
}


pub async fn mark_all_read(c: &GitHubClient, repo: Option<&str>, before: &str) -> AppResult<()> {
    let path = match repo {
        Some(r) => format!("/repos/{r}/notifications"),
        None => "/notifications".to_string(),
    };
    c.send_json(Method::PUT, &path, Some(&json!({ "last_read_at": before, "read": true }))).await.map(drop)
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Watched {
    pub repo: String,
    pub private: bool,
    pub fork: bool,
    pub archived: bool,
    pub owner: String,
    pub pushed_at: Option<String>,
}


pub async fn watched(c: &GitHubClient, fresh: bool) -> AppResult<Vec<Watched>> {
    let raw: Vec<Value> = c.paginate_with("/user/subscriptions?per_page=100", fresh).await?;
    Ok(raw
        .iter()
        .map(|v| Watched {
            repo: v.get("full_name").and_then(Value::as_str).unwrap_or_default().to_string(),
            private: v.get("private").and_then(Value::as_bool).unwrap_or(false),
            fork: v.get("fork").and_then(Value::as_bool).unwrap_or(false),
            archived: v.get("archived").and_then(Value::as_bool).unwrap_or(false),
            owner: v.pointer("/owner/login").and_then(Value::as_str).unwrap_or_default().to_string(),
            pushed_at: v.get("pushed_at").and_then(Value::as_str).map(str::to_string),
        })
        .collect())
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WatchMode {

    Watching,

    Ignoring,

    Participating,
}

pub async fn set_watch(c: &GitHubClient, repo: &str, mode: WatchMode) -> AppResult<()> {
    let path = format!("/repos/{repo}/subscription");
    match mode {
        WatchMode::Watching => c.send_json(Method::PUT, &path, Some(&json!({ "subscribed": true, "ignored": false }))).await.map(drop),
        WatchMode::Ignoring => c.send_json(Method::PUT, &path, Some(&json!({ "subscribed": false, "ignored": true }))).await.map(drop),
        WatchMode::Participating => c.send_json::<()>(Method::DELETE, &path, None).await.map(drop),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn links_and_numbers() {
        let r = "o/r";
        assert_eq!(web_url(r, "PullRequest", Some("https://api.github.com/repos/o/r/pulls/12")), "https://github.com/o/r/pull/12");
        assert_eq!(web_url(r, "Issue", Some("https://api.github.com/repos/o/r/issues/7")), "https://github.com/o/r/issues/7");
        assert_eq!(web_url(r, "Commit", Some("https://api.github.com/repos/o/r/commits/abc")), "https://github.com/o/r/commit/abc");
        assert_eq!(web_url(r, "Release", Some("https://api.github.com/repos/o/r/releases/5")), "https://github.com/o/r/releases");
        assert_eq!(web_url(r, "CheckSuite", None), "https://github.com/o/r/actions");
        assert_eq!(number_of("https://api.github.com/repos/o/r/pulls/12"), Some(12));
        assert_eq!(number_of("https://api.github.com/repos/o/r/releases/5"), None);
    }

    #[test]
    fn parses_a_thread() {
        let t = thread_of(&json!({
            "id": "123", "unread": true, "reason": "review_requested", "updated_at": "2026-10-01T00:00:00Z", "last_read_at": null,
            "subject": { "title": "Fix it", "url": "https://api.github.com/repos/o/r/pulls/3", "type": "PullRequest" },
            "repository": { "full_name": "o/r", "private": true, "owner": { "avatar_url": "a" } }
        }));
        assert_eq!((t.id.as_str(), t.number, t.kind.as_str(), t.repo_private), ("123", Some(3), "PullRequest", true));
        assert_eq!(t.web_url, "https://github.com/o/r/pull/3");
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
pub struct SubjectRef {
    pub repo: String,
    pub number: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
pub struct SubjectState {
    pub repo: String,
    pub number: u32,

    pub state: String,
}


pub fn states_query(refs: &[SubjectRef]) -> String {
    let parts: Vec<String> = refs
        .iter()
        .enumerate()
        .filter_map(|(i, r)| {
            let (o, n) = r.repo.split_once('/')?;
            let esc = |s: &str| s.replace(['\\', '"'], "");
            Some(format!(
                "s{i}: repository(owner:\"{}\",name:\"{}\"){{ issueOrPullRequest(number:{}){{ __typename ... on Issue{{state stateReason}} ... on PullRequest{{state isDraft}} }} }}",
                esc(o),
                esc(n),
                r.number
            ))
        })
        .collect();
    format!("query{{ {} }}", parts.join(" "))
}

pub fn parse_state(v: &Value) -> Option<String> {
    let s = v["state"].as_str()?;
    Some(match (v["__typename"].as_str(), s) {
        (Some("PullRequest"), "MERGED") => "merged".into(),
        (Some("PullRequest"), "OPEN") if v["isDraft"].as_bool() == Some(true) => "draft".into(),
        (Some("Issue"), "CLOSED") => match v["stateReason"].as_str() {
            Some("NOT_PLANNED") => "not_planned".into(),
            Some("COMPLETED") => "completed".into(),
            _ => "closed".into(),
        },
        (_, other) => other.to_lowercase(),
    })
}

pub async fn subject_states(c: &GitHubClient, refs: &[SubjectRef]) -> AppResult<Vec<SubjectState>> {
    let mut out = Vec::new();
    for chunk in refs.chunks(40) {

        let d = match c.graphql_lenient(&states_query(chunk), json!({})).await {
            Ok(d) => d,
            Err(e) if e.code == "github.graphql" || e.code == "github.not_found" => continue,
            Err(e) => return Err(e),
        };
        for (i, r) in chunk.iter().enumerate() {
            if let Some(st) = d.get(format!("s{i}")).and_then(|x| parse_state(&x["issueOrPullRequest"])) {
                out.push(SubjectState { repo: r.repo.clone(), number: r.number, state: st });
            }
        }
    }
    Ok(out)
}

#[cfg(test)]
mod state_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn states() {
        assert_eq!(parse_state(&json!({ "__typename": "PullRequest", "state": "MERGED" })).as_deref(), Some("merged"));
        assert_eq!(parse_state(&json!({ "__typename": "PullRequest", "state": "OPEN", "isDraft": true })).as_deref(), Some("draft"));
        assert_eq!(parse_state(&json!({ "__typename": "Issue", "state": "CLOSED", "stateReason": "NOT_PLANNED" })).as_deref(), Some("not_planned"));
        assert_eq!(parse_state(&json!({ "__typename": "Issue", "state": "OPEN" })).as_deref(), Some("open"));
        let q = states_query(&[SubjectRef { repo: "a/b\"x".into(), number: 3 }]);
        assert!(q.contains("s0: repository(owner:\"a\",name:\"bx\")") && q.contains("issueOrPullRequest(number:3)"));
    }
}
