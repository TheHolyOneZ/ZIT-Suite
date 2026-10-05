use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};
use tauri_specta::Event;

use crate::error::AppResult;
use crate::github::collaborators::{self, Collaborator, Invitation, RepoAccess, Role};
use super::scan;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct AccessScanProgress {
    pub done: u32,
    pub total: u32,
}


#[tauri::command]
#[specta::specta]
pub async fn collab_scan(app: AppHandle, state: State<'_, AppState>, repos: Vec<String>, fresh: bool) -> AppResult<Vec<RepoAccess>> {
    let c = state.active_client()?;
    Ok(scan::bounded(
        repos,
        |repo| {
            let c = c.clone();
            async move { collaborators::access(&c, &repo, fresh).await }
        },
        |done, total| {
            let _ = AccessScanProgress { done, total }.emit(&app);
        },
    )
    .await)
}

#[tauri::command]
#[specta::specta]
pub async fn collab_access(state: State<'_, AppState>, repo: String, fresh: bool) -> AppResult<RepoAccess> {
    Ok(collaborators::access(&state.active_client()?, &repo, fresh).await)
}

#[tauri::command]
#[specta::specta]
pub async fn collab_list(state: State<'_, AppState>, repo: String) -> AppResult<Vec<Collaborator>> {
    collaborators::list(&state.active_client()?, &repo, true).await
}

#[tauri::command]
#[specta::specta]
pub async fn collab_invitations(state: State<'_, AppState>, repo: String) -> AppResult<Vec<Invitation>> {
    collaborators::invitations(&state.active_client()?, &repo, true).await
}

#[tauri::command]
#[specta::specta]
pub async fn collab_update_invitation(state: State<'_, AppState>, repo: String, id: u64, role: Role) -> AppResult<()> {
    collaborators::update_invitation(&state.active_client()?, &repo, id, role).await
}
