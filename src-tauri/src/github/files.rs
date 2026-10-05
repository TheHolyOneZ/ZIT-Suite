use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;

use super::client::{enc, GitHubClient};
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TreeItem {
    pub path: String,

    pub kind: String,

    pub mode: String,
    pub sha: String,
    pub size: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RepoTree {
    pub branch: String,

    pub commit: String,
    pub items: Vec<TreeItem>,

    pub truncated: bool,
}

pub async fn tree(c: &GitHubClient, repo: &str, branch: &str, fresh: bool) -> AppResult<RepoTree> {
    let (b, _) = c.get_page(&format!("/repos/{repo}/branches/{}", enc(branch)), fresh).await?;
    let commit = b.pointer("/commit/sha").and_then(Value::as_str).ok_or_else(|| AppError::new("files.no_branch"))?.to_string();
    let tree_sha = b.pointer("/commit/commit/tree/sha").and_then(Value::as_str).ok_or_else(|| AppError::new("files.no_branch"))?.to_string();
    let (t, _) = c.get_page(&format!("/repos/{repo}/git/trees/{tree_sha}?recursive=1"), false).await?;
    let items = t
        .get("tree")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|i| TreeItem {
            path: i.get("path").and_then(Value::as_str).unwrap_or_default().to_string(),
            kind: i.get("type").and_then(Value::as_str).unwrap_or_default().to_string(),
            mode: i.get("mode").and_then(Value::as_str).unwrap_or_default().to_string(),
            sha: i.get("sha").and_then(Value::as_str).unwrap_or_default().to_string(),
            size: i.get("size").and_then(Value::as_f64).unwrap_or(0.0),
        })
        .collect();
    Ok(RepoTree { branch: branch.to_string(), commit, items, truncated: t.get("truncated").and_then(Value::as_bool).unwrap_or(false) })
}


pub async fn items_at(c: &GitHubClient, repo: &str, commit: &str) -> AppResult<Vec<TreeItem>> {
    let cm: Value = c.get_json(&format!("/repos/{repo}/git/commits/{commit}")).await?;
    let tree = cm.pointer("/tree/sha").and_then(Value::as_str).unwrap_or_default();
    let (t, _) = c.get_page(&format!("/repos/{repo}/git/trees/{tree}?recursive=1"), false).await?;
    Ok(t.get("tree")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|i| TreeItem {
            path: i.get("path").and_then(Value::as_str).unwrap_or_default().to_string(),
            kind: i.get("type").and_then(Value::as_str).unwrap_or_default().to_string(),
            mode: i.get("mode").and_then(Value::as_str).unwrap_or_default().to_string(),
            sha: i.get("sha").and_then(Value::as_str).unwrap_or_default().to_string(),
            size: i.get("size").and_then(Value::as_f64).unwrap_or(0.0),
        })
        .collect())
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Blob {
    pub sha: String,
    pub size: f64,

    pub text: Option<String>,

    pub base64: Option<String>,
}


pub async fn blob(c: &GitHubClient, repo: &str, sha: &str) -> AppResult<Blob> {
    let (v, _) = c.get_page(&format!("/repos/{repo}/git/blobs/{sha}"), false).await?;
    let raw: String = v.get("content").and_then(Value::as_str).unwrap_or_default().chars().filter(|c| !c.is_whitespace()).collect();
    let bytes = B64.decode(raw.as_bytes()).map_err(|e| AppError::new("files.decode").detail(e.to_string()))?;
    let size = bytes.len() as f64;
    let binary = bytes[..bytes.len().min(8000)].contains(&0);
    Ok(match (binary, String::from_utf8(bytes)) {
        (false, Ok(text)) => Blob { sha: sha.into(), size, text: Some(text), base64: None },
        _ => Blob { sha: sha.into(), size, text: None, base64: (size <= 5.0 * 1024.0 * 1024.0).then_some(raw) },
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileCommit {
    pub sha: String,
    pub message: String,
    pub author: String,
    pub date: String,
    pub url: String,
}


pub async fn history(c: &GitHubClient, repo: &str, branch: &str, path: &str) -> AppResult<Vec<FileCommit>> {
    let q = [("sha", branch.to_string()), ("path", path.to_string()), ("per_page", "40".to_string())];
    let v: Vec<Value> = c.get_json_query(&format!("/repos/{repo}/commits"), &q).await?;
    Ok(v.iter()
        .map(|x| FileCommit {
            sha: x.get("sha").and_then(Value::as_str).unwrap_or_default().to_string(),
            message: x.pointer("/commit/message").and_then(Value::as_str).unwrap_or_default().lines().next().unwrap_or_default().to_string(),
            author: x.pointer("/author/login").and_then(Value::as_str).or(x.pointer("/commit/author/name").and_then(Value::as_str)).unwrap_or_default().to_string(),
            date: x.pointer("/commit/author/date").and_then(Value::as_str).unwrap_or_default().to_string(),
            url: x.get("html_url").and_then(Value::as_str).unwrap_or_default().to_string(),
        })
        .collect())
}


pub async fn at_commit(c: &GitHubClient, repo: &str, commit: &str, path: &str) -> AppResult<Option<Blob>> {
    let p = path.split('/').map(enc).collect::<Vec<_>>().join("/");
    match c.get_json::<Value>(&format!("/repos/{repo}/contents/{p}?ref={}", enc(commit))).await {
        Ok(v) => match v.get("sha").and_then(Value::as_str) {
            Some(sha) => Ok(Some(blob(c, repo, sha).await?)),
            None => Ok(None),
        },
        Err(e) if e.code == "github.not_found" => Ok(None),
        Err(e) => Err(e),
    }
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Change {

    Text { path: String, text: String, executable: Option<bool> },

    Binary { path: String, base64: String },
    Delete { path: String },

    Rename { from: String, to: String },
}

pub fn valid_path(p: &str) -> bool {
    !p.is_empty()
        && !p.starts_with('/')
        && !p.ends_with('/')
        && p.len() <= 4096
        && p.split('/').all(|s| !s.is_empty() && s != "." && s != ".." && s != ".git")
        && !p.chars().any(|c| c.is_control() || c == '\\')
}


pub fn tree_entries(changes: &[Change], existing: &dyn Fn(&str) -> Option<(String, String)>, blob_for: &dyn Fn(usize) -> Option<String>) -> AppResult<Vec<Value>> {
    let mut out: Vec<Value> = Vec::new();
    let mut set = |path: &str, v: Value| {
        out.retain(|e| e["path"] != path);
        out.push(v);
    };
    for (i, ch) in changes.iter().enumerate() {
        match ch {
            Change::Text { path, executable, .. } => {
                if !valid_path(path) {
                    return Err(AppError::new("files.bad_path").detail(path.clone()));
                }

                let base_mode = existing(path).map(|(m, _)| m).filter(|m| m == "100755" || m == "100644");
                let mode = match executable {
                    Some(true) => "100755".to_string(),
                    Some(false) => "100644".to_string(),
                    None => base_mode.unwrap_or_else(|| "100644".into()),
                };
                set(path, json!({ "path": path, "mode": mode, "type": "blob", "sha": blob_for(i) }));
            }
            Change::Binary { path, .. } => {
                if !valid_path(path) {
                    return Err(AppError::new("files.bad_path").detail(path.clone()));
                }
                let mode = existing(path).map(|(m, _)| m).filter(|m| m == "100755").unwrap_or_else(|| "100644".into());
                set(path, json!({ "path": path, "mode": mode, "type": "blob", "sha": blob_for(i) }));
            }
            Change::Delete { path } => set(path, json!({ "path": path, "mode": "100644", "type": "blob", "sha": Value::Null })),
            Change::Rename { from, to } => {
                if !valid_path(to) {
                    return Err(AppError::new("files.bad_path").detail(to.clone()));
                }
                let (mode, sha) = existing(from).ok_or_else(|| AppError::new("files.missing").detail(from.clone()))?;
                set(from, json!({ "path": from, "mode": "100644", "type": "blob", "sha": Value::Null }));
                set(to, json!({ "path": to, "mode": mode, "type": "blob", "sha": sha }));
            }
        }
    }
    Ok(out)
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CommitResult {
    pub sha: String,
    pub branch: String,
    pub url: String,
}


#[allow(clippy::too_many_arguments)]
pub async fn commit(c: &GitHubClient, repo: &str, branch: &str, base_commit: &str, new_branch: bool, message: &str, changes: &[Change], base_items: &[TreeItem]) -> AppResult<CommitResult> {
    if message.trim().is_empty() {
        return Err(AppError::new("files.no_message"));
    }
    if changes.is_empty() {
        return Err(AppError::new("files.nothing"));
    }
    if !new_branch {
        let (b, _) = c.get_page(&format!("/repos/{repo}/branches/{}", enc(branch)), true).await?;
        let head = b.pointer("/commit/sha").and_then(Value::as_str).unwrap_or_default();
        if head != base_commit {
            return Err(AppError::new("files.stale").detail(head.chars().take(7).collect::<String>()));
        }
    }

    let mut blob_shas: Vec<Option<String>> = vec![None; changes.len()];
    for (i, ch) in changes.iter().enumerate() {
        let body = match ch {
            Change::Text { text, .. } => json!({ "content": text, "encoding": "utf-8" }),
            Change::Binary { base64, .. } => json!({ "content": base64, "encoding": "base64" }),
            _ => continue,
        };
        let v = c.send_json(Method::POST, &format!("/repos/{repo}/git/blobs"), Some(&body)).await?.unwrap_or_default();
        blob_shas[i] = v.get("sha").and_then(Value::as_str).map(str::to_string);
    }

    let existing = |p: &str| base_items.iter().find(|i| i.path == p && i.kind == "blob").map(|i| (i.mode.clone(), i.sha.clone()));
    let entries = tree_entries(changes, &existing, &|i| blob_shas[i].clone())?;
    let base: Value = c.get_json(&format!("/repos/{repo}/git/commits/{base_commit}")).await?;
    let base_tree = base.pointer("/tree/sha").and_then(Value::as_str).unwrap_or_default();
    let tree = c.send_json(Method::POST, &format!("/repos/{repo}/git/trees"), Some(&json!({ "base_tree": base_tree, "tree": entries }))).await?.unwrap_or_default();
    let tree_sha = tree.get("sha").and_then(Value::as_str).unwrap_or_default();

    let cm = c
        .send_json(Method::POST, &format!("/repos/{repo}/git/commits"), Some(&json!({ "message": message.trim(), "tree": tree_sha, "parents": [base_commit] })))
        .await?
        .unwrap_or_default();
    let sha = cm.get("sha").and_then(Value::as_str).unwrap_or_default().to_string();

    if new_branch {
        c.send_json(Method::POST, &format!("/repos/{repo}/git/refs"), Some(&json!({ "ref": format!("refs/heads/{branch}"), "sha": sha })))
            .await
            .map_err(|e| if e.code == "github.validation" { AppError::new("files.branch_exists").detail(branch.to_string()) } else { e })?;
    } else {
        c.send_json(Method::PATCH, &format!("/repos/{repo}/git/refs/heads/{}", enc(branch)), Some(&json!({ "sha": sha, "force": false })))
            .await
            .map_err(|e| if e.code == "github.validation" { AppError::new("files.stale") } else { e })?;
    }
    Ok(CommitResult { url: format!("https://github.com/{repo}/commit/{sha}"), sha, branch: branch.to_string() })
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DirEntry {
    pub name: String,
    pub path: String,

    pub kind: String,
}


pub async fn list_dir(c: &GitHubClient, repo: &str, path: &str, git_ref: Option<&str>) -> AppResult<Vec<DirEntry>> {
    let p = path.trim_matches('/').split('/').map(enc).collect::<Vec<_>>().join("/");
    let q = git_ref.map(|r| format!("?ref={}", enc(r))).unwrap_or_default();
    match c.get_page(&format!("/repos/{repo}/contents/{p}{q}"), false).await {
        Ok((v, _)) => Ok(v
            .as_array()
            .into_iter()
            .flatten()
            .map(|e| DirEntry {
                name: e["name"].as_str().unwrap_or_default().to_string(),
                path: e["path"].as_str().unwrap_or_default().to_string(),
                kind: e["type"].as_str().unwrap_or("file").to_string(),
            })
            .collect()),
        Err(e) if e.code == "github.not_found" => Ok(vec![]),
        Err(e) => Err(e),
    }
}


pub async fn read_text(c: &GitHubClient, repo: &str, path: &str, git_ref: Option<&str>) -> AppResult<Option<String>> {
    let p = path.trim_matches('/').split('/').map(enc).collect::<Vec<_>>().join("/");
    let q = git_ref.map(|r| format!("?ref={}", enc(r))).unwrap_or_default();
    match c.get_bytes(&format!("/repos/{repo}/contents/{p}{q}"), "application/vnd.github.raw+json").await {
        Ok(b) => Ok(Some(String::from_utf8_lossy(&b).into_owned())),
        Err(e) if e.code == "github.not_found" => Ok(None),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths() {
        assert!(valid_path("src/main.rs"));
        for bad in ["", "/abs", "dir/", "a/../b", ".git/config", "a//b", "a\\b"] {
            assert!(!valid_path(bad), "{bad}");
        }
    }

    #[test]
    fn entries_keep_modes_and_handle_renames() {
        let base = |p: &str| match p {
            "run.sh" => Some(("100755".to_string(), "s1".to_string())),
            "a.txt" => Some(("100644".to_string(), "s2".to_string())),
            _ => None,
        };
        let changes = vec![
            Change::Text { path: "run.sh".into(), text: "x".into(), executable: None },
            Change::Text { path: "new.md".into(), text: "y".into(), executable: None },
            Change::Rename { from: "a.txt".into(), to: "docs/a.txt".into() },
            Change::Delete { path: "old.txt".into() },
            Change::Text { path: "tool".into(), text: "z".into(), executable: Some(true) },
        ];
        let e = tree_entries(&changes, &base, &|i| Some(format!("b{i}"))).unwrap();
        let find = |p: &str| e.iter().find(|x| x["path"] == p).unwrap().clone();
        assert_eq!(find("run.sh")["mode"], "100755", "executable bit kept");
        assert_eq!(find("new.md")["mode"], "100644");
        assert_eq!(find("tool")["mode"], "100755");
        assert!(find("a.txt")["sha"].is_null(), "old path removed");
        assert_eq!(find("docs/a.txt")["sha"], "s2", "content moved unchanged");
        assert!(find("old.txt")["sha"].is_null());
        assert!(tree_entries(&[Change::Rename { from: "nope".into(), to: "x".into() }], &base, &|_| None).is_err());
        assert!(tree_entries(&[Change::Text { path: "../x".into(), text: "".into(), executable: None }], &base, &|_| None).is_err());
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BlameRange {
    pub start: u32,
    pub end: u32,

    pub age: u32,
    pub sha: String,
    pub message: String,
    pub date: Option<String>,
    pub author: Option<String>,
    pub url: String,
}

const BLAME_QUERY: &str = r#"
query($owner: String!, $name: String!, $ref: String!, $path: String!) {
  repository(owner: $owner, name: $name) {
    object(expression: $ref) {
      ... on Commit {
        blame(path: $path) {
          ranges { startingLine endingLine age commit { oid messageHeadline committedDate url author { name user { login } } } }
        }
      }
    }
  }
}"#;


pub async fn blame(c: &GitHubClient, repo: &str, branch: &str, path: &str) -> AppResult<Vec<BlameRange>> {
    let (owner, name) = repo.split_once('/').ok_or_else(|| AppError::new("github.not_found"))?;
    let d = c.graphql(BLAME_QUERY, serde_json::json!({ "owner": owner, "name": name, "ref": branch, "path": path })).await?;
    let ranges = d.pointer("/repository/object/blame/ranges").and_then(Value::as_array).ok_or_else(|| AppError::new("files.missing"))?;
    Ok(ranges.iter().map(parse_blame_range).collect())
}

pub fn parse_blame_range(r: &Value) -> BlameRange {
    let c = &r["commit"];
    let s = |v: &Value| v.as_str().map(str::to_string);
    BlameRange {
        start: r["startingLine"].as_u64().unwrap_or(0) as u32,
        end: r["endingLine"].as_u64().unwrap_or(0) as u32,
        age: r["age"].as_u64().unwrap_or(0) as u32,
        sha: s(&c["oid"]).unwrap_or_default(),
        message: s(&c["messageHeadline"]).unwrap_or_default(),
        date: s(&c["committedDate"]),
        author: s(&c["author"]["user"]["login"]).map(|l| format!("@{l}")).or_else(|| s(&c["author"]["name"])),
        url: s(&c["url"]).unwrap_or_default(),
    }
}

#[cfg(test)]
mod blame_tests {
    use super::*;

    #[test]
    fn parses_ranges() {
        let r = parse_blame_range(&serde_json::json!({ "startingLine": 1, "endingLine": 4, "age": 10, "commit": { "oid": "abc", "messageHeadline": "init", "committedDate": "2026-01-01T00:00:00Z", "url": "u", "author": { "name": "Z", "user": { "login": "z" } } } }));
        assert_eq!((r.start, r.end, r.age), (1, 4, 10));
        assert_eq!(r.author.as_deref(), Some("@z"));
    }
}
