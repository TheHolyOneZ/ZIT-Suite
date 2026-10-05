use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};
use tauri_specta::Event;

use crate::error::{AppError, AppResult};
use crate::github::repos::{self, LanguageShare, Repo};
use crate::github::users::{self, Org};
use crate::github::GitHubClient;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn orgs_list(state: State<'_, AppState>) -> AppResult<Vec<Org>> {
    users::orgs(&state.active_client()?).await
}


#[tauri::command]
#[specta::specta]
pub async fn repos_list(state: State<'_, AppState>, org: Option<String>, fresh: bool) -> AppResult<Vec<Repo>> {
    let c = state.active_client()?;
    match org {
        Some(org) => repos::list_for_org(&c, &org, fresh).await,
        None => repos::list_for_user(&c, fresh).await,
    }
}

#[tauri::command]
#[specta::specta]
pub async fn repos_languages(state: State<'_, AppState>, full_name: String) -> AppResult<Vec<LanguageShare>> {
    repos::languages(&state.active_client()?, &full_name).await
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ExportKinds {
    pub readme: bool,
    pub release_info: bool,
    pub release_assets: bool,
    pub metadata: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ExportFailure {
    pub repo: String,
    pub kind: String,
    pub error: AppError,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ExportReport {
    pub files_written: u32,
    pub failures: Vec<ExportFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct ExportProgress {
    pub done: u32,
    pub total: u32,
    pub repo: String,
}

#[derive(Deserialize)]
struct Release {
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    url: String,
}


fn safe_segment(s: &str) -> AppResult<String> {
    crate::platform::sanitize_file_name(s).ok_or_else(|| AppError::new("export.unsafe_name").detail(s.to_string()))
}

fn write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, bytes)?;
    Ok(())
}

async fn export_one(c: &GitHubClient, repo: &str, kinds: &ExportKinds, base: &Path, failures: &mut Vec<ExportFailure>) -> u32 {
    let mut written = 0;
    let dir: PathBuf = match repo.split_once('/').map(|(o, r)| (safe_segment(o), safe_segment(r))) {
        Some((Ok(o), Ok(r))) => base.join(o).join(r),
        _ => {
            failures.push(ExportFailure { repo: repo.into(), kind: "repo".into(), error: AppError::new("export.unsafe_name") });
            return 0;
        }
    };
    let mut fail = |kind: &str, error: AppError| failures.push(ExportFailure { repo: repo.into(), kind: kind.into(), error });

    if kinds.metadata {
        let r = async {
            let meta: serde_json::Value = c.get_json(&format!("/repos/{repo}")).await?;
            write(&dir.join("metadata.json"), &serde_json::to_vec_pretty(&meta)?)
        }
        .await;
        match r { Ok(()) => written += 1, Err(e) => fail("metadata", e) }
    }

    if kinds.readme {
        let r = async {
            let bytes = c.get_bytes(&format!("/repos/{repo}/readme"), "application/vnd.github.raw+json").await?;
            write(&dir.join("README.md"), &bytes)
        }
        .await;
        match r { Ok(()) => written += 1, Err(e) => fail("readme", e) }
    }

    if kinds.release_info || kinds.release_assets {
        match c.get_json::<serde_json::Value>(&format!("/repos/{repo}/releases/latest")).await {
            Ok(release) => {
                if kinds.release_info {
                    match serde_json::to_vec_pretty(&release).map_err(AppError::from).and_then(|b| write(&dir.join("release.json"), &b)) {
                        Ok(()) => written += 1,
                        Err(e) => fail("release_info", e),
                    }
                }
                if kinds.release_assets {
                    let assets = serde_json::from_value::<Release>(release).map(|r| r.assets).unwrap_or_default();
                    for a in assets {
                        let r = async {
                            let name = safe_segment(&a.name)?;
                            let bytes = c.get_bytes(&a.url, "application/octet-stream").await?;
                            write(&dir.join("assets").join(&name), &bytes)
                        }
                        .await;
                        match r { Ok(()) => written += 1, Err(e) => fail("release_assets", e) }
                    }
                }
            }

            Err(e) if e.code == "github.not_found" => {}
            Err(e) => fail("release_info", e),
        }
    }
    written
}

#[tauri::command]
#[specta::specta]
pub async fn repos_export(
    app: AppHandle,
    state: State<'_, AppState>,
    full_names: Vec<String>,
    kinds: ExportKinds,
    dir: String,
) -> AppResult<ExportReport> {
    let c = state.active_client()?;
    let base = PathBuf::from(dir);
    let total = full_names.len() as u32;
    let mut failures = Vec::new();
    let mut files_written = 0;
    for (i, repo) in full_names.iter().enumerate() {
        files_written += export_one(&c, repo, &kinds, &base, &mut failures).await;
        let _ = ExportProgress { done: i as u32 + 1, total, repo: repo.clone() }.emit(&app);
    }
    Ok(ExportReport { files_written, failures })
}


#[tauri::command]
#[specta::specta]
pub async fn repos_create(state: State<'_, AppState>, input: crate::github::repos::RepoDraft) -> AppResult<crate::github::repos::Repo> {
    crate::github::repos::create_new(&state.active_client()?, &input).await
}

#[tauri::command]
#[specta::specta]
pub async fn repos_gitignore_templates(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    crate::github::repos::gitignore_templates(&state.active_client()?).await
}

#[tauri::command]
#[specta::specta]
pub async fn repos_licenses(state: State<'_, AppState>) -> AppResult<Vec<crate::github::repos::LicenseChoice>> {
    crate::github::repos::licenses(&state.active_client()?).await
}
