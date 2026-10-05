use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};
use tauri_specta::Event;

use super::scan;
use crate::error::AppResult;
use crate::github::secrets::{self, RepoSecrets};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct SecretsScanProgress {
    pub done: u32,
    pub total: u32,
}


#[tauri::command]
#[specta::specta]
pub async fn secrets_scan(app: AppHandle, state: State<'_, AppState>, repos: Vec<String>, fresh: bool) -> AppResult<Vec<RepoSecrets>> {
    let c = state.active_client()?;
    Ok(scan::bounded(
        repos,
        |repo| {
            let c = c.clone();
            async move { secrets::scan_repo(&c, &repo, fresh).await }
        },
        |done, total| {
            let _ = SecretsScanProgress { done, total }.emit(&app);
        },
    )
    .await)
}

#[tauri::command]
#[specta::specta]
pub async fn secrets_repo(state: State<'_, AppState>, repo: String, fresh: bool) -> AppResult<RepoSecrets> {
    Ok(secrets::scan_repo(&state.active_client()?, &repo, fresh).await)
}
