use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_specta::Event;

use super::git::{self, CommitInfo};
use super::store::{render_template, AutoMode, Workspace};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct WorkspaceChanged {
    pub id: String,
    pub changes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct WorkspaceAutoCommit {
    pub id: String,
    pub commit: Option<CommitInfo>,
    pub pushed: bool,
    pub error: Option<AppError>,
}

#[derive(Default)]
pub struct Watchers {
    tasks: Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>,
}

impl Watchers {

    pub fn restart(&self, app: &AppHandle, ws: &Workspace) {
        self.stop(&ws.id);
        if !ws.watch {
            return;
        }
        let task = tauri::async_runtime::spawn(run(app.clone(), ws.clone()));
        self.tasks.lock().unwrap().insert(ws.id.clone(), task);
    }

    pub fn stop(&self, id: &str) {
        if let Some(t) = self.tasks.lock().unwrap().remove(id) {
            t.abort();
        }
    }

    pub fn is_running(&self, id: &str) -> bool {
        self.tasks.lock().unwrap().contains_key(id)
    }
}


pub fn due(mode: AutoMode, minutes: u32, changes: usize, since_commit: Duration, since_change: Duration) -> bool {
    let wait = Duration::from_secs(u64::from(minutes) * 60);
    changes > 0
        && match mode {
            AutoMode::Manual => false,
            AutoMode::Interval => since_commit >= wait,
            AutoMode::Idle => since_change >= wait,
        }
}

async fn run(app: AppHandle, ws: Workspace) {
    let mut last_fp: Option<u64> = None;
    let mut last_change = Instant::now();
    let mut last_commit = Instant::now();
    let tick = Duration::from_secs(u64::from(ws.interval_secs.clamp(1, 300)));
    loop {
        tokio::time::sleep(tick).await;
        let path = ws.path.clone();
        let fp = tauri::async_runtime::spawn_blocking(move || git::open(&path).and_then(|r| git::fingerprint(&r))).await;
        let Ok(Ok((hash, count, _))) = fp else { continue };
        if last_fp != Some(hash) {
            if last_fp.is_some() {
                last_change = Instant::now();
            }
            last_fp = Some(hash);
            let _ = WorkspaceChanged { id: ws.id.clone(), changes: count as u32 }.emit(&app);
        }
        if due(ws.auto, ws.auto_minutes, count, last_commit.elapsed(), last_change.elapsed()) {
            last_commit = Instant::now();
            let event = auto_commit(&app, &ws).await;
            let _ = event.emit(&app);
        }
    }
}

async fn auto_commit(app: &AppHandle, ws: &Workspace) -> WorkspaceAutoCommit {
    let state = app.state::<AppState>();
    let (name, email) = state.git_identity();
    let token = state.active_client().ok().map(|c| c.token().to_string());
    let ws2 = ws.clone();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<(CommitInfo, bool, Option<AppError>), AppError> {
        let repo = git::open(&ws2.path)?;
        let changes = git::changes(&repo)?;
        let message = render_template(&ws2.message_template, &git::suggest_message(&changes), changes.len());
        let sig = git::signature(&repo, &name, &email)?;
        let commit = git::commit(&repo, None, &message, &sig)?;
        if ws2.auto_push && ws2.push_repo.is_some() {
            return Ok(match git::push(&repo, "origin", token.as_deref()) {
                Ok(()) => (commit, true, None),
                Err(e) => (commit, false, Some(e)),
            });
        }
        Ok((commit, false, None))
    })
    .await;
    match result {
        Ok(Ok((commit, pushed, error))) => WorkspaceAutoCommit { id: ws.id.clone(), commit: Some(commit), pushed, error },
        Ok(Err(e)) => WorkspaceAutoCommit { id: ws.id.clone(), commit: None, pushed: false, error: Some(e) },
        Err(e) => WorkspaceAutoCommit { id: ws.id.clone(), commit: None, pushed: false, error: Some(AppError::new("internal.unknown").detail(e.to_string())) },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_commit_timing() {
        let m = |s: u64| Duration::from_secs(s * 60);
        assert!(!due(AutoMode::Manual, 1, 5, m(99), m(99)));
        assert!(!due(AutoMode::Interval, 10, 0, m(99), m(99)), "nothing to commit");
        assert!(due(AutoMode::Interval, 10, 3, m(10), m(0)));
        assert!(!due(AutoMode::Interval, 10, 3, m(9), m(99)));
        assert!(due(AutoMode::Idle, 5, 1, m(0), m(5)), "quiet for 5 min");
        assert!(!due(AutoMode::Idle, 5, 1, m(99), m(4)), "still editing");
    }
}
