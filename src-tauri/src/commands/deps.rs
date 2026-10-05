use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};
use tauri_specta::Event;

use super::scan;
use crate::error::AppResult;
use crate::github::deps::{self, DepsTarget, Latest, PackageRef, RepoDeps};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct DepsProgress {

    pub phase: String,
    pub done: u32,
    pub total: u32,
}


#[tauri::command]
#[specta::specta]
pub async fn deps_scan(app: AppHandle, state: State<'_, AppState>, targets: Vec<DepsTarget>, fresh: bool) -> AppResult<Vec<RepoDeps>> {
    let c = state.active_client()?;
    Ok(scan::bounded(
        targets,
        |t| {
            let c = c.clone();
            async move { deps::scan(&c, &t, fresh).await }
        },
        |done, total| {
            let _ = DepsProgress { phase: "scan".into(), done, total }.emit(&app);
        },
    )
    .await)
}


#[tauri::command]
#[specta::specta]
pub async fn deps_latest(app: AppHandle, packages: Vec<PackageRef>) -> AppResult<Vec<Latest>> {
    Ok(deps::latest(packages, |done, total| {
        let _ = DepsProgress { phase: "latest".into(), done, total }.emit(&app);
    })
    .await)
}
