use tauri::{AppHandle, State};

use crate::error::AppResult;
use crate::queue::{self, DryRunResult, NewQueueItem, QueueSnapshot};
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub fn queue_get(state: State<'_, AppState>) -> QueueSnapshot {
    state.queue.snapshot()
}

#[tauri::command]
#[specta::specta]
pub async fn queue_dry_run(state: State<'_, AppState>, items: Vec<NewQueueItem>) -> AppResult<Vec<DryRunResult>> {
    let id = state.active_account_id()?;
    let scopes = state.accounts.lock().unwrap().get(&id).and_then(|a| a.scopes.clone());
    let client = state.client_for(&id)?;
    Ok(queue::dry_run(&client, scopes, items).await)
}


#[tauri::command]
#[specta::specta]
pub fn queue_submit(
    app: AppHandle,
    state: State<'_, AppState>,
    items: Vec<NewQueueItem>,
    grace_secs: u32,
) -> AppResult<()> {
    let id = state.active_account_id()?;
    state.queue.enqueue(&app, &id, items);
    state.queue.start(&app, grace_secs);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn queue_start(app: AppHandle, state: State<'_, AppState>, grace_secs: u32) {
    state.queue.start(&app, grace_secs);
}

#[tauri::command]
#[specta::specta]
pub fn queue_pause(app: AppHandle, state: State<'_, AppState>) {
    state.queue.pause(&app);
}

#[tauri::command]
#[specta::specta]
pub fn queue_cancel(app: AppHandle, state: State<'_, AppState>) {
    state.queue.cancel(&app);
}

#[tauri::command]
#[specta::specta]
pub fn queue_skip(app: AppHandle, state: State<'_, AppState>, id: String) {
    state.queue.skip(&app, &id);
}

#[tauri::command]
#[specta::specta]
pub fn queue_retry_failed(app: AppHandle, state: State<'_, AppState>) {
    state.queue.retry_failed(&app);
}

#[tauri::command]
#[specta::specta]
pub fn queue_remove(app: AppHandle, state: State<'_, AppState>, id: String) {
    state.queue.remove(&app, &id);
}

#[tauri::command]
#[specta::specta]
pub fn queue_clear_finished(app: AppHandle, state: State<'_, AppState>) {
    state.queue.clear_finished(&app);
}
