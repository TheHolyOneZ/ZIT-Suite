use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::github::files::{self, Blob, Change, CommitResult, FileCommit, RepoTree};
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn files_tree(state: State<'_, AppState>, repo: String, branch: String, fresh: bool) -> AppResult<RepoTree> {
    files::tree(&state.active_client()?, &repo, &branch, fresh).await
}

#[tauri::command]
#[specta::specta]
pub async fn files_blob(state: State<'_, AppState>, repo: String, sha: String) -> AppResult<Blob> {
    files::blob(&state.active_client()?, &repo, &sha).await
}

#[tauri::command]
#[specta::specta]
pub async fn files_history(state: State<'_, AppState>, repo: String, branch: String, path: String) -> AppResult<Vec<FileCommit>> {
    files::history(&state.active_client()?, &repo, &branch, &path).await
}

#[tauri::command]
#[specta::specta]
pub async fn files_at_commit(state: State<'_, AppState>, repo: String, commit: String, path: String) -> AppResult<Option<Blob>> {
    files::at_commit(&state.active_client()?, &repo, &commit, &path).await
}


#[tauri::command]
#[specta::specta]
pub async fn files_commit(state: State<'_, AppState>, repo: String, branch: String, base_commit: String, new_branch: bool, message: String, changes: Vec<Change>) -> AppResult<CommitResult> {
    let c = state.active_client()?;
    let items = files::items_at(&c, &repo, &base_commit).await?;
    files::commit(&c, &repo, &branch, &base_commit, new_branch, &message, &changes, &items).await
}


#[tauri::command]
#[specta::specta]
pub fn files_read_local(path: String) -> AppResult<String> {
    if std::fs::metadata(&path)?.len() > 25 * 1024 * 1024 {
        return Err(AppError::new("files.too_large"));
    }
    Ok(B64.encode(std::fs::read(&path)?))
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LocalFile {

    pub rel: String,

    pub abs: String,
    pub size: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FolderScan {
    pub name: String,
    pub files: Vec<LocalFile>,

    pub skipped: Vec<String>,
    pub skipped_count: u32,

    pub too_large: Vec<String>,

    pub truncated: bool,
}

const MAX_FOLDER_FILES: usize = 2000;
const FILE_LIMIT: u64 = 25 * 1024 * 1024;

const ALWAYS_SKIP: &[&str] = &[".git", "node_modules", "target", ".DS_Store", "Thumbs.db", "__pycache__", ".venv", ".idea"];


#[tauri::command]
#[specta::specta]
pub fn files_scan_folder(path: String) -> AppResult<FolderScan> {
    let root = std::path::Path::new(&path);
    if !root.is_dir() {
        return Err(AppError::new("files.not_folder"));
    }
    let name = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let mut out = FolderScan { name, files: vec![], skipped: vec![], skipped_count: 0, too_large: vec![], truncated: false };
    let rel_of = |p: &std::path::Path| p.strip_prefix(root).unwrap_or(p).components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>().join("/");

    let kept: std::collections::HashSet<std::path::PathBuf> = ignore::WalkBuilder::new(root)
        .hidden(false)
        .git_ignore(true)
        .git_exclude(false)
        .git_global(false)
        .require_git(false)
        .filter_entry(|e| !ALWAYS_SKIP.contains(&e.file_name().to_string_lossy().as_ref()))
        .build()
        .flatten()
        .filter(|e| e.file_type().is_some_and(|t| t.is_file()))
        .map(|e| e.into_path())
        .collect();
    for e in ignore::WalkBuilder::new(root).hidden(false).ignore(false).git_ignore(false).parents(false).filter_entry(|e| e.file_name() != ".git").build().flatten() {
        if !e.file_type().is_some_and(|t| t.is_file()) {
            continue;
        }
        let rel = rel_of(e.path());
        if !kept.contains(e.path()) {
            out.skipped_count += 1;
            if out.skipped.len() < 30 {
                out.skipped.push(rel);
            }
            continue;
        }
        let size = e.metadata().map(|m| m.len()).unwrap_or(0);
        if size > FILE_LIMIT {
            out.too_large.push(rel);
            continue;
        }
        if out.files.len() >= MAX_FOLDER_FILES {
            out.truncated = true;
            break;
        }
        out.files.push(LocalFile { rel, abs: e.path().to_string_lossy().into_owned(), size: size as f64 });
    }
    out.files.sort_by(|a, b| a.rel.cmp(&b.rel));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_scan_respects_gitignore() {
        let dir = std::env::temp_dir().join(format!("zit-scan-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        for (p, body) in [("a.txt", "a"), ("src/main.rs", "fn main(){}"), ("build/out.bin", "x"), (".gitignore", "build/\n*.log\n"), ("debug.log", "l"), ("node_modules/x/i.js", "j"), (".github/workflows/ci.yml", "on: push")] {
            let f = dir.join(p);
            std::fs::create_dir_all(f.parent().unwrap()).unwrap();
            std::fs::write(f, body).unwrap();
        }
        let s = files_scan_folder(dir.to_string_lossy().into_owned()).unwrap();
        let rels: Vec<&str> = s.files.iter().map(|f| f.rel.as_str()).collect();
        assert_eq!(rels, [".github/workflows/ci.yml", ".gitignore", "a.txt", "src/main.rs"]);
        assert_eq!(s.skipped_count, 3, "{:?}", s.skipped);
        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[tauri::command]
#[specta::specta]
pub async fn files_blame(state: State<'_, AppState>, repo: String, branch: String, path: String) -> AppResult<Vec<files::BlameRange>> {
    files::blame(&state.active_client()?, &repo, &branch, &path).await
}

#[tauri::command]
#[specta::specta]
pub async fn files_dir(state: State<'_, AppState>, repo: String, path: String, git_ref: Option<String>) -> AppResult<Vec<files::DirEntry>> {
    files::list_dir(&state.active_client()?, &repo, &path, git_ref.as_deref()).await
}

#[tauri::command]
#[specta::specta]
pub async fn files_read_text(state: State<'_, AppState>, repo: String, path: String, git_ref: Option<String>) -> AppResult<Option<String>> {
    files::read_text(&state.active_client()?, &repo, &path, git_ref.as_deref()).await
}
