use chrono::Local;
use tauri::{AppHandle, State};

use crate::error::AppResult;
use crate::scheduler::{DueRun, RunRecord, Schedule};
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub fn schedules_list(state: State<'_, AppState>) -> Vec<Schedule> {
    state.scheduler.all()
}


#[tauri::command]
#[specta::specta]
pub fn schedule_save(app: AppHandle, state: State<'_, AppState>, mut schedule: Schedule) -> AppResult<Schedule> {
    if schedule.account_id.is_empty() {
        schedule.account_id = state.active_account_id()?;
    }
    state.scheduler.upsert(&app, schedule)
}

#[tauri::command]
#[specta::specta]
pub fn schedule_delete(app: AppHandle, state: State<'_, AppState>, id: String) {
    state.scheduler.delete(&app, &id);
}

#[tauri::command]
#[specta::specta]
pub fn schedule_set_enabled(app: AppHandle, state: State<'_, AppState>, id: String, enabled: bool) -> AppResult<Schedule> {
    state.scheduler.set_enabled(&app, &id, enabled)
}


#[tauri::command]
#[specta::specta]
pub fn schedules_claim_due(state: State<'_, AppState>) -> Vec<DueRun> {
    state.scheduler.claim_due(Local::now())
}

#[tauri::command]
#[specta::specta]
pub fn schedule_run_now(state: State<'_, AppState>, id: String) -> AppResult<DueRun> {
    state.scheduler.claim_now(&id)
}

#[tauri::command]
#[specta::specta]
pub fn schedule_record(app: AppHandle, state: State<'_, AppState>, id: String, record: RunRecord) -> AppResult<Schedule> {
    state.scheduler.record(&app, &id, record)
}
