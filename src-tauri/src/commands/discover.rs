use tauri::State;

use crate::error::AppResult;
use crate::github::issues::Comment;
use crate::github::gists::{self, FileEdit, Gist, NewFile, Revision};
use crate::github::search::{self, SearchKind, SearchPage};
use crate::github::stars::{self, StarList, Starred};
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn gists_list(state: State<'_, AppState>, starred: bool, fresh: bool) -> AppResult<Vec<Gist>> {
    gists::list(&state.active_client()?, starred, fresh).await
}

#[tauri::command]
#[specta::specta]
pub async fn gist_get(state: State<'_, AppState>, id: String, revision: Option<String>) -> AppResult<Gist> {
    gists::get(&state.active_client()?, &id, revision.as_deref()).await
}

#[tauri::command]
#[specta::specta]
pub async fn gist_create(state: State<'_, AppState>, description: String, is_public: bool, files: Vec<NewFile>) -> AppResult<Gist> {
    gists::create(&state.active_client()?, &description, is_public, &files).await
}

#[tauri::command]
#[specta::specta]
pub async fn gist_update(state: State<'_, AppState>, id: String, description: Option<String>, edits: Vec<FileEdit>) -> AppResult<Gist> {
    gists::update(&state.active_client()?, &id, description.as_deref(), &edits).await
}

#[tauri::command]
#[specta::specta]
pub async fn gist_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    gists::delete(&state.active_client()?, &id).await
}

#[tauri::command]
#[specta::specta]
pub async fn gist_star(state: State<'_, AppState>, id: String, on: bool) -> AppResult<()> {
    gists::set_starred(&state.active_client()?, &id, on).await
}

#[tauri::command]
#[specta::specta]
pub async fn gist_revisions(state: State<'_, AppState>, id: String) -> AppResult<Vec<Revision>> {
    gists::revisions(&state.active_client()?, &id).await
}

#[tauri::command]
#[specta::specta]
pub async fn gist_comments(state: State<'_, AppState>, id: String) -> AppResult<Vec<Comment>> {
    gists::comments(&state.active_client()?, &id).await
}

#[tauri::command]
#[specta::specta]
pub async fn gist_comment_add(state: State<'_, AppState>, id: String, body: String) -> AppResult<Comment> {
    gists::add_comment(&state.active_client()?, &id, &body).await
}

#[tauri::command]
#[specta::specta]
pub async fn gist_comment_delete(state: State<'_, AppState>, id: String, comment: u64) -> AppResult<()> {
    gists::delete_comment(&state.active_client()?, &id, comment).await
}

#[tauri::command]
#[specta::specta]
pub async fn stars_list(state: State<'_, AppState>) -> AppResult<Vec<Starred>> {
    stars::list(&state.active_client()?).await
}


#[tauri::command]
#[specta::specta]
pub async fn stars_set(state: State<'_, AppState>, repos: Vec<String>, on: bool) -> AppResult<Vec<String>> {
    let c = state.active_client()?;
    let mut failed = vec![];
    for r in repos {
        if stars::set_starred(&c, &r, on).await.is_err() {
            failed.push(r);
        }
    }
    Ok(failed)
}

#[tauri::command]
#[specta::specta]
pub async fn star_lists(state: State<'_, AppState>) -> AppResult<Vec<StarList>> {
    stars::lists(&state.active_client()?).await
}

#[tauri::command]
#[specta::specta]
pub async fn star_list_create(state: State<'_, AppState>, name: String, description: String, is_private: bool) -> AppResult<String> {
    stars::create_list(&state.active_client()?, &name, &description, is_private).await
}

#[tauri::command]
#[specta::specta]
pub async fn star_list_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    stars::delete_list(&state.active_client()?, &id).await
}

#[tauri::command]
#[specta::specta]
pub async fn star_set_lists(state: State<'_, AppState>, item_id: String, list_ids: Vec<String>) -> AppResult<()> {
    stars::set_lists(&state.active_client()?, &item_id, &list_ids).await
}

#[tauri::command]
#[specta::specta]
pub async fn search_run(state: State<'_, AppState>, kind: SearchKind, q: String, page: u32, sort: Option<String>) -> AppResult<SearchPage> {
    search::search(&state.active_client()?, kind, &q, page, sort.as_deref()).await
}
