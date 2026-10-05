use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};
use tauri_specta::Event;

use super::scan;
use crate::error::AppResult;
use crate::github::security::{self, RepoSecurity};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct SecurityScanProgress {
    pub done: u32,
    pub total: u32,
}


#[tauri::command]
#[specta::specta]
pub async fn security_scan(app: AppHandle, state: State<'_, AppState>, repos: Vec<String>, fresh: bool) -> AppResult<Vec<RepoSecurity>> {
    let c = state.active_client()?;
    Ok(scan::bounded(
        repos,
        |repo| {
            let c = c.clone();
            async move { security::scan_repo(&c, &repo, false, fresh).await }
        },
        |done, total| {
            let _ = SecurityScanProgress { done, total }.emit(&app);
        },
    )
    .await)
}


#[tauri::command]
#[specta::specta]
pub async fn security_repo(state: State<'_, AppState>, repo: String, closed: bool, fresh: bool) -> AppResult<RepoSecurity> {
    Ok(security::scan_repo(&state.active_client()?, &repo, closed, fresh).await)
}
