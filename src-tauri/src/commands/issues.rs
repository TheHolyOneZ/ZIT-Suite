use tauri::State;

use crate::error::AppResult;
use crate::github::issues::{self, Comment, Issue, IssuePatch, IssueSearch, NewIssue, SimpleUser};
use crate::github::labels::{self, Label, Milestone, MilestoneInput};
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn issues_search(
    state: State<'_, AppState>,
    query: String,
    sort: String,
    order: String,
    page: u32,
) -> AppResult<IssueSearch> {
    issues::search(&state.active_client()?, &query, &sort, &order, page).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_get(state: State<'_, AppState>, repo: String, number: u32) -> AppResult<Issue> {
    issues::get(&state.active_client()?, &repo, number).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_create(state: State<'_, AppState>, repo: String, input: NewIssue) -> AppResult<Issue> {
    issues::create(&state.active_client()?, &repo, &input).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_update(state: State<'_, AppState>, repo: String, number: u32, patch: IssuePatch) -> AppResult<Issue> {
    issues::update(&state.active_client()?, &repo, number, &patch).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_set_locked(state: State<'_, AppState>, repo: String, number: u32, locked: bool) -> AppResult<()> {
    issues::set_locked(&state.active_client()?, &repo, number, locked).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_comments(state: State<'_, AppState>, repo: String, number: u32) -> AppResult<Vec<Comment>> {
    issues::comments(&state.active_client()?, &repo, number).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_comment_create(state: State<'_, AppState>, repo: String, number: u32, body: String) -> AppResult<Comment> {
    issues::create_comment(&state.active_client()?, &repo, number, &body).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_comment_update(state: State<'_, AppState>, repo: String, id: u64, body: String) -> AppResult<Comment> {
    issues::update_comment(&state.active_client()?, &repo, id, &body).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_comment_delete(state: State<'_, AppState>, repo: String, id: u64) -> AppResult<()> {
    issues::delete_comment(&state.active_client()?, &repo, id).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_assignable(state: State<'_, AppState>, repo: String) -> AppResult<Vec<SimpleUser>> {
    issues::assignable(&state.active_client()?, &repo).await
}

#[tauri::command]
#[specta::specta]
pub async fn labels_list(state: State<'_, AppState>, repo: String) -> AppResult<Vec<Label>> {
    labels::list(&state.active_client()?, &repo).await
}

#[tauri::command]
#[specta::specta]
pub async fn labels_create(state: State<'_, AppState>, repo: String, label: Label) -> AppResult<()> {
    labels::create(&state.active_client()?, &repo, &label).await
}

#[tauri::command]
#[specta::specta]
pub async fn labels_update(state: State<'_, AppState>, repo: String, name: String, label: Label) -> AppResult<()> {
    labels::update(&state.active_client()?, &repo, &name, &label).await
}

#[tauri::command]
#[specta::specta]
pub async fn labels_delete(state: State<'_, AppState>, repo: String, name: String) -> AppResult<()> {
    labels::delete(&state.active_client()?, &repo, &name).await
}

#[tauri::command]
#[specta::specta]
pub async fn milestones_list(state: State<'_, AppState>, repo: String, filter: String) -> AppResult<Vec<Milestone>> {
    labels::milestones(&state.active_client()?, &repo, &filter).await
}

#[tauri::command]
#[specta::specta]
pub async fn milestones_create(state: State<'_, AppState>, repo: String, input: MilestoneInput) -> AppResult<()> {
    labels::create_milestone(&state.active_client()?, &repo, &input).await
}

#[tauri::command]
#[specta::specta]
pub async fn milestones_update(state: State<'_, AppState>, repo: String, number: u32, input: MilestoneInput) -> AppResult<()> {
    labels::update_milestone(&state.active_client()?, &repo, number, &input).await
}

#[tauri::command]
#[specta::specta]
pub async fn milestones_delete(state: State<'_, AppState>, repo: String, number: u32) -> AppResult<()> {
    labels::delete_milestone(&state.active_client()?, &repo, number).await
}

use crate::github::issue_extras::{self as ix, IssueExtras, Reaction, SubIssue, TimelineEvent};

#[tauri::command]
#[specta::specta]
pub async fn issues_timeline(state: State<'_, AppState>, repo: String, number: u32) -> AppResult<Vec<TimelineEvent>> {
    ix::timeline(&state.active_client()?, &repo, number).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_reactions(state: State<'_, AppState>, repo: String, target: String, fresh: bool) -> AppResult<Vec<Reaction>> {
    ix::reactions(&state.active_client()?, &repo, &target, fresh).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_react(state: State<'_, AppState>, repo: String, target: String, content: String) -> AppResult<()> {
    ix::react(&state.active_client()?, &repo, &target, &content).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_unreact(state: State<'_, AppState>, repo: String, target: String, id: u64) -> AppResult<()> {
    ix::unreact(&state.active_client()?, &repo, &target, id).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_extras(state: State<'_, AppState>, repo: String, number: u32) -> AppResult<IssueExtras> {
    ix::extras(&state.active_client()?, &repo, number).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_set_pinned(state: State<'_, AppState>, node_id: String, pinned: bool) -> AppResult<()> {
    ix::set_pinned(&state.active_client()?, &node_id, pinned).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_transfer(state: State<'_, AppState>, node_id: String, to_repo: String) -> AppResult<String> {
    ix::transfer(&state.active_client()?, &node_id, &to_repo).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_sub_issues(state: State<'_, AppState>, repo: String, number: u32) -> AppResult<Vec<SubIssue>> {
    ix::sub_issues(&state.active_client()?, &repo, number).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_add_sub_issue(state: State<'_, AppState>, repo: String, number: u32, child: u32) -> AppResult<()> {
    ix::add_sub_issue(&state.active_client()?, &repo, number, child).await
}

#[tauri::command]
#[specta::specta]
pub async fn issues_remove_sub_issue(state: State<'_, AppState>, repo: String, number: u32, sub_issue_id: u64) -> AppResult<()> {
    ix::remove_sub_issue(&state.active_client()?, &repo, number, sub_issue_id).await
}
