use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};
use tauri_specta::Event;

use super::scan;
use crate::error::AppResult;
use crate::github::hooks::{self, DeliveryDetail, DeliveryPage, Hook, HookHealth, HookPatch, RepoHooks};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct HooksScanProgress {
    pub done: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct HooksHealthProgress {
    pub done: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct HookRef {
    pub repo: String,
    pub id: u64,
}


#[tauri::command]
#[specta::specta]
pub async fn hooks_scan(app: AppHandle, state: State<'_, AppState>, repos: Vec<String>, fresh: bool) -> AppResult<Vec<RepoHooks>> {
    let c = state.active_client()?;
    Ok(scan::bounded(
        repos,
        |repo| {
            let c = c.clone();
            async move { hooks::repo_hooks(&c, &repo, fresh).await }
        },
        |done, total| {
            let _ = HooksScanProgress { done, total }.emit(&app);
        },
    )
    .await)
}

#[tauri::command]
#[specta::specta]
pub async fn hooks_list(state: State<'_, AppState>, repo: String, fresh: bool) -> AppResult<RepoHooks> {
    Ok(hooks::repo_hooks(&state.active_client()?, &repo, fresh).await)
}


#[tauri::command]
#[specta::specta]
pub async fn hooks_patch(state: State<'_, AppState>, repo: String, id: u64, patch: HookPatch) -> AppResult<Hook> {
    let c = state.active_client()?;
    let current = hooks::get(&c, &repo, id).await?;
    let p = hooks::effective_patch(&current, &patch);
    if p.is_empty() {
        return Ok(current);
    }
    hooks::patch(&c, &repo, id, &p).await?;
    hooks::get(&c, &repo, id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hooks_test_push(state: State<'_, AppState>, repo: String, id: u64) -> AppResult<()> {
    hooks::test_push(&state.active_client()?, &repo, id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hooks_ping(state: State<'_, AppState>, repo: String, id: u64) -> AppResult<()> {
    hooks::ping(&state.active_client()?, &repo, id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hooks_deliveries(state: State<'_, AppState>, repo: String, id: u64, page: Option<String>, fresh: bool) -> AppResult<DeliveryPage> {
    hooks::deliveries(&state.active_client()?, &repo, id, page, 50, fresh).await
}

#[tauri::command]
#[specta::specta]
pub async fn hooks_delivery(state: State<'_, AppState>, repo: String, id: u64, delivery_id: String) -> AppResult<DeliveryDetail> {
    hooks::delivery(&state.active_client()?, &repo, id, &delivery_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hooks_redeliver(state: State<'_, AppState>, repo: String, id: u64, delivery_id: String) -> AppResult<()> {
    hooks::redeliver(&state.active_client()?, &repo, id, &delivery_id).await
}


#[tauri::command]
#[specta::specta]
pub async fn hooks_health(app: AppHandle, state: State<'_, AppState>, targets: Vec<HookRef>, per_hook: u32) -> AppResult<Vec<HookHealth>> {
    let c = state.active_client()?;
    Ok(scan::bounded(
        targets,
        |t| {
            let c = c.clone();
            async move {
                match hooks::deliveries(&c, &t.repo, t.id, None, per_hook, false).await {
                    Ok(page) => hooks::summarize(&t.repo, t.id, &page.items),
                    Err(error) => HookHealth { repo: t.repo, id: t.id, checked: 0, failed: 0, last_failure: None, last_delivery: None, error: Some(error) },
                }
            }
        },
        |done, total| {
            let _ = HooksHealthProgress { done, total }.emit(&app);
        },
    )
    .await)
}
