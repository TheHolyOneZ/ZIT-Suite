use std::collections::BTreeMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};
use tauri_specta::Event;

use crate::error::AppResult;
use crate::github::about::{self, About, AboutInput};
use crate::github::actions::{self, Artifact, Job, JobLog, Run, Workflow};
use crate::github::releases::{self, Asset, Notes, Release, ReleaseInput, RepoReleases, Tag, Unreleased};
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn about_get(state: State<'_, AppState>, repo: String, fresh: bool) -> AppResult<About> {
    about::get(&state.active_client()?, &repo, fresh).await
}

#[tauri::command]
#[specta::specta]
pub async fn about_save(state: State<'_, AppState>, repo: String, input: AboutInput) -> AppResult<About> {
    about::save(&state.active_client()?, &repo, &input).await
}

#[tauri::command]
#[specta::specta]
pub async fn releases_list(state: State<'_, AppState>, repo: String, fresh: bool) -> AppResult<Vec<Release>> {
    releases::list(&state.active_client()?, &repo, fresh).await
}

#[tauri::command]
#[specta::specta]
pub async fn release_create(state: State<'_, AppState>, repo: String, input: ReleaseInput) -> AppResult<Release> {
    releases::create(&state.active_client()?, &repo, &input).await
}

#[tauri::command]
#[specta::specta]
pub async fn release_update(state: State<'_, AppState>, repo: String, id: u64, input: ReleaseInput) -> AppResult<Release> {
    releases::update(&state.active_client()?, &repo, id, &input).await
}

#[tauri::command]
#[specta::specta]
pub async fn release_delete(state: State<'_, AppState>, repo: String, id: u64, tag: Option<String>) -> AppResult<()> {
    releases::delete(&state.active_client()?, &repo, id, tag.as_deref()).await
}

#[tauri::command]
#[specta::specta]
pub async fn release_notes(state: State<'_, AppState>, repo: String, tag: String, target: Option<String>, previous: Option<String>) -> AppResult<Notes> {
    releases::generate_notes(&state.active_client()?, &repo, &tag, target.as_deref(), previous.as_deref()).await
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ReleaseUploadProgress {
    pub release_id: u64,

    pub name: String,
    pub index: u32,
    pub count: u32,
    pub sent: f64,
    pub total: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct UploadResult {
    pub uploaded: Vec<Asset>,

    pub failed: Vec<(String, crate::error::AppError)>,
}


#[tauri::command]
#[specta::specta]
pub async fn release_upload(app: AppHandle, state: State<'_, AppState>, repo: String, release_id: u64, paths: Vec<String>) -> AppResult<UploadResult> {
    let c = state.active_client()?;
    let count = paths.len() as u32;
    let mut out = UploadResult { uploaded: vec![], failed: vec![] };
    for (i, path) in paths.into_iter().enumerate() {
        let name = releases::asset_name(&path);
        let (app2, name2) = (app.clone(), name.clone());
        let progress: releases::Progress = Arc::new(move |sent, total| {
            let _ = ReleaseUploadProgress { release_id, name: name2.clone(), index: i as u32 + 1, count, sent: sent as f64, total: total as f64 }.emit(&app2);
        });
        match releases::upload_asset(&c, &repo, release_id, &path, progress).await {
            Ok(a) => out.uploaded.push(a),
            Err(e) => out.failed.push((name, e)),
        }
    }
    Ok(out)
}

#[tauri::command]
#[specta::specta]
pub async fn asset_delete(state: State<'_, AppState>, repo: String, asset_id: u64) -> AppResult<()> {
    releases::delete_asset(&state.active_client()?, &repo, asset_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn tags_list(state: State<'_, AppState>, repo: String, fresh: bool) -> AppResult<Vec<Tag>> {
    releases::tags(&state.active_client()?, &repo, fresh).await
}

#[tauri::command]
#[specta::specta]
pub async fn tag_create(state: State<'_, AppState>, repo: String, name: String, target: String) -> AppResult<()> {
    releases::create_tag(&state.active_client()?, &repo, &name, &target).await
}

#[tauri::command]
#[specta::specta]
pub async fn tag_delete(state: State<'_, AppState>, repo: String, name: String) -> AppResult<()> {
    releases::delete_tag(&state.active_client()?, &repo, &name).await
}

#[tauri::command]
#[specta::specta]
pub async fn actions_workflows(state: State<'_, AppState>, repo: String, fresh: bool) -> AppResult<Vec<Workflow>> {
    actions::workflows(&state.active_client()?, &repo, fresh).await
}

#[tauri::command]
#[specta::specta]
pub async fn actions_runs(state: State<'_, AppState>, repo: String, workflow: Option<u64>, fresh: bool) -> AppResult<Vec<Run>> {
    actions::runs(&state.active_client()?, &repo, workflow, 100, fresh).await
}

#[tauri::command]
#[specta::specta]
pub async fn actions_dispatch(state: State<'_, AppState>, repo: String, workflow_id: u64, git_ref: String, inputs: BTreeMap<String, String>) -> AppResult<()> {
    actions::dispatch(&state.active_client()?, &repo, workflow_id, &git_ref, &inputs).await
}

#[tauri::command]
#[specta::specta]
pub async fn actions_rerun(state: State<'_, AppState>, repo: String, run_id: u64, failed_only: bool) -> AppResult<()> {
    actions::rerun(&state.active_client()?, &repo, run_id, failed_only).await
}

#[tauri::command]
#[specta::specta]
pub async fn actions_cancel(state: State<'_, AppState>, repo: String, run_id: u64) -> AppResult<()> {
    actions::cancel(&state.active_client()?, &repo, run_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn actions_set_enabled(state: State<'_, AppState>, repo: String, workflow_id: u64, enabled: bool) -> AppResult<()> {
    actions::set_enabled(&state.active_client()?, &repo, workflow_id, enabled).await
}

#[tauri::command]
#[specta::specta]
pub async fn actions_source(state: State<'_, AppState>, repo: String, path: String, git_ref: Option<String>) -> AppResult<String> {
    actions::source(&state.active_client()?, &repo, &path, git_ref.as_deref()).await
}

#[tauri::command]
#[specta::specta]
pub async fn actions_jobs(state: State<'_, AppState>, repo: String, run_id: u64, fresh: bool) -> AppResult<Vec<Job>> {
    actions::jobs(&state.active_client()?, &repo, run_id, fresh).await
}

#[tauri::command]
#[specta::specta]
pub async fn actions_job_log(state: State<'_, AppState>, repo: String, job_id: u64) -> AppResult<JobLog> {
    actions::job_log(&state.active_client()?, &repo, job_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn actions_artifacts(state: State<'_, AppState>, repo: String, run_id: u64, fresh: bool) -> AppResult<Vec<Artifact>> {
    actions::artifacts(&state.active_client()?, &repo, run_id, fresh).await
}


#[tauri::command]
#[specta::specta]
pub async fn actions_download_artifact(state: State<'_, AppState>, repo: String, artifact_id: u64, dest: String) -> AppResult<f64> {
    Ok(actions::download_artifact(&state.active_client()?, &repo, artifact_id, std::path::Path::new(&dest)).await? as f64)
}

#[tauri::command]
#[specta::specta]
pub async fn actions_delete_run(state: State<'_, AppState>, repo: String, run_id: u64) -> AppResult<()> {
    actions::delete_run(&state.active_client()?, &repo, run_id).await
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RepoRuns {
    pub repo: String,
    pub runs: Vec<Run>,
    pub error: Option<crate::error::AppError>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ActionsProgress {
    pub done: u32,
    pub total: u32,
}


#[tauri::command]
#[specta::specta]
pub async fn actions_overview(app: AppHandle, state: State<'_, AppState>, repos: Vec<String>, fresh: bool) -> AppResult<Vec<RepoRuns>> {
    let c = state.active_client()?;
    Ok(super::scan::bounded(
        repos,
        |repo| {
            let c = c.clone();
            async move {
                match actions::runs(&c, &repo, None, 20, fresh).await {
                    Ok(runs) => RepoRuns { repo, runs, error: None },
                    Err(e) => RepoRuns { repo, runs: vec![], error: Some(e) },
                }
            }
        },
        |done, total| {
            let _ = ActionsProgress { done, total }.emit(&app);
        },
    )
    .await)
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ReleasesProgress {
    pub done: u32,
    pub total: u32,
}


#[tauri::command]
#[specta::specta]
pub async fn releases_overview(app: AppHandle, state: State<'_, AppState>, targets: Vec<crate::github::deps::DepsTarget>, fresh: bool) -> AppResult<Vec<RepoReleases>> {
    let c = state.active_client()?;
    Ok(super::scan::bounded(
        targets,
        |t| {
            let c = c.clone();
            async move { releases::overview(&c, &t.repo, &t.branch, fresh).await }
        },
        |done, total| {
            let _ = ReleasesProgress { done, total }.emit(&app);
        },
    )
    .await)
}

#[tauri::command]
#[specta::specta]
pub async fn releases_unreleased(state: State<'_, AppState>, repo: String, base: String, head: String) -> AppResult<Unreleased> {
    releases::unreleased(&state.active_client()?, &repo, &base, &head).await
}
