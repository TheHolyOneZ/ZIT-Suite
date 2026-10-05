use serde::{Deserialize, Serialize};
use specta::Type;

use super::REQUESTED_SCOPES;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DeviceCode {
    pub client_id: String,
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u32,
    pub interval: u32,
}

#[derive(Deserialize)]
struct DeviceCodeRes {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u32,
    interval: u32,
}

#[derive(Deserialize)]
struct TokenRes {
    access_token: Option<String>,
    error: Option<String>,
    interval: Option<u32>,
}

pub enum PollResult {
    Pending,
    SlowDown(u32),
    Token(String),
}


pub fn default_client_id() -> Option<String> {
    option_env!("ZIT_GITHUB_CLIENT_ID").map(str::to_string).filter(|s| !s.is_empty())
}

fn http() -> AppResult<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .user_agent(concat!("ZIT-Suite/", env!("CARGO_PKG_VERSION")))
        .build()?)
}

pub async fn start(client_id: String) -> AppResult<DeviceCode> {
    if client_id.trim().is_empty() {
        return Err(AppError::new("auth.client_id_missing"));
    }
    let scope = REQUESTED_SCOPES.join(" ");
    let res = http()?
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", client_id.as_str()), ("scope", scope.as_str())])
        .send()
        .await?;
    if !res.status().is_success() {
        return Err(AppError::new("auth.device_start_failed").status(res.status().as_u16()));
    }
    let r: DeviceCodeRes = res
        .json()
        .await
        .map_err(|_| AppError::new("auth.device_start_failed"))?;
    Ok(DeviceCode {
        client_id,
        device_code: r.device_code,
        user_code: r.user_code,
        verification_uri: r.verification_uri,
        expires_in: r.expires_in,
        interval: r.interval,
    })
}

pub async fn poll(client_id: &str, device_code: &str) -> AppResult<PollResult> {
    let r: TokenRes = http()?
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await?
        .json()
        .await?;
    if let Some(token) = r.access_token {
        return Ok(PollResult::Token(token));
    }
    match r.error.as_deref() {
        Some("authorization_pending") => Ok(PollResult::Pending),
        Some("slow_down") => Ok(PollResult::SlowDown(r.interval.unwrap_or(10))),
        Some("expired_token") => Err(AppError::new("auth.device_expired")),
        Some("access_denied") => Err(AppError::new("auth.device_denied")),
        Some(other) => Err(AppError::new("auth.device_failed").detail(other)),
        None => Err(AppError::new("auth.device_failed")),
    }
}
