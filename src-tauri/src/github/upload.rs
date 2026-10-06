use std::collections::HashMap;
use std::path::Path;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use futures_util::stream::{self, StreamExt};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;

use super::client::{enc, GitHubClient};
use super::files::{self, CommitResult};
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FileState {
    New,
    Changed,
    Same,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PlanFile {
    pub rel: String,
    pub size: f64,
    pub state: FileState,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct UploadPlan {
    pub name: String,
    pub base_commit: Option<String>,
    pub files: Vec<PlanFile>,
    pub skipped: Vec<String>,
    pub skipped_count: u32,
    pub too_large: Vec<String>,
    pub truncated: bool,
}

pub fn target_path(into: &str, rel: &str) -> AppResult<String> {
    let into = into.trim().trim_matches('/');
    let p = if into.is_empty() { rel.to_string() } else { format!("{into}/{rel}") };
    if p.split('/').any(|s| s.is_empty() || s == "." || s == ".." || s == ".git") {
        return Err(AppError::new("files.bad_path").detail(p));
    }
    Ok(p)
}

pub fn local_sha(abs: &Path) -> Option<String> {
    git2::Oid::hash_file(git2::ObjectType::Blob, abs).ok().map(|o| o.to_string())
}

fn is_executable(abs: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        return std::fs::metadata(abs).map(|m| m.permissions().mode() & 0o111 != 0).unwrap_or(false);
    }
    #[allow(unreachable_code)]
    {
        let _ = abs;
        false
    }
}

async fn base_of(c: &GitHubClient, repo: &str, branch: &str) -> AppResult<Option<files::RepoTree>> {
    match files::tree(c, repo, branch, true).await {
        Ok(t) => Ok(Some(t)),
        Err(e) if matches!(e.code.as_str(), "github.not_found" | "files.no_branch" | "github.conflict") => {
            let r: Value = c.get_json(&format!("/repos/{repo}")).await?;
            let empty = r.get("size").and_then(Value::as_u64) == Some(0) && {
                let b: Vec<Value> = c.get_json(&format!("/repos/{repo}/branches?per_page=1")).await.unwrap_or_default();
                b.is_empty()
            };
            if empty { Ok(None) } else { Err(AppError::new("files.no_branch").detail(branch.to_string())) }
        }
        Err(e) => Err(e),
    }
}

pub async fn plan(c: &GitHubClient, repo: &str, branch: &str, folder: &str, into: &str) -> AppResult<UploadPlan> {
    let scan = crate::commands::files::files_scan_folder(folder.to_string())?;
    let base = base_of(c, repo, branch).await?;
    let remote: HashMap<&str, &str> =
        base.as_ref().map(|t| t.items.iter().filter(|i| i.kind == "blob").map(|i| (i.path.as_str(), i.sha.as_str())).collect()).unwrap_or_default();
    let mut files = Vec::with_capacity(scan.files.len());
    for f in &scan.files {
        let path = target_path(into, &f.rel)?;
        let state = match remote.get(path.as_str()) {
            None => FileState::New,
            Some(sha) if local_sha(Path::new(&f.abs)).as_deref() == Some(*sha) => FileState::Same,
            Some(_) => FileState::Changed,
        };
        files.push(PlanFile { rel: f.rel.clone(), size: f.size, state });
    }
    Ok(UploadPlan {
        name: scan.name,
        base_commit: base.map(|t| t.commit),
        files,
        skipped: scan.skipped,
        skipped_count: scan.skipped_count,
        too_large: scan.too_large,
        truncated: scan.truncated,
    })
}

fn read_b64(abs: &Path) -> AppResult<String> {
    std::fs::read(abs).map(|b| B64.encode(b)).map_err(|e| AppError::new("files.read_failed").detail(format!("{}: {e}", abs.display())))
}

#[allow(clippy::too_many_arguments)]
pub async fn run(
    c: &GitHubClient,
    repo: &str,
    branch: &str,
    base_commit: Option<&str>,
    folder: &str,
    into: &str,
    rels: &[String],
    message: &str,
    progress: &(dyn Fn(u32, u32) + Sync),
) -> AppResult<CommitResult> {
    let message = message.trim();
    if message.is_empty() {
        return Err(AppError::new("files.no_message"));
    }
    if rels.is_empty() {
        return Err(AppError::new("files.nothing"));
    }
    let root = Path::new(folder);
    let total = rels.len() as u32;
    let mut done = 0u32;
    let base = match base_commit {
        Some(b) => {
            let (h, _) = c.get_page(&format!("/repos/{repo}/branches/{}", enc(branch)), true).await?;
            let head = h.pointer("/commit/sha").and_then(Value::as_str).unwrap_or_default();
            if head != b {
                return Err(AppError::new("files.stale").detail(head.chars().take(7).collect::<String>()));
            }
            Some(b.to_string())
        }
        None => {
            let first = &rels[0];
            let path = target_path(into, first)?;
            let body = json!({ "message": message, "content": read_b64(&root.join(first))?, "branch": branch });
            let v = c
                .send_json(Method::PUT, &format!("/repos/{repo}/contents/{}", path.split('/').map(enc).collect::<Vec<_>>().join("/")), Some(&body))
                .await?
                .unwrap_or_default();
            let sha = v.pointer("/commit/sha").and_then(Value::as_str).unwrap_or_default().to_string();
            if rels.len() == 1 {
                progress(1, total);
                return Ok(CommitResult { url: format!("https://github.com/{repo}/commit/{sha}"), sha, branch: branch.to_string() });
            }
            None
        }
    };

    let mut entries = Vec::with_capacity(rels.len());
    let jobs: Vec<(String, std::path::PathBuf)> = rels.iter().map(|rel| (rel.clone(), root.join(rel))).collect();
    let mut blobs = stream::iter(jobs.into_iter().map(|(rel, abs)| {
        let c = c.clone();
        let repo = repo.to_string();
        let into = into.to_string();
        async move {
            let path = target_path(&into, &rel)?;
            let content = read_b64(&abs)?;
            let v = c.send_json(Method::POST, &format!("/repos/{repo}/git/blobs"), Some(&json!({ "content": content, "encoding": "base64" }))).await?.unwrap_or_default();
            let sha = v.get("sha").and_then(Value::as_str).unwrap_or_default().to_string();
            let mode = if is_executable(&abs) { "100755" } else { "100644" };
            Ok::<Value, AppError>(json!({ "path": path, "mode": mode, "type": "blob", "sha": sha }))
        }
    }))
    .buffer_unordered(4);
    while let Some(e) = blobs.next().await {
        entries.push(e?);
        done += 1;
        progress(done, total);
    }

    let tree_body = match &base {
        Some(b) => {
            let parent: Value = c.get_json(&format!("/repos/{repo}/git/commits/{b}")).await?;
            let base_tree = parent.pointer("/tree/sha").and_then(Value::as_str).unwrap_or_default().to_string();
            json!({ "base_tree": base_tree, "tree": entries })
        }
        None => json!({ "tree": entries }),
    };
    let tree = c.send_json(Method::POST, &format!("/repos/{repo}/git/trees"), Some(&tree_body)).await?.unwrap_or_default();
    let tree_sha = tree.get("sha").and_then(Value::as_str).unwrap_or_default();
    let parents: Vec<&str> = base.iter().map(String::as_str).collect();
    let cm = c
        .send_json(Method::POST, &format!("/repos/{repo}/git/commits"), Some(&json!({ "message": message, "tree": tree_sha, "parents": parents })))
        .await?
        .unwrap_or_default();
    let sha = cm.get("sha").and_then(Value::as_str).unwrap_or_default().to_string();
    c.send_json(Method::PATCH, &format!("/repos/{repo}/git/refs/heads/{}", enc(branch)), Some(&json!({ "sha": sha, "force": base.is_none() })))
        .await
        .map_err(|e| if e.code == "github.validation" { AppError::new("files.stale") } else { e })?;
    Ok(CommitResult { url: format!("https://github.com/{repo}/commit/{sha}"), sha, branch: branch.to_string() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn live_upload_folder() {
        let var = |k: &str| std::env::var(k).unwrap_or_else(|_| panic!("{k}"));
        let repo = var("ZIT_TEST_REPO");
        assert!(repo.contains("zit-suite-sandbox"), "refusing to touch a non-sandbox repo");
        let c = GitHubClient::new(var("ZIT_TEST_TOKEN")).unwrap();
        let dir = std::env::temp_dir().join(format!("zit-live-upload-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::create_dir_all(dir.join("node_modules/x")).unwrap();
        std::fs::write(dir.join("README.md"), "# sandbox\n").unwrap();
        std::fs::write(dir.join("src/main.rs"), "fn main() {}\n").unwrap();
        std::fs::write(dir.join("node_modules/x/skip.js"), "skip").unwrap();
        let folder = dir.to_string_lossy().to_string();
        let calls = std::sync::atomic::AtomicU32::new(0);
        let prog = |_: u32, _: u32| {
            calls.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        };

        let p = plan(&c, &repo, "main", &folder, "").await.unwrap();
        assert!(p.base_commit.is_none(), "sandbox must start empty");
        assert!(p.files.iter().all(|f| f.state == FileState::New));
        assert!(!p.files.iter().any(|f| f.rel.contains("node_modules")));
        let rels: Vec<String> = p.files.iter().map(|f| f.rel.clone()).collect();
        run(&c, &repo, "main", None, &folder, "", &rels, "First upload", &prog).await.unwrap();

        std::fs::write(dir.join("src/main.rs"), "fn main() { println!(\"hi\"); }\n").unwrap();
        std::fs::write(dir.join("src/new.rs"), "pub fn x() {}\n").unwrap();
        let p = plan(&c, &repo, "main", &folder, "").await.unwrap();
        let st = |r: &str| p.files.iter().find(|f| f.rel == r).unwrap().state;
        assert_eq!((st("README.md"), st("src/main.rs"), st("src/new.rs")), (FileState::Same, FileState::Changed, FileState::New));
        let rels = vec!["src/main.rs".to_string(), "src/new.rs".to_string()];
        let r = run(&c, &repo, "main", p.base_commit.as_deref(), &folder, "", &rels, "Second upload", &prog).await.unwrap();
        let log: Vec<Value> = c.get_json(&format!("/repos/{repo}/commits?sha=main")).await.unwrap();
        let msgs: Vec<&str> = log.iter().filter_map(|x| x.pointer("/commit/message").and_then(Value::as_str)).collect();
        assert_eq!(msgs, ["Second upload", "First upload"]);
        assert_eq!(r.sha.len(), 40);
        let p = plan(&c, &repo, "main", &folder, "").await.unwrap();
        assert!(p.files.iter().all(|f| f.state == FileState::Same), "everything on GitHub now");
        assert!(calls.load(std::sync::atomic::Ordering::Relaxed) >= 4);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn target_paths() {
        assert_eq!(target_path("", "a/b.txt").unwrap(), "a/b.txt");
        assert_eq!(target_path("/docs/", "x.md").unwrap(), "docs/x.md");
        assert_eq!(target_path("..", "x").unwrap_err().code, "files.bad_path");
        assert_eq!(target_path("", ".git/config").unwrap_err().code, "files.bad_path");
    }

    #[test]
    fn local_sha_matches_git() {
        let p = std::env::temp_dir().join(format!("zit-upload-{}.txt", std::process::id()));
        std::fs::write(&p, "hello\n").unwrap();
        assert_eq!(local_sha(&p).as_deref(), Some("ce013625030ba8dba906f756967f9e9ca394464a"));
        let _ = std::fs::remove_file(p);
    }
}
