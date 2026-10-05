use tauri::State;

use crate::error::AppResult;
use crate::github::branches::{self, BranchList, Protection, Ruleset};
use crate::github::rulesets::{self, RulesetDraft};
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn branches_list(state: State<'_, AppState>, repo: String, default_branch: Option<String>) -> AppResult<BranchList> {
    branches::list(&state.active_client()?, &repo, default_branch.as_deref()).await
}

#[tauri::command]
#[specta::specta]
pub async fn branches_create(state: State<'_, AppState>, repo: String, name: String, from: Option<String>) -> AppResult<()> {
    branches::create(&state.active_client()?, &repo, &name, from.as_deref()).await
}

#[tauri::command]
#[specta::specta]
pub async fn branches_rename(state: State<'_, AppState>, repo: String, from: String, to: String) -> AppResult<()> {
    branches::rename(&state.active_client()?, &repo, &from, &to).await
}

#[tauri::command]
#[specta::specta]
pub async fn branches_set_default(state: State<'_, AppState>, repo: String, name: String) -> AppResult<()> {
    branches::set_default(&state.active_client()?, &repo, &name).await
}

#[tauri::command]
#[specta::specta]
pub async fn branches_protection(state: State<'_, AppState>, repo: String, branch: String) -> AppResult<Option<Protection>> {
    branches::protection(&state.active_client()?, &repo, &branch).await
}

#[tauri::command]
#[specta::specta]
pub async fn branches_protect(state: State<'_, AppState>, repo: String, branch: String, rules: Protection) -> AppResult<()> {
    branches::protect(&state.active_client()?, &repo, &branch, &rules).await
}

#[tauri::command]
#[specta::specta]
pub async fn branches_unprotect(state: State<'_, AppState>, repo: String, branch: String) -> AppResult<()> {
    branches::unprotect(&state.active_client()?, &repo, &branch).await
}

#[tauri::command]
#[specta::specta]
pub async fn branches_check_names(state: State<'_, AppState>, repo: String, sha: String) -> AppResult<Vec<String>> {
    branches::check_names(&state.active_client()?, &repo, &sha).await
}

#[tauri::command]
#[specta::specta]
pub async fn branches_rulesets(state: State<'_, AppState>, repo: String) -> AppResult<Vec<Ruleset>> {
    branches::rulesets(&state.active_client()?, &repo).await
}

#[tauri::command]
#[specta::specta]
pub async fn rulesets_get(state: State<'_, AppState>, repo: String, id: u64) -> AppResult<RulesetDraft> {
    rulesets::get(&state.active_client()?, &repo, id).await
}

#[tauri::command]
#[specta::specta]
pub async fn rulesets_create(state: State<'_, AppState>, repo: String, draft: RulesetDraft) -> AppResult<Ruleset> {
    rulesets::create(&state.active_client()?, &repo, &draft).await
}

#[tauri::command]
#[specta::specta]
pub async fn rulesets_update(state: State<'_, AppState>, repo: String, id: u64, draft: RulesetDraft) -> AppResult<Ruleset> {
    rulesets::update(&state.active_client()?, &repo, id, &draft).await
}

#[tauri::command]
#[specta::specta]
pub async fn rulesets_delete(state: State<'_, AppState>, repo: String, id: u64) -> AppResult<()> {
    rulesets::delete(&state.active_client()?, &repo, id).await
}
