use reqwest::Method;
use serde::{Deserialize, Serialize};
use specta::Type;

use super::GitHubClient;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct User {
    pub login: String,
    pub id: u64,
    pub name: Option<String>,
    pub avatar_url: String,
    pub html_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Org {
    pub login: String,
    pub id: u64,
    pub avatar_url: String,
    pub description: Option<String>,
}


pub async fn current_user(c: &GitHubClient) -> AppResult<(User, Option<Vec<String>>)> {
    let res = c.execute(c.request(Method::GET, "/user")).await?;
    let scopes = res
        .headers()
        .get("x-oauth-scopes")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect());
    Ok((res.json().await?, scopes))
}

pub async fn orgs(c: &GitHubClient) -> AppResult<Vec<Org>> {
    c.paginate("/user/orgs?per_page=100").await
}
