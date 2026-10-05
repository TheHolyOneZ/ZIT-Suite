use tauri::State;

use crate::error::AppResult;
use crate::github::notifications::{self, Thread, WatchMode, Watched};
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn inbox_list(state: State<'_, AppState>, all: bool, participating: bool, fresh: bool) -> AppResult<Vec<Thread>> {
    notifications::list(&state.active_client()?, all, participating, fresh).await
}


#[tauri::command]
#[specta::specta]
pub async fn inbox_act(state: State<'_, AppState>, ids: Vec<String>, action: InboxAction) -> AppResult<Vec<String>> {
    let c = state.active_client()?;
    let mut failed = Vec::new();
    for id in ids {
        let r = match action {
            InboxAction::Read => notifications::mark_read(&c, &id).await,
            InboxAction::Done => notifications::mark_done(&c, &id).await,
            InboxAction::Mute => match notifications::mute(&c, &id).await {
                Ok(()) => notifications::mark_done(&c, &id).await,
                Err(e) => Err(e),
            },
        };
        if r.is_err() {
            failed.push(id);
        }
    }
    Ok(failed)
}

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum InboxAction {
    Read,
    Done,

    Mute,
}

#[tauri::command]
#[specta::specta]
pub async fn inbox_read_all(state: State<'_, AppState>, repo: Option<String>, before: String) -> AppResult<()> {
    notifications::mark_all_read(&state.active_client()?, repo.as_deref(), &before).await
}

#[tauri::command]
#[specta::specta]
pub async fn watched_list(state: State<'_, AppState>, fresh: bool) -> AppResult<Vec<Watched>> {
    notifications::watched(&state.active_client()?, fresh).await
}

#[tauri::command]
#[specta::specta]
pub async fn watch_set(state: State<'_, AppState>, repos: Vec<String>, mode: WatchMode) -> AppResult<Vec<String>> {
    let c = state.active_client()?;
    let mut failed = Vec::new();
    for r in repos {
        if notifications::set_watch(&c, &r, mode).await.is_err() {
            failed.push(r);
        }
    }
    Ok(failed)
}

#[tauri::command]
#[specta::specta]
pub async fn inbox_states(state: State<'_, AppState>, refs: Vec<crate::github::notifications::SubjectRef>) -> AppResult<Vec<crate::github::notifications::SubjectState>> {
    crate::github::notifications::subject_states(&state.active_client()?, &refs).await
}
