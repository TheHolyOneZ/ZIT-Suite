use tauri::State;

use crate::error::AppResult;
use crate::github::pulls::{self, CheckRun, Compare, MergeMethod, NewPull, NewReviewComment, Pull, PullCommit, PullFile, PullSearch, Review, ReviewComment};
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn pulls_search(state: State<'_, AppState>, query: String, after: Option<String>) -> AppResult<PullSearch> {
    pulls::search(&state.active_client()?, &query, after).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_get(state: State<'_, AppState>, repo: String, number: u32) -> AppResult<Pull> {
    pulls::get(&state.active_client()?, &repo, number).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_merge_settings(state: State<'_, AppState>, repo: String) -> AppResult<pulls::MergeSettings> {
    pulls::merge_settings(&state.active_client()?, &repo).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_files(state: State<'_, AppState>, repo: String, number: u32) -> AppResult<Vec<PullFile>> {
    pulls::files(&state.active_client()?, &repo, number).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_commits(state: State<'_, AppState>, repo: String, number: u32) -> AppResult<Vec<PullCommit>> {
    pulls::commits(&state.active_client()?, &repo, number).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_reviews(state: State<'_, AppState>, repo: String, number: u32) -> AppResult<Vec<Review>> {
    pulls::reviews(&state.active_client()?, &repo, number).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_submit_review(state: State<'_, AppState>, repo: String, number: u32, event: String, body: String, comments: Vec<pulls::DraftComment>) -> AppResult<()> {
    pulls::submit_review(&state.active_client()?, &repo, number, &event, &body, &comments).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_checks(state: State<'_, AppState>, repo: String, sha: String) -> AppResult<Vec<CheckRun>> {
    pulls::checks(&state.active_client()?, &repo, &sha).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_update(
    state: State<'_, AppState>,
    repo: String,
    number: u32,
    title: Option<String>,
    body: Option<String>,
    base: Option<String>,
) -> AppResult<Pull> {
    pulls::update(&state.active_client()?, &repo, number, title, body, base).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_set_draft(state: State<'_, AppState>, node_id: String, draft: bool) -> AppResult<()> {
    pulls::set_draft(&state.active_client()?, &node_id, draft).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_request_reviewers(state: State<'_, AppState>, repo: String, number: u32, reviewers: Vec<String>, remove: bool) -> AppResult<()> {
    pulls::request_reviewers(&state.active_client()?, &repo, number, &reviewers, remove).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_branches(state: State<'_, AppState>, repo: String) -> AppResult<Vec<String>> {
    pulls::branches(&state.active_client()?, &repo).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_compare(state: State<'_, AppState>, repo: String, base: String, head: String) -> AppResult<Compare> {
    pulls::compare(&state.active_client()?, &repo, &base, &head).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_create(state: State<'_, AppState>, repo: String, input: NewPull) -> AppResult<Pull> {
    pulls::create(&state.active_client()?, &repo, &input).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_set_auto_merge(state: State<'_, AppState>, node_id: String, method: Option<MergeMethod>) -> AppResult<()> {
    pulls::set_auto_merge(&state.active_client()?, &node_id, method).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_review_comments(state: State<'_, AppState>, repo: String, number: u32) -> AppResult<Vec<ReviewComment>> {
    pulls::review_comments(&state.active_client()?, &repo, number).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_review_comment_create(state: State<'_, AppState>, repo: String, number: u32, input: NewReviewComment) -> AppResult<ReviewComment> {
    pulls::create_review_comment(&state.active_client()?, &repo, number, &input).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_review_comment_reply(state: State<'_, AppState>, repo: String, number: u32, comment_id: u64, body: String) -> AppResult<ReviewComment> {
    pulls::reply_review_comment(&state.active_client()?, &repo, number, comment_id, &body).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_review_comment_update(state: State<'_, AppState>, repo: String, comment_id: u64, body: String) -> AppResult<ReviewComment> {
    pulls::update_review_comment(&state.active_client()?, &repo, comment_id, &body).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_review_comment_delete(state: State<'_, AppState>, repo: String, comment_id: u64) -> AppResult<()> {
    pulls::delete_review_comment(&state.active_client()?, &repo, comment_id).await
}
