use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::AppResult;

const KEYRING_SERVICE: &str = "zit-suite";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    Pat,
    Device,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Account {

    pub id: String,
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
    pub html_url: String,

    pub scopes: Option<Vec<String>>,
    pub method: AuthMethod,
    pub added_at: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct AccountsFile {
    accounts: Vec<Account>,
    active: Option<String>,
}

pub struct AccountStore {
    path: PathBuf,
    data: AccountsFile,
}

impl AccountStore {
    pub fn load(dir: &std::path::Path) -> Self {
        let path = dir.join("accounts.json");
        let data = fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        Self { path, data }
    }

    fn save(&self) -> AppResult<()> {
        crate::platform::write_atomic(&self.path, &serde_json::to_vec_pretty(&self.data)?)?;
        Ok(())
    }

    pub fn accounts(&self) -> &[Account] {
        &self.data.accounts
    }

    pub fn active(&self) -> Option<&str> {
        self.data.active.as_deref()
    }

    pub fn get(&self, id: &str) -> Option<&Account> {
        self.data.accounts.iter().find(|a| a.id == id)
    }

    pub fn upsert_and_activate(&mut self, account: Account) -> AppResult<()> {
        let id = account.id.clone();
        match self.data.accounts.iter_mut().find(|a| a.id == id) {
            Some(existing) => *existing = account,
            None => self.data.accounts.push(account),
        }
        self.data.active = Some(id);
        self.save()
    }

    pub fn set_active(&mut self, id: &str) -> AppResult<()> {
        self.data.active = Some(id.to_string());
        self.save()
    }

    pub fn remove(&mut self, id: &str) -> AppResult<()> {
        self.data.accounts.retain(|a| a.id != id);
        if self.data.active.as_deref() == Some(id) {
            self.data.active = self.data.accounts.first().map(|a| a.id.clone());
        }
        self.save()
    }
}

fn entry(account_id: &str) -> AppResult<keyring::Entry> {
    Ok(keyring::Entry::new(KEYRING_SERVICE, account_id)?)
}

pub fn save_token(account_id: &str, token: &str) -> AppResult<()> {
    Ok(entry(account_id)?.set_password(token)?)
}

pub fn load_token(account_id: &str) -> AppResult<String> {
    Ok(entry(account_id)?.get_password()?)
}

pub fn delete_token(account_id: &str) -> AppResult<()> {
    match entry(account_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}
