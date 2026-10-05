use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_specta::Event;

use super::{ItemStatus, NewQueueItem, QueueFinished, QueueItem, QueuePhase, QueueSnapshot};
use crate::error::AppResult;
use crate::state::AppState;

const ITEM_DELAY: Duration = Duration::from_millis(400);

#[derive(Default)]
struct Inner {
    items: Vec<QueueItem>,
    phase: QueuePhase,
    grace_remaining: Option<u32>,

    run_token: u64,
}

#[derive(Clone)]
pub struct Queue {
    inner: Arc<Mutex<Inner>>,
    path: PathBuf,
}


fn redact(items: &[QueueItem]) -> Vec<QueueItem> {
    items.iter().map(|i| QueueItem { action: i.action.redacted(), ..i.clone() }).collect()
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn new_id() -> String {
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let nanos = chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default();
    format!("{nanos:x}-{:x}", SEQ.fetch_add(1, Ordering::Relaxed))
}

impl Queue {


    pub fn load(dir: &Path) -> Self {
        let path = dir.join("queue.json");
        let mut items: Vec<QueueItem> = fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        for it in &mut items {
            if it.status == ItemStatus::Running {
                it.status = ItemStatus::Pending;
            }
        }
        Self { inner: Arc::new(Mutex::new(Inner { items, ..Default::default() })), path }
    }

    pub fn snapshot(&self) -> QueueSnapshot {
        let g = self.inner.lock().unwrap();
        QueueSnapshot { items: redact(&g.items), phase: g.phase, grace_remaining: g.grace_remaining }
    }

    fn mutate<R>(&self, app: &AppHandle, f: impl FnOnce(&mut Inner) -> R) -> R {
        let (r, items) = {
            let mut g = self.inner.lock().unwrap();
            let r = f(&mut g);
            (r, redact(&g.items))
        };
        if let Err(e) = serde_json::to_vec(&items).map_err(std::io::Error::other).and_then(|b| crate::platform::write_atomic(&self.path, &b)) {
            log::warn!("failed to persist queue: {e}");
        }
        let _ = self.snapshot().emit(app);
        r
    }

    pub fn enqueue(&self, app: &AppHandle, account_id: &str, items: Vec<NewQueueItem>) {
        self.mutate(app, |g| {
            for n in items {
                let dup = g.items.iter().any(|i| {
                    i.repo == n.repo && i.action == n.action && i.account_id == account_id && !i.status.is_finished()
                });
                if !dup {
                    g.items.push(QueueItem {
                        id: new_id(),
                        account_id: account_id.to_string(),
                        repo: n.repo,
                        action: n.action,
                        status: ItemStatus::Pending,
                        error: None,
                        created_at: now(),
                        finished_at: None,
                    });
                }
            }
        });
    }

    pub fn start(&self, app: &AppHandle, grace_secs: u32) {
        let token = self.mutate(app, |g| {
            if matches!(g.phase, QueuePhase::Running | QueuePhase::Grace) {
                return None;
            }
            g.run_token += 1;
            if grace_secs > 0 && g.phase == QueuePhase::Idle {
                g.phase = QueuePhase::Grace;
                g.grace_remaining = Some(grace_secs);
            } else {
                g.phase = QueuePhase::Running;
                g.grace_remaining = None;
            }
            Some(g.run_token)
        });
        if let Some(token) = token {
            let q = self.clone();
            let app = app.clone();
            tauri::async_runtime::spawn(async move { q.worker(app, token).await });
        }
    }

    pub fn pause(&self, app: &AppHandle) {
        self.mutate(app, |g| {
            if g.phase == QueuePhase::Running {
                g.phase = QueuePhase::Paused;
            }
        });
    }

    pub fn cancel(&self, app: &AppHandle) {
        self.mutate(app, |g| {
            g.run_token += 1;
            g.phase = QueuePhase::Idle;
            g.grace_remaining = None;
            for it in g.items.iter_mut().filter(|i| i.status == ItemStatus::Pending) {
                it.status = ItemStatus::Cancelled;
                it.finished_at = Some(now());
            }
        });
    }

    pub fn skip(&self, app: &AppHandle, id: &str) {
        self.mutate(app, |g| {
            if let Some(it) = g.items.iter_mut().find(|i| i.id == id && i.status == ItemStatus::Pending) {
                it.status = ItemStatus::Skipped;
                it.finished_at = Some(now());
            }
        });
    }

    pub fn retry_failed(&self, app: &AppHandle) {
        self.mutate(app, |g| {
            for it in g.items.iter_mut().filter(|i| matches!(i.status, ItemStatus::Failed | ItemStatus::Cancelled)) {
                it.status = ItemStatus::Pending;
                it.error = None;
                it.finished_at = None;
            }
        });
    }

    pub fn remove(&self, app: &AppHandle, id: &str) {
        self.mutate(app, |g| g.items.retain(|i| i.id != id || i.status == ItemStatus::Running));
    }

    pub fn clear_finished(&self, app: &AppHandle) {
        self.mutate(app, |g| g.items.retain(|i| !i.status.is_finished()));
    }

    fn is_current(&self, token: u64, phase: QueuePhase) -> bool {
        let g = self.inner.lock().unwrap();
        g.run_token == token && g.phase == phase
    }

    async fn worker(self, app: AppHandle, token: u64) {

        loop {
            if !self.is_current(token, QueuePhase::Grace) {
                break;
            }
            let remaining = self.mutate(&app, |g| {
                let r = g.grace_remaining.unwrap_or(0);
                if r == 0 {
                    g.phase = QueuePhase::Running;
                    g.grace_remaining = None;
                } else {
                    g.grace_remaining = Some(r - 1);
                }
                r
            });
            if remaining == 0 {
                break;
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }

        let (mut done, mut failed) = (0u32, 0u32);
        loop {
            if !self.is_current(token, QueuePhase::Running) {
                return;
            }
            let next = self.mutate(&app, |g| {
                let it = g.items.iter_mut().find(|i| i.status == ItemStatus::Pending)?;
                it.status = ItemStatus::Running;
                Some(it.clone())
            });
            let Some(item) = next else { break };

            let result = run_item(&app, &item).await;
            self.mutate(&app, |g| {
                if let Some(it) = g.items.iter_mut().find(|i| i.id == item.id) {
                    it.finished_at = Some(now());
                    match result {
                        Ok(()) => {
                            it.status = ItemStatus::Done;
                            done += 1;
                        }
                        Err(e) => {
                            it.status = ItemStatus::Failed;
                            it.error = Some(e);
                            failed += 1;
                        }
                    }
                }
            });
            tokio::time::sleep(ITEM_DELAY).await;
        }

        let finished = self.mutate(&app, |g| {
            if g.run_token == token && g.phase == QueuePhase::Running {
                g.phase = QueuePhase::Idle;
                true
            } else {
                false
            }
        });
        if finished {
            let _ = QueueFinished { done, failed }.emit(&app);
        }
    }
}

async fn run_item(app: &AppHandle, item: &QueueItem) -> AppResult<()> {
    let client = app.state::<AppState>().client_for(&item.account_id)?;
    item.action.execute(&client, &item.repo).await
}
