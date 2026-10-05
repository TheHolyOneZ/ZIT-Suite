use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type, thiserror::Error)]
#[error("{code}")]
pub struct AppError {

    pub code: String,

    pub detail: Option<String>,

    pub status: Option<u16>,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn new(code: impl Into<String>) -> Self {
        Self { code: code.into(), detail: None, status: None }
    }

    pub fn detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub fn status(mut self, status: u16) -> Self {
        self.status = Some(status);
        self
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {

        let e = e.without_url();
        let code = if e.is_timeout() {
            "network.timeout"
        } else if e.is_decode() {
            "network.decode"
        } else {
            "network.failed"
        };
        AppError::new(code).detail(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::new("io.failed").detail(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::new("internal.parse").detail(e.to_string())
    }
}

impl From<keyring::Error> for AppError {
    fn from(e: keyring::Error) -> Self {
        match e {
            keyring::Error::NoEntry => AppError::new("auth.token_missing"),
            other => AppError::new("auth.keyring").detail(format!("{other} — {}", crate::platform::keyring_hint())),
        }
    }
}
