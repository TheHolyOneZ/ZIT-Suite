use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;

use super::client::GitHubClient;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct About {
    pub description: String,
    pub homepage: String,
    pub topics: Vec<String>,
    pub has_issues: bool,
    pub has_wiki: bool,
    pub has_projects: bool,
    pub has_discussions: bool,
    pub default_branch: String,
    pub private: bool,
    pub html_url: String,
    pub stars: u32,
    pub forks: u32,
    pub watchers: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AboutInput {
    pub description: String,
    pub homepage: String,
    pub topics: Vec<String>,
    pub has_issues: bool,
    pub has_wiki: bool,
    pub has_projects: bool,
    pub has_discussions: bool,
}


pub const MAX_TOPICS: usize = 20;


pub fn normalize_topic(raw: &str) -> String {
    let mut s: String = raw
        .trim()
        .trim_start_matches('#')
        .to_lowercase()
        .replace("++", "pp")
        .replace('#', "sharp")
        .chars()
        .map(|c| if c.is_whitespace() || c == '_' || c == '.' { '-' } else { c })
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    while s.contains("--") {
        s = s.replace("--", "-");
    }
    s.trim_matches('-').chars().take(50).collect::<String>().trim_end_matches('-').to_string()
}

pub fn normalize_topics(raw: &[String]) -> AppResult<Vec<String>> {
    let mut out: Vec<String> = Vec::new();
    for t in raw.iter().map(|t| normalize_topic(t)).filter(|t| !t.is_empty()) {
        if !out.contains(&t) {
            out.push(t);
        }
    }
    if out.len() > MAX_TOPICS {
        return Err(AppError::new("about.too_many_topics").detail(out.len().to_string()));
    }
    Ok(out)
}

pub async fn get(c: &GitHubClient, repo: &str, fresh: bool) -> AppResult<About> {
    let (v, _) = c.get_page(&format!("/repos/{repo}"), fresh).await?;
    let s = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
    let b = |k: &str| v.get(k).and_then(Value::as_bool).unwrap_or(false);
    let n = |k: &str| v.get(k).and_then(Value::as_u64).unwrap_or(0) as u32;
    Ok(About {
        description: s("description"),
        homepage: s("homepage"),
        topics: v.get("topics").and_then(|t| serde_json::from_value(t.clone()).ok()).unwrap_or_default(),
        has_issues: b("has_issues"),
        has_wiki: b("has_wiki"),
        has_projects: b("has_projects"),
        has_discussions: b("has_discussions"),
        default_branch: s("default_branch"),
        private: b("private"),
        html_url: s("html_url"),
        stars: n("stargazers_count"),
        forks: n("forks_count"),
        watchers: n("subscribers_count"),
    })
}


pub fn normalize_homepage(h: &str) -> String {
    let h = h.trim();
    if h.is_empty() || h.contains("://") {
        h.to_string()
    } else {
        format!("https://{h}")
    }
}

pub async fn save(c: &GitHubClient, repo: &str, i: &AboutInput) -> AppResult<About> {
    let topics = normalize_topics(&i.topics)?;
    let description: String = i.description.trim().replace(['\n', '\r'], " ").chars().take(350).collect();
    let body = json!({
        "description": description,
        "homepage": normalize_homepage(&i.homepage),
        "has_issues": i.has_issues,
        "has_wiki": i.has_wiki,
        "has_projects": i.has_projects,
        "has_discussions": i.has_discussions,
    });
    c.send_json(Method::PATCH, &format!("/repos/{repo}"), Some(&body)).await?;
    c.send_json(Method::PUT, &format!("/repos/{repo}/topics"), Some(&json!({ "names": topics }))).await?;
    get(c, repo, true).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn topics_are_cleaned() {
        let raw: Vec<String> = ["Rust", " Tauri App ", "#GUI", "rust", "c++", "C#", "--x--", "under_score", "v1.2"].map(String::from).to_vec();
        assert_eq!(normalize_topics(&raw).unwrap(), ["rust", "tauri-app", "gui", "cpp", "csharp", "x", "under-score", "v1-2"]);
        assert_eq!(normalize_topic(&"a".repeat(80)).len(), 50);
        let many: Vec<String> = (0..21).map(|i| format!("t{i}")).collect();
        assert_eq!(normalize_topics(&many).unwrap_err().code, "about.too_many_topics");
    }

    #[test]
    fn homepage_gets_a_scheme() {
        assert_eq!(normalize_homepage("example.com"), "https://example.com");
        assert_eq!(normalize_homepage("http://x.dev"), "http://x.dev");
        assert_eq!(normalize_homepage("  "), "");
    }
}
