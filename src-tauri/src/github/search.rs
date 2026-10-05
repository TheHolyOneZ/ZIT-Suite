use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;

use super::client::GitHubClient;
use crate::error::AppResult;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SearchKind {
    Repos,
    Code,
    Issues,
    Commits,
    Users,
}

impl SearchKind {
    fn path(self) -> &'static str {
        match self {
            Self::Repos => "/search/repositories",
            Self::Code => "/search/code",
            Self::Issues => "/search/issues",
            Self::Commits => "/search/commits",
            Self::Users => "/search/users",
        }
    }
}


#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
pub struct Fragment {
    pub text: String,
    pub matches: Vec<(u32, u32)>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Hit {
    pub kind: SearchKind,
    pub title: String,
    pub subtitle: String,
    pub url: String,
    pub repo: Option<String>,
    pub number: Option<u32>,
    pub is_pr: bool,

    pub state: Option<String>,
    pub path: Option<String>,
    pub sha: Option<String>,
    pub language: Option<String>,
    pub stars: Option<u32>,
    pub avatar: Option<String>,
    pub updated_at: Option<String>,
    pub fragments: Vec<Fragment>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SearchPage {
    pub total: u32,
    pub incomplete: bool,
    pub items: Vec<Hit>,
}


fn fragments(v: &Value) -> Vec<Fragment> {
    v.get("text_matches")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|m| {
            let text = m.get("fragment")?.as_str()?.to_string();

            let to_char = |c: u64| c.min(text.chars().count() as u64) as u32;
            let matches = m
                .get("matches")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|x| {
                    let idx = x.get("indices")?.as_array()?;
                    Some((to_char(idx.first()?.as_u64()?), to_char(idx.get(1)?.as_u64()?)))
                })
                .collect();
            Some(Fragment { text, matches })
        })
        .collect()
}

fn s(v: &Value, p: &str) -> Option<String> {
    v.pointer(p).and_then(Value::as_str).filter(|x| !x.is_empty()).map(str::to_string)
}

fn hit_of(kind: SearchKind, v: &Value) -> Hit {
    let base = Hit {
        kind,
        title: String::new(),
        subtitle: String::new(),
        url: s(v, "/html_url").unwrap_or_default(),
        repo: None,
        number: None,
        is_pr: false,
        state: None,
        path: None,
        sha: None,
        language: None,
        stars: None,
        avatar: None,
        updated_at: None,
        fragments: fragments(v),
    };
    match kind {
        SearchKind::Repos => Hit {
            title: s(v, "/full_name").unwrap_or_default(),
            subtitle: s(v, "/description").unwrap_or_default(),
            repo: s(v, "/full_name"),
            language: s(v, "/language"),
            stars: v.get("stargazers_count").and_then(Value::as_u64).map(|n| n as u32),
            avatar: s(v, "/owner/avatar_url"),
            updated_at: s(v, "/pushed_at"),
            ..base
        },
        SearchKind::Code => Hit {
            title: s(v, "/name").unwrap_or_default(),
            subtitle: s(v, "/path").unwrap_or_default(),
            repo: s(v, "/repository/full_name"),
            path: s(v, "/path"),
            sha: s(v, "/sha"),
            avatar: s(v, "/repository/owner/avatar_url"),
            ..base
        },
        SearchKind::Issues => {
            let is_pr = v.get("pull_request").is_some_and(|p| !p.is_null());
            let merged = v.pointer("/pull_request/merged_at").is_some_and(|m| !m.is_null());
            let repo = s(v, "/repository_url").and_then(|u| u.split("/repos/").nth(1).map(str::to_string));
            Hit {
                title: s(v, "/title").unwrap_or_default(),
                subtitle: s(v, "/user/login").map(|u| format!("@{u}")).unwrap_or_default(),
                repo,
                number: v.get("number").and_then(Value::as_u64).map(|n| n as u32),
                is_pr,
                state: Some(if merged { "merged".into() } else { s(v, "/state").unwrap_or_default() }),
                avatar: s(v, "/user/avatar_url"),
                updated_at: s(v, "/updated_at"),
                ..base
            }
        }
        SearchKind::Commits => Hit {
            title: s(v, "/commit/message").map(|m| m.lines().next().unwrap_or_default().to_string()).unwrap_or_default(),
            subtitle: s(v, "/commit/author/name").unwrap_or_default(),
            repo: s(v, "/repository/full_name"),
            sha: s(v, "/sha"),
            avatar: s(v, "/author/avatar_url"),
            updated_at: s(v, "/commit/author/date"),
            ..base
        },
        SearchKind::Users => Hit {
            title: s(v, "/login").unwrap_or_default(),
            subtitle: s(v, "/type").unwrap_or_default(),
            avatar: s(v, "/avatar_url"),
            ..base
        },
    }
}


pub async fn search(c: &GitHubClient, kind: SearchKind, q: &str, page: u32, sort: Option<&str>) -> AppResult<SearchPage> {
    let mut query = vec![("q", q.to_string()), ("per_page", "30".to_string()), ("page", page.clamp(1, 34).to_string())];
    if let Some(s) = sort.filter(|s| !s.is_empty() && *s != "best-match") {
        query.push(("sort", s.to_string()));
        query.push(("order", "desc".to_string()));
    }
    let v: Value = c.get_json_accept(kind.path(), &query, "application/vnd.github.text-match+json").await?;
    Ok(SearchPage {
        total: v.get("total_count").and_then(Value::as_u64).unwrap_or(0).min(u32::MAX as u64) as u32,
        incomplete: v.get("incomplete_results").and_then(Value::as_bool).unwrap_or(false),
        items: v.get("items").and_then(Value::as_array).into_iter().flatten().map(|i| hit_of(kind, i)).collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn highlights_use_char_offsets() {
        let f = fragments(&json!({ "text_matches": [{ "fragment": "ä foo bar", "matches": [{ "indices": [2, 5] }, { "indices": [6, 99] }] }] }));
        assert_eq!(f[0].matches, vec![(2, 5), (6, 9)]);
        let t: String = f[0].text.chars().skip(2).take(3).collect();
        assert_eq!(t, "foo");
    }

    #[test]
    fn issue_and_pr_hits() {
        let pr = hit_of(SearchKind::Issues, &json!({ "title": "Fix", "number": 7, "state": "closed", "html_url": "h",
            "repository_url": "https://api.github.com/repos/o/r", "pull_request": { "merged_at": "2026-01-01" }, "user": { "login": "me" } }));
        assert_eq!((pr.is_pr, pr.state.as_deref(), pr.repo.as_deref(), pr.number), (true, Some("merged"), Some("o/r"), Some(7)));
        let issue = hit_of(SearchKind::Issues, &json!({ "title": "Bug", "number": 1, "state": "open", "repository_url": "https://api.github.com/repos/o/r" }));
        assert!(!issue.is_pr);
        let commit = hit_of(SearchKind::Commits, &json!({ "sha": "abc", "commit": { "message": "first\n\nbody", "author": { "name": "Z" } }, "repository": { "full_name": "o/r" } }));
        assert_eq!(commit.title, "first");
    }
}
