use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};
use tauri_specta::Event;

use super::scan;
use crate::error::AppResult;
use crate::github::stats::{self, ContributorStats};
use crate::github::traffic::{self, Traffic};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct TrafficProgress {
    pub done: u32,
    pub total: u32,
}


#[tauri::command]
#[specta::specta]
pub async fn insights_traffic(app: AppHandle, state: State<'_, AppState>, repos: Vec<String>, fresh: bool) -> AppResult<Vec<Traffic>> {
    let c = state.active_client()?;
    Ok(scan::bounded(
        repos,
        |repo| {
            let c = c.clone();
            async move { traffic::get(&c, &repo, fresh).await }
        },
        |done, total| {
            let _ = TrafficProgress { done, total }.emit(&app);
        },
    )
    .await)
}


#[tauri::command]
#[specta::specta]
pub async fn insights_contributors(state: State<'_, AppState>, repo: String) -> AppResult<ContributorStats> {
    stats::contributors(&state.active_client()?, &repo).await
}
