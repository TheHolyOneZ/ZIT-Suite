use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::github::repos;
use crate::state::AppState;
use crate::workspace::git::{self, BranchInfo, CommitInfo, FileChange, ShareResult, Suggestion, TreeEntry, UpdateKind};
use crate::workspace::store::Workspace;
use crate::workspace::tools::{self, ConflictFile, Parked, Pick, WorkDiff};

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| AppError::new("internal.unknown").detail(e.to_string()))?
}

fn get(state: &State<'_, AppState>, id: &str) -> AppResult<Workspace> {
    state.workspaces.lock().unwrap().get(id)
}

fn token(state: &State<'_, AppState>) -> Option<String> {
    state.active_client().ok().map(|c| c.token().to_string())
}


fn apply_remotes(ws: &Workspace) -> AppResult<()> {
    let repo = git::open(&ws.path)?;
    if let Some(p) = &ws.push_repo {
        git::set_remote(&repo, "origin", &git::github_url(p))?;
    }
    match ws.distinct_reference() {
        Some(r) => git::set_remote(&repo, "reference", &git::github_url(r)),
        None => git::remove_remote(&repo, "reference"),
    }
}

#[tauri::command]
#[specta::specta]
pub fn ws_list(state: State<'_, AppState>) -> Vec<Workspace> {
    state.workspaces.lock().unwrap().all().to_vec()
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FolderInfo {
    pub path: String,
    pub name: String,

    pub is_repo: bool,
    pub root: Option<String>,
    pub branch: Option<String>,
    pub has_commits: bool,

    pub origin: Option<String>,

    pub upstream: Option<String>,
    pub entries: u32,
    pub suggestions: Vec<Suggestion>,

    pub existing: Option<String>,
}


#[tauri::command]
#[specta::specta]
pub async fn ws_inspect(state: State<'_, AppState>, path: String) -> AppResult<FolderInfo> {
    let existing = state.workspaces.lock().unwrap().by_path(&path).map(|w| w.id.clone());
    blocking(move || {
        let p = Path::new(&path);
        if !p.is_dir() {
            return Err(AppError::new("workspace.no_folder").detail(path.clone()));
        }
        let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.clone());
        let entries = std::fs::read_dir(p).map(|r| r.count() as u32).unwrap_or(0);
        match git::discover(&path) {
            Some(root) => {
                let root_s = root.to_string_lossy().trim_end_matches(['/', '\\']).to_string();
                let repo = git::open(&root_s)?;
                let has_commits = repo.head().is_ok();
                Ok(FolderInfo {
                    is_repo: true,
                    branch: git::current_branch(&repo)?,
                    has_commits,
                    origin: git::remote_slug(&repo, "origin"),
                    upstream: git::remote_slug(&repo, "upstream").or_else(|| git::remote_slug(&repo, "reference")),
                    suggestions: git::suggestions(&repo)?,
                    root: Some(root_s.clone()),
                    path: root_s,
                    name,
                    entries,
                    existing,
                })
            }
            None => Ok(FolderInfo {
                suggestions: git::suggestions_at(p, None)?,
                is_repo: false,
                root: None,
                branch: None,
                has_commits: false,
                origin: None,
                upstream: None,
                path,
                name,
                entries,
                existing,
            }),
        }
    })
    .await
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct NewRepo {
    pub name: String,
    pub private: bool,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AddWorkspace {
    pub path: String,
    pub name: String,

    pub push_repo: Option<String>,

    pub create: Option<NewRepo>,
    pub reference_repo: Option<String>,

    pub ignore: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AddResult {
    pub workspace: Workspace,

    pub steps: Vec<String>,

    pub warning: Option<AppError>,
}


#[tauri::command]
#[specta::specta]
pub async fn ws_clone(state: State<'_, AppState>, repo: String, parent: String, folder: String) -> AppResult<Workspace> {
    let slug = git::parse_slug(&repo).ok_or_else(|| AppError::new("workspace.bad_repo").detail(repo.clone()))?;
    let folder = crate::platform::sanitize_file_name(folder.trim()).ok_or_else(|| AppError::new("workspace.bad_folder"))?;
    let parent = parent.trim().trim_end_matches(['/', '\\']);

    let parent = match (parent.strip_prefix('~'), std::env::home_dir()) {
        (Some(rest), Some(home)) if rest.is_empty() || rest.starts_with(['/', '\\']) => home.join(rest.trim_start_matches(['/', '\\'])),
        _ => std::path::PathBuf::from(parent),
    };
    if parent.as_os_str().is_empty() {
        return Err(AppError::new("workspace.bad_folder"));
    }
    let dest = parent.join(&folder);
    let path = dest.to_string_lossy().into_owned();
    if state.workspaces.lock().unwrap().by_path(&path).is_some() {
        return Err(AppError::new("workspace.exists"));
    }
    let tok = token(&state);
    let url = git::github_url(&slug);
    blocking(move || git::clone(&url, &dest, tok.as_deref()).map(drop)).await?;
    let id = format!("ws-{:x}", chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default());
    let name = slug.rsplit('/').next().unwrap_or(&slug).to_string();
    let mut ws = Workspace::new(id, name, path);
    ws.push_repo = Some(slug);
    let ws = state.workspaces.lock().unwrap().upsert(ws)?;
    let ws2 = ws.clone();
    blocking(move || apply_remotes(&ws2)).await?;
    Ok(ws)
}


#[tauri::command]
#[specta::specta]
pub async fn ws_add(app: AppHandle, state: State<'_, AppState>, req: AddWorkspace) -> AppResult<AddResult> {
    let mut steps = Vec::new();
    let path = req.path.trim_end_matches(['/', '\\']).to_string();
    if state.workspaces.lock().unwrap().by_path(&path).is_some() {
        return Err(AppError::new("workspace.exists"));
    }
    let p2 = path.clone();
    let ignore = req.ignore.clone();
    let fresh = blocking(move || {
        let fresh = git::discover(&p2).is_none();
        let repo = if fresh { git::init(&p2)? } else { git::open(&p2)? };
        if !ignore.is_empty() {
            git::add_ignore_patterns(&repo, &ignore)?;
        }
        Ok(fresh)
    })
    .await?;
    if fresh {
        steps.push("initialized".to_string());
    }

    let mut push_repo = req.push_repo.as_deref().and_then(git::parse_slug);
    if let Some(n) = &req.create {
        let created = repos::create(&state.active_client()?, n.name.trim(), n.private, n.description.as_deref()).await?;
        push_repo = Some(created.full_name);
        steps.push("created_repo".to_string());
    }

    let id = format!("ws-{:x}", chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default());
    let mut ws = Workspace::new(id, req.name.trim().to_string(), path.clone());
    ws.push_repo = push_repo;
    ws.reference_repo = req.reference_repo.clone();
    let ws = state.workspaces.lock().unwrap().upsert(ws)?;
    let ws2 = ws.clone();
    blocking(move || apply_remotes(&ws2)).await?;


    let mut warning = None;
    if fresh {
        let (name, email) = state.git_identity();
        let tok = token(&state);
        let ws3 = ws.clone();
        let res = blocking(move || {
            let repo = git::open(&ws3.path)?;
            let mut done = Vec::new();
            if !git::changes(&repo)?.is_empty() {
                git::commit(&repo, None, "First version", &git::signature(&repo, &name, &email)?)?;
                done.push("first_commit".to_string());
                if ws3.push_repo.is_some() {
                    git::push(&repo, "origin", tok.as_deref())?;
                    done.push("pushed".to_string());
                }
            }
            Ok(done)
        })
        .await;
        match res {
            Ok(done) => steps.extend(done),
            Err(e) => warning = Some(e),
        }
    }
    state.watchers.restart(&app, &ws);
    Ok(AddResult { workspace: ws, steps, warning })
}


#[tauri::command]
#[specta::specta]
pub async fn ws_update(app: AppHandle, state: State<'_, AppState>, ws: Workspace) -> AppResult<Workspace> {
    get(&state, &ws.id)?;
    let ws = state.workspaces.lock().unwrap().upsert(ws)?;
    let ws2 = ws.clone();
    blocking(move || apply_remotes(&ws2)).await?;
    state.watchers.restart(&app, &ws);
    Ok(ws)
}


#[tauri::command]
#[specta::specta]
pub fn ws_remove(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.watchers.stop(&id);
    state.workspaces.lock().unwrap().remove(&id)
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorkspaceStatus {
    pub id: String,

    pub ok: bool,
    pub error: Option<AppError>,
    pub branch: Option<String>,
    pub has_commits: bool,
    pub changes: Vec<FileChange>,
    pub suggested_message: String,

    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    pub last_commit: Option<CommitInfo>,
    pub watching: bool,
}

#[tauri::command]
#[specta::specta]
pub async fn ws_status(state: State<'_, AppState>, id: String) -> AppResult<WorkspaceStatus> {
    let ws = get(&state, &id)?;
    let watching = state.watchers.is_running(&id);
    blocking(move || {
        let fail = |e: AppError| WorkspaceStatus {
            id: ws.id.clone(),
            ok: false,
            error: Some(e),
            branch: None,
            has_commits: false,
            changes: vec![],
            suggested_message: String::new(),
            ahead: None,
            behind: None,
            last_commit: None,
            watching,
        };
        if !Path::new(&ws.path).is_dir() {
            return Ok(fail(AppError::new("workspace.no_folder").detail(ws.path.clone())));
        }
        let repo = match git::open(&ws.path) {
            Ok(r) => r,
            Err(e) => return Ok(fail(e)),
        };
        let branch = git::current_branch(&repo)?;
        let changes = git::changes(&repo)?;
        let ab = match (&branch, &ws.push_repo) {
            (Some(b), Some(_)) => git::ahead_behind(&repo, "origin", b)?,
            _ => None,
        };
        let has_commits = repo.head().is_ok();
        Ok(WorkspaceStatus {
            id: ws.id.clone(),
            ok: true,
            error: None,
            has_commits,
            suggested_message: git::suggest_message(&changes),
            last_commit: git::history(&repo, 1, None)?.into_iter().next(),
            ahead: ab.map(|x| x.0 as u32),
            behind: ab.map(|x| x.1 as u32),
            branch,
            changes,
            watching,
        })
    })
    .await
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RemoteCompare {
    pub slug: String,
    pub branch: String,

    pub ahead: u32,

    pub behind: u32,

    pub related: bool,

    pub exists: bool,
    pub incoming: Vec<CommitInfo>,
    pub outgoing: Vec<CommitInfo>,
    pub error: Option<AppError>,

    pub missing: bool,

    pub renamed_to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SyncState {
    pub push: Option<RemoteCompare>,
    pub reference: Option<RemoteCompare>,
    pub checked_at: String,
}

fn compare(repo: &git2::Repository, remote: &str, slug: &str, branch: &str) -> AppResult<RemoteCompare> {
    let exists = repo.find_reference(&format!("refs/remotes/{remote}/{branch}")).is_ok();
    let (ahead, behind) = git::ahead_behind(repo, remote, branch)?.unwrap_or((0, 0));
    let related = match (repo.head().ok().and_then(|h| h.target()), repo.find_reference(&format!("refs/remotes/{remote}/{branch}")).ok().and_then(|r| r.target())) {
        (Some(a), Some(b)) => repo.merge_base(a, b).is_ok(),
        _ => true,
    };
    Ok(RemoteCompare {
        slug: slug.to_string(),
        branch: branch.to_string(),
        ahead: ahead as u32,
        behind: behind as u32,
        related,
        exists,
        incoming: if exists { git::incoming(repo, remote, branch, 30)? } else { vec![] },
        outgoing: if exists { git::outgoing(repo, remote, branch, 30)? } else { vec![] },
        error: None,
        missing: false,
        renamed_to: None,
    })
}

enum Lookup {
    Fine,
    Missing,
    Renamed(String),
}

async fn lookup(c: &crate::github::GitHubClient, slug: &str) -> Lookup {
    match repos::get(c, slug).await {
        Ok(r) if !r.full_name.eq_ignore_ascii_case(slug) => Lookup::Renamed(r.full_name),
        Ok(_) => Lookup::Fine,
        Err(e) if e.code == "github.not_found" => Lookup::Missing,
        Err(_) => Lookup::Fine,
    }
}

fn failed(slug: &str, branch: &str, e: AppError) -> RemoteCompare {
    RemoteCompare { slug: slug.into(), branch: branch.into(), ahead: 0, behind: 0, related: true, exists: false, incoming: vec![], outgoing: vec![], error: Some(e), missing: false, renamed_to: None }
}


#[tauri::command]
#[specta::specta]
pub async fn ws_sync(state: State<'_, AppState>, id: String, online: bool, reference_branch: Option<String>) -> AppResult<SyncState> {
    let ws = get(&state, &id)?;
    let tok = token(&state);

    let ref_branch = match (ws.distinct_reference(), online) {
        (Some(r), true) => match state.active_client() {
            Ok(c) => repos::get(&c, r).await.ok().and_then(|x| x.default_branch),
            Err(_) => None,
        },
        _ => reference_branch,
    };

    let mut lookups: Vec<(String, Lookup)> = vec![];
    if online {
        if let Ok(c) = state.active_client() {
            for slug in [ws.push_repo.clone(), ws.distinct_reference().map(str::to_string)].into_iter().flatten() {
                lookups.push((slug.clone(), lookup(&c, &slug).await));
            }
        }
    }
    let flag = move |mut cmp: RemoteCompare| {
        if let Some((_, l)) = lookups.iter().find(|(s, _)| s.eq_ignore_ascii_case(&cmp.slug)) {
            match l {
                Lookup::Missing => cmp.missing = true,
                Lookup::Renamed(to) => cmp.renamed_to = Some(to.clone()),
                Lookup::Fine => {}
            }
        }
        cmp
    };
    blocking(move || {
        let repo = git::open(&ws.path)?;
        let branch = git::current_branch(&repo)?.unwrap_or_else(|| "main".into());
        let fetch = |remote: &str| if online { git::fetch(&repo, remote, tok.as_deref()) } else { Ok(()) };
        let push = ws.push_repo.as_ref().map(|slug| match fetch("origin") {
            Ok(()) => compare(&repo, "origin", slug, &branch).unwrap_or_else(|e| failed(slug, &branch, e)),
            Err(e) => failed(slug, &branch, e),
        });
        let reference = ws.distinct_reference().and_then(|slug| match fetch("reference") {
            Ok(()) => {
                let b = ref_branch.clone().unwrap_or_else(|| {
                    ["main", "master"].into_iter().find(|b| repo.find_reference(&format!("refs/remotes/reference/{b}")).is_ok()).unwrap_or("main").to_string()
                });

                if !online && repo.find_reference(&format!("refs/remotes/reference/{b}")).is_err() {
                    return None;
                }
                Some(compare(&repo, "reference", slug, &b).unwrap_or_else(|e| failed(slug, &b, e)))
            }
            Err(e) => Some(failed(slug, ref_branch.as_deref().unwrap_or("main"), e)),
        });
        Ok(SyncState { push: push.map(&flag), reference: reference.map(&flag), checked_at: chrono::Utc::now().to_rfc3339() })
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn ws_history(state: State<'_, AppState>, id: String, limit: u32) -> AppResult<Vec<CommitInfo>> {
    let ws = get(&state, &id)?;
    blocking(move || {
        let repo = git::open(&ws.path)?;
        git::history(&repo, limit.clamp(1, 500) as usize, ws.push_repo.as_ref().map(|_| "origin"))
    })
    .await
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CommitOutcome {
    pub commit: CommitInfo,
    pub pushed: bool,

    pub push_error: Option<AppError>,
}


#[tauri::command]
#[specta::specta]
pub async fn ws_commit(state: State<'_, AppState>, id: String, paths: Option<Vec<String>>, message: String, push: bool) -> AppResult<CommitOutcome> {
    let ws = get(&state, &id)?;
    let (name, email) = state.git_identity();
    let tok = token(&state);
    blocking(move || {
        let repo = git::open(&ws.path)?;
        let commit = git::commit(&repo, paths.as_deref(), &message, &git::signature(&repo, &name, &email)?)?;
        if push && ws.push_repo.is_some() {
            return Ok(match git::push(&repo, "origin", tok.as_deref()) {
                Ok(()) => CommitOutcome { commit, pushed: true, push_error: None },
                Err(e) => CommitOutcome { commit, pushed: false, push_error: Some(e) },
            });
        }
        Ok(CommitOutcome { commit, pushed: false, push_error: None })
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn ws_push(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let ws = get(&state, &id)?;
    if ws.push_repo.is_none() {
        return Err(AppError::new("workspace.no_push_target"));
    }
    let tok = token(&state);
    blocking(move || git::push(&git::open(&ws.path)?, "origin", tok.as_deref())).await
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    Push,
    Reference,
}

fn remote_for(ws: &Workspace, source: Source) -> AppResult<&'static str> {
    match source {
        Source::Push if ws.push_repo.is_some() => Ok("origin"),
        Source::Reference if ws.distinct_reference().is_some() => Ok("reference"),
        _ => Err(AppError::new("workspace.no_push_target")),
    }
}


#[tauri::command]
#[specta::specta]
pub async fn ws_get_latest(state: State<'_, AppState>, id: String, source: Source, branch: String) -> AppResult<UpdateKind> {
    let ws = get(&state, &id)?;
    let (name, email) = state.git_identity();
    let tok = token(&state);
    blocking(move || {
        let repo = git::open(&ws.path)?;
        let remote = remote_for(&ws, source)?;
        git::fetch(&repo, remote, tok.as_deref())?;
        git::get_latest(&repo, remote, &branch, &git::signature(&repo, &name, &email)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn ws_branches(state: State<'_, AppState>, id: String) -> AppResult<Vec<BranchInfo>> {
    let ws = get(&state, &id)?;
    blocking(move || git::branches(&git::open(&ws.path)?)).await
}

#[tauri::command]
#[specta::specta]
pub async fn ws_branch_create(state: State<'_, AppState>, id: String, name: String, then_switch: bool) -> AppResult<()> {
    let ws = get(&state, &id)?;
    blocking(move || git::create_branch(&git::open(&ws.path)?, &name, then_switch)).await
}

#[tauri::command]
#[specta::specta]
pub async fn ws_branch_switch(state: State<'_, AppState>, id: String, name: String) -> AppResult<()> {
    let ws = get(&state, &id)?;
    blocking(move || git::switch_branch(&git::open(&ws.path)?, &name)).await
}

#[tauri::command]
#[specta::specta]
pub async fn ws_tree(state: State<'_, AppState>, id: String, dir: String) -> AppResult<Vec<TreeEntry>> {
    let ws = get(&state, &id)?;
    blocking(move || git::tree(&git::open(&ws.path)?, &dir)).await
}

#[tauri::command]
#[specta::specta]
pub async fn ws_set_shared(state: State<'_, AppState>, id: String, path: String, dir: bool, shared: bool) -> AppResult<ShareResult> {
    let ws = get(&state, &id)?;
    blocking(move || git::set_shared(&ws.path, &path, dir, shared)).await
}

#[tauri::command]
#[specta::specta]
pub async fn ws_gitignore(state: State<'_, AppState>, id: String) -> AppResult<String> {
    let ws = get(&state, &id)?;
    blocking(move || git::read_gitignore(&git::open(&ws.path)?)).await
}

#[tauri::command]
#[specta::specta]
pub async fn ws_gitignore_save(state: State<'_, AppState>, id: String, text: String) -> AppResult<()> {
    let ws = get(&state, &id)?;
    blocking(move || git::write_gitignore(&git::open(&ws.path)?, &text)).await
}

#[tauri::command]
#[specta::specta]
pub async fn ws_ignore_add(state: State<'_, AppState>, id: String, patterns: Vec<String>) -> AppResult<u32> {
    let ws = get(&state, &id)?;
    blocking(move || git::add_ignore_patterns(&git::open(&ws.path)?, &patterns).map(|n| n as u32)).await
}

#[tauri::command]
#[specta::specta]
pub async fn ws_suggestions(state: State<'_, AppState>, id: String) -> AppResult<Vec<Suggestion>> {
    let ws = get(&state, &id)?;
    blocking(move || git::suggestions(&git::open(&ws.path)?)).await
}


#[tauri::command]
#[specta::specta]
pub async fn ws_discard(state: State<'_, AppState>, id: String, paths: Vec<String>) -> AppResult<()> {
    let ws = get(&state, &id)?;
    blocking(move || git::discard(&git::open(&ws.path)?, &paths)).await
}


fn workflow_path(name: &str) -> AppResult<String> {
    let n = name.trim();
    let ok = !n.is_empty() && n.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c)) && !n.starts_with('.') && (n.ends_with(".yml") || n.ends_with(".yaml"));
    if !ok {
        return Err(AppError::new("workspace.bad_workflow_name").detail(n.to_string()));
    }
    Ok(format!(".github/workflows/{n}"))
}


#[tauri::command]
#[specta::specta]
pub async fn ws_add_workflow(state: State<'_, AppState>, id: String, name: String, content: String) -> AppResult<String> {
    let ws = get(&state, &id)?;
    let rel = workflow_path(&name)?;
    blocking(move || {
        let full = Path::new(&ws.path).join(&rel);
        if full.exists() {
            return Err(AppError::new("workspace.workflow_exists").detail(rel));
        }
        std::fs::create_dir_all(full.parent().expect("has parent")).map_err(|e| AppError::new("workspace.io").detail(e.to_string()))?;
        std::fs::write(&full, content).map_err(|e| AppError::new("workspace.io").detail(e.to_string()))?;
        Ok(rel)
    })
    .await
}


#[tauri::command]
#[specta::specta]
pub async fn ws_save_workflow(state: State<'_, AppState>, id: String, name: String, content: String, old_path: Option<String>) -> AppResult<String> {
    let ws = get(&state, &id)?;
    let rel = workflow_path(&name)?;
    if let Some(old) = &old_path {
        workflow_path(old.trim_start_matches(".github/workflows/"))?;
    }
    blocking(move || {
        let root = Path::new(&ws.path);
        let full = root.join(&rel);

        if old_path.as_deref() != Some(rel.as_str()) && full.exists() {
            return Err(AppError::new("workspace.workflow_exists").detail(rel));
        }
        std::fs::create_dir_all(full.parent().expect("has parent")).map_err(|e| AppError::new("workspace.io").detail(e.to_string()))?;
        std::fs::write(&full, content).map_err(|e| AppError::new("workspace.io").detail(e.to_string()))?;
        if let Some(old) = old_path.filter(|o| *o != rel) {
            let _ = std::fs::remove_file(root.join(old));
        }
        Ok(rel)
    })
    .await
}


#[tauri::command]
#[specta::specta]
pub async fn ws_delete_workflow(state: State<'_, AppState>, id: String, path: String) -> AppResult<()> {
    let ws = get(&state, &id)?;
    workflow_path(path.trim_start_matches(".github/workflows/"))?;
    blocking(move || match std::fs::remove_file(Path::new(&ws.path).join(&path)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(AppError::new("workspace.io").detail(e.to_string())),
    })
    .await
}


#[tauri::command]
#[specta::specta]
pub async fn ws_read_workflow(state: State<'_, AppState>, id: String, path: String) -> AppResult<Option<String>> {
    let ws = get(&state, &id)?;
    if !path.starts_with(".github/workflows/") || path.contains("..") {
        return Err(AppError::new("workspace.bad_workflow_name").detail(path));
    }
    blocking(move || Ok(std::fs::read_to_string(Path::new(&ws.path).join(&path)).ok())).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workflow_names() {
        assert_eq!(workflow_path("ci.yml").unwrap(), ".github/workflows/ci.yml");
        for bad in ["../x.yml", "a/b.yml", "x.txt", ".hidden.yml", ""] {
            assert!(workflow_path(bad).is_err(), "{bad}");
        }
    }
}


#[tauri::command]
#[specta::specta]
pub async fn ws_recreate(app: AppHandle, state: State<'_, AppState>, id: String, is_private: bool) -> AppResult<Workspace> {
    let mut ws = get(&state, &id)?;
    let name = ws.push_repo.as_deref().and_then(|s| s.split('/').nth(1)).ok_or_else(|| AppError::new("workspace.no_push_target"))?.to_string();
    let c = state.active_client()?;
    let created = repos::create(&c, &name, is_private, None).await?;
    ws.push_repo = Some(created.full_name);
    let ws = state.workspaces.lock().unwrap().upsert(ws)?;
    let tok = token(&state);
    let ws2 = ws.clone();
    blocking(move || {
        apply_remotes(&ws2)?;
        git::push(&git::open(&ws2.path)?, "origin", tok.as_deref())
    })
    .await?;
    state.watchers.restart(&app, &ws);
    Ok(ws)
}


#[tauri::command]
#[specta::specta]
pub fn ws_open_terminal(state: State<'_, AppState>, id: String) -> AppResult<String> {
    let ws = get(&state, &id)?;
    crate::platform::open_terminal(std::path::Path::new(&ws.path)).map_err(|e| AppError::new("workspace.no_terminal").detail(e.to_string()))
}


#[tauri::command]
#[specta::specta]
pub fn ws_open_editor(state: State<'_, AppState>, id: String) -> AppResult<String> {
    let ws = get(&state, &id)?;
    crate::platform::open_editor(std::path::Path::new(&ws.path)).map_err(|e| AppError::new("workspace.no_editor").detail(e.to_string()))
}


#[tauri::command]
#[specta::specta]
pub async fn ws_diff(state: State<'_, AppState>, id: String, path: String) -> AppResult<WorkDiff> {
    let ws = get(&state, &id)?;
    blocking(move || tools::file_diff(&git::open(&ws.path)?, &path)).await
}


#[tauri::command]
#[specta::specta]
pub async fn ws_undo_last(state: State<'_, AppState>, id: String) -> AppResult<CommitInfo> {
    let ws = get(&state, &id)?;
    blocking(move || tools::undo_last(&git::open(&ws.path)?)).await
}

#[tauri::command]
#[specta::specta]
pub async fn ws_park(state: State<'_, AppState>, id: String, message: String) -> AppResult<()> {
    let ws = get(&state, &id)?;
    let (name, email) = state.git_identity();
    blocking(move || {
        let mut repo = git::open(&ws.path)?;
        let sig = git::signature(&repo, &name, &email)?;
        tools::park(&mut repo, &message, &sig)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn ws_parked(state: State<'_, AppState>, id: String) -> AppResult<Vec<Parked>> {
    let ws = get(&state, &id)?;
    blocking(move || tools::parked(&mut git::open(&ws.path)?)).await
}

#[tauri::command]
#[specta::specta]
pub async fn ws_unpark(state: State<'_, AppState>, id: String, index: u32) -> AppResult<()> {
    let ws = get(&state, &id)?;
    blocking(move || tools::unpark(&mut git::open(&ws.path)?, index)).await
}

#[tauri::command]
#[specta::specta]
pub async fn ws_drop_parked(state: State<'_, AppState>, id: String, index: u32) -> AppResult<()> {
    let ws = get(&state, &id)?;
    blocking(move || tools::drop_parked(&mut git::open(&ws.path)?, index)).await
}


#[tauri::command]
#[specta::specta]
pub async fn ws_conflicts(state: State<'_, AppState>, id: String, source: Source, branch: String) -> AppResult<Vec<ConflictFile>> {
    let ws = get(&state, &id)?;
    blocking(move || tools::conflicts(&git::open(&ws.path)?, remote_for(&ws, source)?, &branch)).await
}


#[tauri::command]
#[specta::specta]
pub async fn ws_resolve(state: State<'_, AppState>, id: String, source: Source, branch: String, picks: Vec<(String, Pick)>) -> AppResult<UpdateKind> {
    let ws = get(&state, &id)?;
    let (name, email) = state.git_identity();
    blocking(move || {
        let repo = git::open(&ws.path)?;
        tools::merge_with_picks(&repo, remote_for(&ws, source)?, &branch, &picks, &git::signature(&repo, &name, &email)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn ws_undo_since(state: State<'_, AppState>, id: String, sha: String) -> AppResult<Vec<CommitInfo>> {
    let ws = get(&state, &id)?;
    blocking(move || tools::undo_since(&git::open(&ws.path)?, &sha)).await
}
