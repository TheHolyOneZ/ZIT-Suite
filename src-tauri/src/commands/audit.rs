use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager, State};
use tauri_specta::Event;

use crate::audit::{self, AuditReport};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuditStage {
    Download,
    Files,
    History,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct AuditProgress {
    pub repo: String,
    pub stage: AuditStage,
    pub done: u32,
    pub total: u32,
}

fn root(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app.path().app_cache_dir().map_err(|e| AppError::new("audit.io").detail(e.to_string()))?.join("audit"))
}


fn measure(name: &str, repo: &git2::Repository, local: bool, emit: &dyn Fn(AuditStage, u32, u32)) -> AppResult<AuditReport> {
    emit(AuditStage::Files, 0, 0);
    let (branch, head, files) = audit::files_at_head(repo)?;
    emit(AuditStage::History, 0, 0);
    let h = audit::history(repo, 50_000, &|n| emit(AuditStage::History, n, 0))?;
    Ok(AuditReport {
        repo: name.to_string(),
        branch,
        head,
        files,
        commits: h.commits,
        additions: h.additions as f64,
        deletions: h.deletions as f64,
        first_commit: audit::ts(h.first),
        last_commit: audit::ts(h.last),
        contributors: h.contributors,
        monthly: h.monthly,
        history_capped: h.capped,
        generated_at: chrono::Utc::now().to_rfc3339(),
        hot_files: h.hot_files,
        local,
    })
}


#[tauri::command]
#[specta::specta]
pub async fn audit_local(app: AppHandle, path: String) -> AppResult<AuditReport> {
    tauri::async_runtime::spawn_blocking(move || {
        let emit = |stage, done, total| {
            let _ = AuditProgress { repo: path.clone(), stage, done, total }.emit(&app);
        };
        let repo = git2::Repository::open(&path).map_err(|e| AppError::new("audit.not_git").detail(e.to_string()))?;
        measure(&path, &repo, true, &emit)
    })
    .await
    .map_err(|e| AppError::new("internal.unknown").detail(e.to_string()))?
}


#[tauri::command]
#[specta::specta]
pub async fn audit_run(app: AppHandle, state: State<'_, AppState>, repo: String) -> AppResult<AuditReport> {
    let token = state.active_client().ok().map(|c| c.token().to_string());
    let dir = audit::cache_dir(&root(&app)?, &repo);
    tauri::async_runtime::spawn_blocking(move || {
        let emit = |stage, done, total| {
            let _ = AuditProgress { repo: repo.clone(), stage, done, total }.emit(&app);
        };
        let url = format!("https://github.com/{repo}.git");
        let mirror = audit::sync_mirror(&url, &dir, token.as_deref(), &|d, t| emit(AuditStage::Download, d, t)).inspect_err(|_| {

            if !dir.join("HEAD").exists() {
                let _ = std::fs::remove_dir_all(&dir);
            }
        })?;
        measure(&repo, &mirror, false, &emit)
    })
    .await
    .map_err(|e| AppError::new("internal.unknown").detail(e.to_string()))?
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AuditCache {
    pub bytes: f64,
    pub repos: Vec<String>,
}

#[tauri::command]
#[specta::specta]
pub fn audit_cache(app: AppHandle) -> AppResult<AuditCache> {
    let root = root(&app)?;
    let repos = std::fs::read_dir(&root)
        .map(|rd| rd.flatten().filter_map(|e| e.file_name().to_str().map(|n| n.replacen("__", "/", 1))).collect())
        .unwrap_or_default();
    Ok(AuditCache { bytes: audit::dir_size(&root) as f64, repos })
}


#[tauri::command]
#[specta::specta]
pub fn audit_cache_clear(app: AppHandle, repo: Option<String>) -> AppResult<()> {
    let root = root(&app)?;
    let target = match &repo {
        Some(r) => audit::cache_dir(&root, r),
        None => root,
    };
    match std::fs::remove_dir_all(&target) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(AppError::new("audit.io").detail(e.to_string())),
    }
}
