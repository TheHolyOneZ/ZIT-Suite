use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

use crate::auth::{device, store, Account, AuthMethod};
use crate::error::{AppError, AppResult};
use crate::github::client::RateLimit;
use crate::github::{users, GitHubClient};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Session {
    pub accounts: Vec<Account>,
    pub active: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum DevicePoll {
    Pending,
    SlowDown { interval: u32 },
    Complete { account: Account },
}

fn session(state: &AppState) -> Session {
    let store = state.accounts.lock().unwrap();
    Session { accounts: store.accounts().to_vec(), active: store.active().map(str::to_string) }
}


async fn register(state: &AppState, token: String, method: AuthMethod) -> AppResult<Account> {
    let client = GitHubClient::new(token.clone())?;
    let (user, scopes) = users::current_user(&client).await.map_err(|e| {
        if e.code == "github.unauthorized" { AppError::new("auth.invalid_token") } else { e }
    })?;
    let account = Account {
        id: format!("github:{}", user.id),
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
        scopes,
        method,
        added_at: chrono::Utc::now().to_rfc3339(),
    };
    store::save_token(&account.id, &token)?;
    state.register_client(&account.id, client);
    state.accounts.lock().unwrap().upsert_and_activate(account.clone())?;
    Ok(account)
}

#[tauri::command]
#[specta::specta]
pub fn auth_session(state: State<'_, AppState>) -> Session {
    session(&state)
}

#[tauri::command]
#[specta::specta]
pub async fn auth_sign_in_pat(state: State<'_, AppState>, token: String) -> AppResult<Account> {
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err(AppError::new("auth.invalid_token"));
    }
    register(&state, token, AuthMethod::Pat).await
}

#[tauri::command]
#[specta::specta]
pub fn auth_default_client_id() -> Option<String> {
    device::default_client_id()
}

#[tauri::command]
#[specta::specta]
pub async fn auth_device_start(client_id: String) -> AppResult<device::DeviceCode> {
    device::start(client_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn auth_device_poll(
    state: State<'_, AppState>,
    client_id: String,
    device_code: String,
) -> AppResult<DevicePoll> {
    Ok(match device::poll(&client_id, &device_code).await? {
        device::PollResult::Pending => DevicePoll::Pending,
        device::PollResult::SlowDown(interval) => DevicePoll::SlowDown { interval },
        device::PollResult::Token(token) => DevicePoll::Complete {
            account: register(&state, token, AuthMethod::Device).await?,
        },
    })
}

#[tauri::command]
#[specta::specta]
pub fn auth_switch(state: State<'_, AppState>, account_id: String) -> AppResult<Session> {
    {
        let mut store = state.accounts.lock().unwrap();
        if store.get(&account_id).is_none() {
            return Err(AppError::new("auth.unknown_account"));
        }
        store.set_active(&account_id)?;
    }
    Ok(session(&state))
}

#[tauri::command]
#[specta::specta]
pub fn auth_sign_out(state: State<'_, AppState>, account_id: String) -> AppResult<Session> {
    store::delete_token(&account_id)?;
    state.drop_client(&account_id);
    state.accounts.lock().unwrap().remove(&account_id)?;
    Ok(session(&state))
}

#[tauri::command]
#[specta::specta]
pub fn github_rate_limit(state: State<'_, AppState>) -> Vec<RateLimit> {
    state.active_client().map(|c| c.rate_limits()).unwrap_or_default()
}
