use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::auth::{store, AccountStore};
use crate::error::{AppError, AppResult};
use crate::github::GitHubClient;
use crate::queue::Queue;
use crate::workspace::store::WorkspaceStore;
use crate::workspace::watcher::Watchers;

pub struct AppState {
    pub accounts: Mutex<AccountStore>,

    clients: Mutex<HashMap<String, GitHubClient>>,
    pub queue: Queue,
    pub workspaces: Mutex<WorkspaceStore>,
    pub watchers: Watchers,
    pub scheduler: crate::scheduler::Scheduler,
    pub tray: crate::tray::Tray,

    cache_dir: PathBuf,
}


const CACHE_MAX_AGE: i64 = 7 * 24 * 3600;

impl AppState {
    pub fn load(data_dir: PathBuf, cache_dir: PathBuf) -> AppResult<Self> {
        std::fs::create_dir_all(&data_dir)?;
        let _ = std::fs::create_dir_all(&cache_dir);
        Ok(Self {
            cache_dir,
            accounts: Mutex::new(AccountStore::load(&data_dir)),
            clients: Mutex::default(),
            queue: Queue::load(&data_dir),
            workspaces: Mutex::new(WorkspaceStore::load(&data_dir)),
            watchers: Watchers::default(),
            scheduler: crate::scheduler::Scheduler::load(&data_dir),
            tray: crate::tray::Tray::load(&data_dir),
        })
    }

    pub fn client_for(&self, account_id: &str) -> AppResult<GitHubClient> {
        if let Some(c) = self.clients.lock().unwrap().get(account_id) {
            return Ok(c.clone());
        }
        let client = GitHubClient::new(store::load_token(account_id)?)?;
        self.restore_cache(account_id, &client);
        self.clients.lock().unwrap().insert(account_id.to_string(), client.clone());
        Ok(client)
    }

    fn cache_file(&self, account_id: &str) -> PathBuf {
        let safe: String = account_id.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect();
        self.cache_dir.join(format!("etags-{safe}.json"))
    }

    fn restore_cache(&self, account_id: &str, client: &GitHubClient) {
        let Ok(bytes) = std::fs::read(self.cache_file(account_id)) else { return };
        match serde_json::from_slice(&bytes) {
            Ok(entries) => client.load_cache(entries, CACHE_MAX_AGE),
            Err(e) => log::warn!("ignoring unreadable ETag cache: {e}"),
        }
    }


    pub fn save_caches(&self) {
        let clients: Vec<(String, GitHubClient)> = self.clients.lock().unwrap().iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        for (id, c) in clients {
            let Some(entries) = c.take_dirty_cache() else { continue };
            let path = self.cache_file(&id);
            let tmp = path.with_extension("tmp");
            let ok = serde_json::to_vec(&entries).map_err(|e| e.to_string()).and_then(|b| std::fs::write(&tmp, b).map_err(|e| e.to_string())).and_then(|_| std::fs::rename(&tmp, &path).map_err(|e| e.to_string()));
            if let Err(e) = ok {
                log::warn!("couldn't save ETag cache: {e}");
            }
        }
    }


    pub fn forget_cache(&self, account_id: &str) {
        let _ = std::fs::remove_file(self.cache_file(account_id));
    }

    pub fn register_client(&self, account_id: &str, client: GitHubClient) {
        self.restore_cache(account_id, &client);
        self.clients.lock().unwrap().insert(account_id.to_string(), client);
    }

    pub fn drop_client(&self, account_id: &str) {
        self.clients.lock().unwrap().remove(account_id);
        self.forget_cache(account_id);
    }

    pub fn active_account_id(&self) -> AppResult<String> {
        self.accounts
            .lock()
            .unwrap()
            .active()
            .map(str::to_string)
            .ok_or_else(|| AppError::new("auth.not_signed_in"))
    }

    pub fn active_client(&self) -> AppResult<GitHubClient> {
        self.client_for(&self.active_account_id()?)
    }


    pub fn git_identity(&self) -> (String, String) {
        let accounts = self.accounts.lock().unwrap();
        let acc = accounts.active().and_then(|id| accounts.get(id));
        match acc {
            Some(a) => {
                let num = a.id.strip_prefix("github:").unwrap_or(&a.id);
                (a.name.clone().unwrap_or_else(|| a.login.clone()), format!("{num}+{}@users.noreply.github.com", a.login))
            }
            None => ("ZIT-Suite".into(), "zit-suite@users.noreply.github.com".into()),
        }
    }
}
