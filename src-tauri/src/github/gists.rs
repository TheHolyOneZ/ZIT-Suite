use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use specta::Type;

use super::client::GitHubClient;
use super::issues::{Comment, SimpleUser};
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GistFile {
    pub filename: String,
    pub language: Option<String>,
    pub size: u64,
    pub raw_url: String,

    pub content: Option<String>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Gist {
    pub id: String,
    pub description: String,
    pub public: bool,
    pub html_url: String,
    pub created_at: String,
    pub updated_at: String,
    pub comments: u32,
    pub owner: String,
    pub files: Vec<GistFile>,
}

fn gist_of(v: &Value) -> Gist {
    let s = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
    let mut files: Vec<GistFile> = v
        .get("files")
        .and_then(Value::as_object)
        .map(|m| {
            m.values()
                .map(|f| GistFile {
                    filename: f.get("filename").and_then(Value::as_str).unwrap_or_default().to_string(),
                    language: f.get("language").and_then(Value::as_str).map(str::to_string),
                    size: f.get("size").and_then(Value::as_u64).unwrap_or(0),
                    raw_url: f.get("raw_url").and_then(Value::as_str).unwrap_or_default().to_string(),
                    content: f.get("content").and_then(Value::as_str).map(str::to_string),
                    truncated: f.get("truncated").and_then(Value::as_bool).unwrap_or(false),
                })
                .collect()
        })
        .unwrap_or_default();
    files.sort_by_key(|f| f.filename.to_lowercase());
    Gist {
        id: s("id"),
        description: s("description"),
        public: v.get("public").and_then(Value::as_bool).unwrap_or(false),
        html_url: s("html_url"),
        created_at: s("created_at"),
        updated_at: s("updated_at"),
        comments: v.get("comments").and_then(Value::as_u64).unwrap_or(0) as u32,
        owner: v.pointer("/owner/login").and_then(Value::as_str).unwrap_or_default().to_string(),
        files,
    }
}

pub async fn list(c: &GitHubClient, starred: bool, fresh: bool) -> AppResult<Vec<Gist>> {
    let path = if starred { "/gists/starred?per_page=100" } else { "/gists?per_page=100" };
    let raw: Vec<Value> = c.paginate_with(path, fresh).await?;
    Ok(raw.iter().map(gist_of).collect())
}

pub async fn get(c: &GitHubClient, id: &str, revision: Option<&str>) -> AppResult<Gist> {
    let path = match revision {
        Some(sha) => format!("/gists/{id}/{sha}"),
        None => format!("/gists/{id}"),
    };
    Ok(gist_of(&c.get_json::<Value>(&path).await?))
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct NewFile {
    pub name: String,
    pub content: String,
}

fn check_files(files: &[NewFile]) -> AppResult<()> {
    if files.is_empty() || files.iter().any(|f| f.content.trim().is_empty()) {
        return Err(AppError::new("gists.empty_file"));
    }
    let mut names: Vec<String> = files.iter().map(|f| f.name.trim().to_lowercase()).collect();
    if names.iter().any(|n| n.is_empty() || n.contains('/') || n.starts_with("gistfile")) {
        return Err(AppError::new("gists.bad_name"));
    }
    names.sort();
    names.dedup();
    if names.len() != files.len() {
        return Err(AppError::new("gists.duplicate_name"));
    }
    Ok(())
}

pub async fn create(c: &GitHubClient, description: &str, public: bool, files: &[NewFile]) -> AppResult<Gist> {
    check_files(files)?;
    let map: Map<String, Value> = files.iter().map(|f| (f.name.trim().to_string(), json!({ "content": f.content }))).collect();
    let v = c.send_json(Method::POST, "/gists", Some(&json!({ "description": description, "public": public, "files": map }))).await?;
    Ok(gist_of(&v.unwrap_or_default()))
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileEdit {

    pub name: String,
    pub new_name: Option<String>,
    pub content: Option<String>,
    pub delete: bool,
}

pub fn patch_body(description: Option<&str>, edits: &[FileEdit]) -> Value {
    let mut files = Map::new();
    for e in edits {
        let v = if e.delete {
            Value::Null
        } else {
            let mut o = Map::new();
            if let Some(n) = e.new_name.as_deref().filter(|n| *n != e.name) {
                o.insert("filename".into(), json!(n.trim()));
            }
            if let Some(c) = &e.content {
                o.insert("content".into(), json!(c));
            }
            Value::Object(o)
        };
        files.insert(e.name.clone(), v);
    }
    let mut body = json!({ "files": files });
    if let Some(d) = description {
        body["description"] = json!(d);
    }
    body
}

pub async fn update(c: &GitHubClient, id: &str, description: Option<&str>, edits: &[FileEdit]) -> AppResult<Gist> {
    let v = c.send_json(Method::PATCH, &format!("/gists/{id}"), Some(&patch_body(description, edits))).await?;
    Ok(gist_of(&v.unwrap_or_default()))
}

pub async fn delete(c: &GitHubClient, id: &str) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/gists/{id}"), None).await.map(drop)
}

pub async fn set_starred(c: &GitHubClient, id: &str, on: bool) -> AppResult<()> {
    let m = if on { Method::PUT } else { Method::DELETE };
    c.send_json::<()>(m, &format!("/gists/{id}/star"), None).await.map(drop)
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Revision {
    pub version: String,
    pub committed_at: String,
    pub additions: u32,
    pub deletions: u32,
}

pub async fn revisions(c: &GitHubClient, id: &str) -> AppResult<Vec<Revision>> {
    let raw: Vec<Value> = c.paginate_with(&format!("/gists/{id}/commits?per_page=100"), true).await?;
    Ok(raw
        .iter()
        .map(|v| Revision {
            version: v.get("version").and_then(Value::as_str).unwrap_or_default().to_string(),
            committed_at: v.get("committed_at").and_then(Value::as_str).unwrap_or_default().to_string(),
            additions: v.pointer("/change_status/additions").and_then(Value::as_u64).unwrap_or(0) as u32,
            deletions: v.pointer("/change_status/deletions").and_then(Value::as_u64).unwrap_or(0) as u32,
        })
        .collect())
}


fn comment_of(gist: &str, v: &Value) -> Comment {
    let id = v.get("id").and_then(Value::as_u64).unwrap_or(0);
    let s = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
    Comment {
        id,
        user: SimpleUser {
            login: v.pointer("/user/login").and_then(Value::as_str).unwrap_or("ghost").to_string(),
            avatar_url: v.pointer("/user/avatar_url").and_then(Value::as_str).unwrap_or_default().to_string(),
        },
        body: s("body"),
        html_url: format!("https://gist.github.com/{gist}#gistcomment-{id}"),
        author_association: s("author_association"),
        created_at: s("created_at"),
        updated_at: s("updated_at"),
    }
}

pub async fn comments(c: &GitHubClient, id: &str) -> AppResult<Vec<Comment>> {
    let raw: Vec<Value> = c.paginate_with(&format!("/gists/{id}/comments?per_page=100"), true).await?;
    Ok(raw.iter().map(|v| comment_of(id, v)).collect())
}

pub async fn add_comment(c: &GitHubClient, id: &str, body: &str) -> AppResult<Comment> {
    let v = c.send_json(Method::POST, &format!("/gists/{id}/comments"), Some(&json!({ "body": body }))).await?;
    Ok(comment_of(id, &v.unwrap_or_default()))
}

pub async fn delete_comment(c: &GitHubClient, id: &str, comment: u64) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/gists/{id}/comments/{comment}"), None).await.map(drop)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_renames_edits_and_deletes() {
        let edits = vec![
            FileEdit { name: "a.md".into(), new_name: Some("b.md".into()), content: Some("x".into()), delete: false },
            FileEdit { name: "old.txt".into(), new_name: None, content: None, delete: true },
            FileEdit { name: "same.rs".into(), new_name: Some("same.rs".into()), content: Some("fn".into()), delete: false },
        ];
        let b = patch_body(Some("desc"), &edits);
        assert_eq!(b["description"], "desc");
        assert_eq!(b["files"]["a.md"], json!({ "filename": "b.md", "content": "x" }));
        assert!(b["files"]["old.txt"].is_null());
        assert_eq!(b["files"]["same.rs"], json!({ "content": "fn" }));
    }

    #[test]
    fn gist_comment_without_html_url() {
        let c = comment_of("abc", &json!({ "id": 7, "body": "hi", "user": null, "created_at": "t", "updated_at": "t" }));
        assert_eq!(c.user.login, "ghost");
        assert_eq!(c.html_url, "https://gist.github.com/abc#gistcomment-7");
    }

    #[test]
    fn file_rules() {
        let f = |n: &str, c: &str| NewFile { name: n.into(), content: c.into() };
        assert!(check_files(&[f("a.md", "x")]).is_ok());
        assert_eq!(check_files(&[]).unwrap_err().code, "gists.empty_file");
        assert_eq!(check_files(&[f("a.md", " ")]).unwrap_err().code, "gists.empty_file");
        assert_eq!(check_files(&[f("a/b.md", "x")]).unwrap_err().code, "gists.bad_name");
        assert_eq!(check_files(&[f("A.md", "x"), f("a.md", "y")]).unwrap_err().code, "gists.duplicate_name");
    }

    #[test]
    fn parses_files_sorted() {
        let g = gist_of(&json!({ "id": "1", "public": false, "files": { "z.rs": { "filename": "z.rs", "size": 3 }, "A.md": { "filename": "A.md", "size": 1, "content": "hi" } }, "owner": { "login": "me" } }));
        assert_eq!(g.files.iter().map(|f| f.filename.as_str()).collect::<Vec<_>>(), ["A.md", "z.rs"]);
        assert_eq!(g.files[0].content.as_deref(), Some("hi"));
        assert_eq!(g.owner, "me");
    }
}
