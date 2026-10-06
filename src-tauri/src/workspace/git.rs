use std::cell::RefCell;
use std::collections::{BTreeSet, HashSet};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use git2::build::CheckoutBuilder;
use git2::{
    BranchType, Cred, FetchOptions, PushOptions, RemoteCallbacks, Repository, RepositoryInitOptions, Signature, Status,
    StatusOptions,
};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::{AppError, AppResult};

impl From<git2::Error> for AppError {
    fn from(e: git2::Error) -> Self {
        let code = match e.code() {
            git2::ErrorCode::NotFound => "workspace.not_found",
            git2::ErrorCode::Conflict | git2::ErrorCode::MergeConflict => "workspace.conflicts",
            git2::ErrorCode::Auth => "workspace.auth",
            git2::ErrorCode::NotFastForward => "workspace.push_rejected",
            git2::ErrorCode::Locked => "workspace.locked",
            _ if e.class() == git2::ErrorClass::Net || e.class() == git2::ErrorClass::Ssl || e.class() == git2::ErrorClass::Http => "workspace.network",
            _ => "workspace.git",
        };
        AppError::new(code).detail(e.message().to_string())
    }
}

pub fn open(path: &str) -> AppResult<Repository> {
    Repository::open(path).map_err(|e| AppError::new("workspace.not_repo").detail(e.message().to_string()))
}


pub fn discover(path: &str) -> Option<PathBuf> {
    Repository::discover(path).ok().and_then(|r| r.workdir().map(Path::to_path_buf))
}


pub fn init(path: &str) -> AppResult<Repository> {
    let mut o = RepositoryInitOptions::new();
    o.initial_head("main");
    Ok(Repository::init_opts(path, &o)?)
}


pub fn parse_slug(input: &str) -> Option<String> {
    let s = input.trim().trim_end_matches('/');
    let rest = s
        .strip_prefix("https://github.com/")
        .or_else(|| s.strip_prefix("http://github.com/"))
        .or_else(|| s.strip_prefix("git@github.com:"))
        .or_else(|| s.strip_prefix("ssh://git@github.com/"))
        .or_else(|| s.strip_prefix("github.com/"))
        .unwrap_or(if s.contains("://") || s.contains('@') { "" } else { s });
    let rest = rest.strip_suffix(".git").unwrap_or(rest);
    let mut parts = rest.split('/');
    let (owner, name) = (parts.next()?, parts.next()?);
    let valid = |p: &str| !p.is_empty() && p.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c));
    (parts.next().is_none() && valid(owner) && valid(name)).then(|| format!("{owner}/{name}"))
}

pub fn github_url(slug: &str) -> String {
    format!("https://github.com/{slug}.git")
}


pub fn set_remote(repo: &Repository, name: &str, url: &str) -> AppResult<()> {
    match repo.find_remote(name) {
        Ok(r) if r.url() == Some(url) => Ok(()),
        Ok(_) => Ok(repo.remote_set_url(name, url)?),
        Err(_) => repo.remote(name, url).map(drop).map_err(Into::into),
    }
}

pub fn remove_remote(repo: &Repository, name: &str) -> AppResult<()> {
    if repo.find_remote(name).is_ok() {
        repo.remote_delete(name)?;
    }
    Ok(())
}

pub fn remote_slug(repo: &Repository, name: &str) -> Option<String> {
    repo.find_remote(name).ok().and_then(|r| r.url().and_then(parse_slug))
}

fn callbacks(token: Option<&str>) -> RemoteCallbacks<'_> {
    let mut cb = RemoteCallbacks::new();
    if let Some(t) = token {
        cb.credentials(move |_url, _user, _allowed| Cred::userpass_plaintext("x-access-token", t));
    }
    cb
}


pub fn clone(url: &str, dest: &Path, token: Option<&str>) -> AppResult<Repository> {
    if dest.exists() && fs::read_dir(dest)?.next().is_some() {
        return Err(AppError::new("workspace.clone_target_not_empty").detail(dest.to_string_lossy().into_owned()));
    }
    let mut fo = FetchOptions::new();
    fo.remote_callbacks(callbacks(token));
    let res = git2::build::RepoBuilder::new().fetch_options(fo).clone(url, dest);
    match res {
        Ok(r) => Ok(r),
        Err(e) => {

            let _ = fs::remove_dir_all(dest);
            Err(e.into())
        }
    }
}

pub fn fetch(repo: &Repository, remote: &str, token: Option<&str>) -> AppResult<()> {
    let mut r = repo.find_remote(remote)?;
    let mut fo = FetchOptions::new();
    fo.remote_callbacks(callbacks(token));
    r.fetch(&[] as &[&str], Some(&mut fo), None)?;
    Ok(())
}


pub fn push(repo: &Repository, remote: &str, token: Option<&str>) -> AppResult<()> {
    let branch = current_branch(repo)?.ok_or_else(|| AppError::new("workspace.detached"))?;
    if head_commit(repo).is_none() {
        return Err(AppError::new("workspace.nothing_to_upload"));
    }
    let rejected: RefCell<Option<String>> = RefCell::new(None);
    {
        let mut cb = callbacks(token);
        cb.push_update_reference(|_refname, status| {
            if let Some(s) = status {
                *rejected.borrow_mut() = Some(s.to_string());
            }
            Ok(())
        });
        let mut po = PushOptions::new();
        po.remote_callbacks(cb);
        let mut r = repo.find_remote(remote)?;
        r.push(&[format!("refs/heads/{branch}:refs/heads/{branch}")], Some(&mut po))?;
    }
    if let Some(why) = rejected.into_inner() {
        return Err(AppError::new("workspace.push_rejected").detail(why));
    }

    if let Ok(mut b) = repo.find_branch(&branch, BranchType::Local) {
        let _ = b.set_upstream(Some(&format!("{remote}/{branch}")));
    }
    Ok(())
}


#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ChangeKind {
    New,
    Modified,
    Deleted,
    Renamed,
    Conflicted,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
pub struct FileChange {
    pub path: String,
    pub kind: ChangeKind,

    pub old_path: Option<String>,

    pub size: u64,
}

fn kind_of(s: Status) -> Option<ChangeKind> {
    Some(if s.is_conflicted() {
        ChangeKind::Conflicted
    } else if s.intersects(Status::WT_RENAMED | Status::INDEX_RENAMED) {
        ChangeKind::Renamed
    } else if s.intersects(Status::WT_DELETED | Status::INDEX_DELETED) {
        ChangeKind::Deleted
    } else if s.intersects(Status::WT_NEW | Status::INDEX_NEW) {
        ChangeKind::New
    } else if s.intersects(Status::WT_MODIFIED | Status::INDEX_MODIFIED | Status::WT_TYPECHANGE | Status::INDEX_TYPECHANGE) {
        ChangeKind::Modified
    } else {
        return None;
    })
}


pub fn changes(repo: &Repository) -> AppResult<Vec<FileChange>> {
    let mut o = StatusOptions::new();
    o.include_untracked(true).recurse_untracked_dirs(true).include_ignored(false).renames_head_to_index(true).renames_index_to_workdir(true);
    let root = repo.workdir().map(Path::to_path_buf).unwrap_or_default();
    let mut out = Vec::new();
    for e in repo.statuses(Some(&mut o))?.iter() {
        let Some(kind) = kind_of(e.status()) else { continue };
        let Some(path) = e.path().map(str::to_string) else { continue };
        let old_path = e
            .head_to_index()
            .or_else(|| e.index_to_workdir())
            .and_then(|d| d.old_file().path().map(|p| p.to_string_lossy().into_owned()))
            .filter(|p| kind == ChangeKind::Renamed && *p != path);
        let size = fs::metadata(root.join(&path)).map(|m| m.len()).unwrap_or(0);
        out.push(FileChange { path, kind, old_path, size });
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}


pub fn fingerprint(repo: &Repository) -> AppResult<(u64, usize, Option<std::time::SystemTime>)> {
    let list = changes(repo)?;
    let root = repo.workdir().map(Path::to_path_buf).unwrap_or_default();
    let mut h = std::collections::hash_map::DefaultHasher::new();
    let mut latest = None;
    for c in &list {
        c.path.hash(&mut h);
        c.kind.hash(&mut h);
        if let Ok(m) = fs::metadata(root.join(&c.path)).and_then(|m| m.modified()) {
            m.hash(&mut h);
            latest = Some(latest.map_or(m, |l: std::time::SystemTime| l.max(m)));
        }
    }
    Ok((h.finish(), list.len(), latest))
}

pub fn current_branch(repo: &Repository) -> AppResult<Option<String>> {
    match repo.head() {
        Ok(h) if h.is_branch() => Ok(h.shorthand().map(str::to_string)),
        Ok(_) => Ok(None),

        Err(e) if e.code() == git2::ErrorCode::UnbornBranch => {
            let head = repo.find_reference("HEAD")?;
            Ok(head.symbolic_target().and_then(|t| t.strip_prefix("refs/heads/")).map(str::to_string))
        }
        Err(e) => Err(e.into()),
    }
}

pub(crate) fn head_commit(repo: &Repository) -> Option<git2::Commit<'_>> {
    repo.head().ok().and_then(|h| h.peel_to_commit().ok())
}


pub fn ahead_behind(repo: &Repository, remote: &str, branch: &str) -> AppResult<Option<(usize, usize)>> {
    let Ok(theirs) = repo.find_reference(&format!("refs/remotes/{remote}/{branch}")) else { return Ok(None) };
    let Some(their) = theirs.target() else { return Ok(None) };
    match head_commit(repo) {
        Some(ours) => Ok(Some(repo.graph_ahead_behind(ours.id(), their)?)),

        None => {
            let mut walk = repo.revwalk()?;
            walk.push(their)?;
            Ok(Some((0, walk.count())))
        }
    }
}


pub fn signature<'a>(repo: &Repository, fallback_name: &str, fallback_email: &str) -> AppResult<Signature<'a>> {
    match repo.signature() {
        Ok(s) => Ok(Signature::now(s.name().unwrap_or(fallback_name), s.email().unwrap_or(fallback_email))?),
        Err(_) => Ok(Signature::now(fallback_name, fallback_email)?),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CommitInfo {
    pub sha: String,
    pub short: String,
    pub summary: String,
    pub message: String,
    pub author: String,
    pub time: String,

    pub pushed: bool,
}

pub(crate) fn info(c: &git2::Commit, pushed: bool) -> CommitInfo {
    let sha = c.id().to_string();
    let time = chrono::DateTime::from_timestamp(c.time().seconds(), 0).map(|t| t.to_rfc3339()).unwrap_or_default();
    CommitInfo {
        short: sha[..7].to_string(),
        sha,
        summary: c.summary().unwrap_or_default().to_string(),
        message: c.message().unwrap_or_default().to_string(),
        author: c.author().name().unwrap_or("?").to_string(),
        time,
        pushed,
    }
}


pub fn commit(repo: &Repository, paths: Option<&[String]>, message: &str, sig: &Signature) -> AppResult<CommitInfo> {
    let message = message.trim();
    if message.is_empty() {
        return Err(AppError::new("workspace.empty_message"));
    }
    let all = changes(repo)?;
    let selected: Vec<&FileChange> = match paths {
        Some(p) => all.iter().filter(|c| p.contains(&c.path)).collect(),
        None => all.iter().collect(),
    };
    if selected.is_empty() {
        return Err(AppError::new("workspace.nothing_to_commit"));
    }
    if selected.iter().any(|c| c.kind == ChangeKind::Conflicted) {
        return Err(AppError::new("workspace.conflicts"));
    }
    let head = head_commit(repo);
    let root = repo.workdir().map(Path::to_path_buf).ok_or_else(|| AppError::new("workspace.bare"))?;
    let mut index = repo.index()?;

    let chosen: HashSet<&str> = selected.iter().map(|c| c.path.as_str()).collect();
    for c in all.iter().filter(|c| !chosen.contains(c.path.as_str())) {
        match &head {
            Some(h) => repo.reset_default(Some(h.as_object()), [c.path.as_str()])?,
            None => {
                let _ = index.remove_path(Path::new(&c.path));
            }
        }
    }
    index = repo.index()?;
    for c in &selected {
        if let Some(old) = &c.old_path {
            let _ = index.remove_path(Path::new(old));
        }
        if root.join(&c.path).exists() {
            index.add_path(Path::new(&c.path))?;
        } else {
            index.remove_path(Path::new(&c.path))?;
        }
    }
    index.write()?;
    let tree = repo.find_tree(index.write_tree()?)?;
    if head.as_ref().is_some_and(|h| h.tree_id() == tree.id()) {
        return Err(AppError::new("workspace.nothing_to_commit"));
    }
    let parents: Vec<&git2::Commit> = head.iter().collect();
    let id = repo.commit(Some("HEAD"), sig, sig, message, &tree, &parents)?;
    Ok(info(&repo.find_commit(id)?, false))
}


pub fn suggest_message(changes: &[FileChange]) -> String {
    let name = |c: &FileChange| Path::new(&c.path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let count = |k: ChangeKind| changes.iter().filter(|c| c.kind == k).count();
    let verb = match (count(ChangeKind::New), count(ChangeKind::Deleted), changes.len()) {
        (n, 0, t) if n == t => "Add",
        (0, d, t) if d == t => "Remove",
        _ => "Update",
    };
    match changes.len() {
        0 => String::new(),
        1 => format!("{verb} {}", name(&changes[0])),
        2 => format!("{verb} {} and {}", name(&changes[0]), name(&changes[1])),
        n => format!("{verb} {} files: {}, {} and {} more", n, name(&changes[0]), name(&changes[1]), n - 2),
    }
}


pub fn history(repo: &Repository, limit: usize, push_remote: Option<&str>) -> AppResult<Vec<CommitInfo>> {
    let Some(head) = head_commit(repo) else { return Ok(vec![]) };


    let unpushed: Option<HashSet<git2::Oid>> = match push_remote {
        Some(r) => {
            let mut walk = repo.revwalk()?;
            walk.push(head.id())?;
            for rf in repo.references_glob(&format!("refs/remotes/{r}/*"))?.flatten() {
                if let Some(t) = rf.target() {
                    walk.hide(t)?;
                }
            }
            Some(walk.collect::<Result<_, _>>()?)
        }
        None => None,
    };
    let mut walk = repo.revwalk()?;
    walk.push(head.id())?;
    walk.set_sorting(git2::Sort::TIME)?;
    let mut out = Vec::new();
    for id in walk.take(limit) {
        let id = id?;
        let pushed = unpushed.as_ref().is_some_and(|u| !u.contains(&id));
        out.push(info(&repo.find_commit(id)?, pushed));
    }
    Ok(out)
}


pub fn incoming(repo: &Repository, remote: &str, branch: &str, limit: usize) -> AppResult<Vec<CommitInfo>> {
    let Ok(r) = repo.find_reference(&format!("refs/remotes/{remote}/{branch}")) else { return Ok(vec![]) };
    let Some(tip) = r.target() else { return Ok(vec![]) };
    let mut walk = repo.revwalk()?;
    walk.push(tip)?;
    if let Some(h) = head_commit(repo) {
        walk.hide(h.id())?;
    }
    walk.set_sorting(git2::Sort::TIME)?;
    walk.take(limit).map(|id| Ok(info(&repo.find_commit(id?)?, true))).collect()
}


pub fn outgoing(repo: &Repository, remote: &str, branch: &str, limit: usize) -> AppResult<Vec<CommitInfo>> {
    let Some(h) = head_commit(repo) else { return Ok(vec![]) };
    let mut walk = repo.revwalk()?;
    walk.push(h.id())?;
    if let Some(t) = repo.find_reference(&format!("refs/remotes/{remote}/{branch}")).ok().and_then(|r| r.target()) {
        walk.hide(t)?;
    }
    walk.set_sorting(git2::Sort::TIME)?;
    walk.take(limit).map(|id| Ok(info(&repo.find_commit(id?)?, false))).collect()
}


#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UpdateKind {
    UpToDate,
    FastForward,
    Merged,
}


fn unsaved_in_the_way(repo: &Repository, target: &git2::Tree) -> AppResult<(Vec<String>, Vec<String>)> {
    let root = repo.workdir().map(Path::to_path_buf).ok_or_else(|| AppError::new("workspace.bare"))?;
    let (mut same, mut different) = (vec![], vec![]);
    for c in changes(repo)?.into_iter().filter(|c| c.kind == ChangeKind::New) {
        let Ok(entry) = target.get_path(Path::new(&c.path)) else { continue };
        let on_disk = git2::Oid::hash_file(git2::ObjectType::Blob, root.join(&c.path)).ok();
        if on_disk == Some(entry.id()) {
            same.push(c.path);
        } else {
            different.push(c.path);
        }
    }
    Ok((same, different))
}

fn clear_identical(repo: &Repository, paths: &[String]) -> AppResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let root = repo.workdir().map(Path::to_path_buf).ok_or_else(|| AppError::new("workspace.bare"))?;
    let mut index = repo.index()?;
    for p in paths {
        let _ = index.remove_path(Path::new(p));
        let _ = fs::remove_file(root.join(p));
    }
    index.write()?;
    Ok(())
}

fn adopt_remote(repo: &Repository, theirs: &git2::Commit, local: &str) -> AppResult<UpdateKind> {
    let root = repo.workdir().map(Path::to_path_buf).ok_or_else(|| AppError::new("workspace.bare"))?;
    let tree = theirs.tree()?;
    let mut missing: Vec<(PathBuf, git2::Oid, i32)> = vec![];
    tree.walk(git2::TreeWalkMode::PreOrder, |dir, e| {
        if e.kind() == Some(git2::ObjectType::Blob) {
            let rel = PathBuf::from(format!("{dir}{}", e.name().unwrap_or("")));
            if !root.join(&rel).exists() {
                missing.push((rel, e.id(), e.filemode()));
            }
        }
        git2::TreeWalkResult::Ok
    })?;
    for (rel, id, mode) in missing {
        if mode == 0o120000 {
            continue;
        }
        let full = root.join(&rel);
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent).map_err(|e| AppError::new("workspace.io").detail(e.to_string()))?;
        }
        fs::write(&full, repo.find_blob(id)?.content()).map_err(|e| AppError::new("workspace.io").detail(e.to_string()))?;
        #[cfg(unix)]
        if mode == 0o100755 {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&full, fs::Permissions::from_mode(0o755));
        }
    }
    let mut index = repo.index()?;
    index.read_tree(&tree)?;
    index.write()?;
    let refname = format!("refs/heads/{local}");
    repo.reference(&refname, theirs.id(), true, "ZIT-Suite: get latest (start from GitHub)")?;
    repo.set_head(&refname)?;
    Ok(UpdateKind::FastForward)
}

pub fn get_latest(repo: &Repository, remote: &str, branch: &str, sig: &Signature) -> AppResult<UpdateKind> {
    if changes(repo)?.iter().any(|c| c.kind != ChangeKind::New) {
        return Err(AppError::new("workspace.uncommitted"));
    }
    let theirs_ref = repo
        .find_reference(&format!("refs/remotes/{remote}/{branch}"))
        .map_err(|_| AppError::new("workspace.no_remote_branch").detail(format!("{remote}/{branch}")))?;
    let theirs = repo.reference_to_annotated_commit(&theirs_ref)?;
    let (analysis, _) = repo.merge_analysis(&[&theirs])?;
    let mut checkout = CheckoutBuilder::new();
    checkout.safe();

    if analysis.is_up_to_date() {
        return Ok(UpdateKind::UpToDate);
    }
    if analysis.is_unborn() || head_commit(repo).is_none() {
        let local = current_branch(repo)?.ok_or_else(|| AppError::new("workspace.detached"))?;
        return adopt_remote(repo, &repo.find_commit(theirs.id())?, &local);
    }
    if analysis.is_fast_forward() {
        let target = theirs.id();
        let local = current_branch(repo)?.ok_or_else(|| AppError::new("workspace.detached"))?;
        let refname = format!("refs/heads/{local}");
        let (same, different) = unsaved_in_the_way(repo, &repo.find_commit(target)?.tree()?)?;
        if !different.is_empty() {
            return Err(AppError::new("workspace.unsaved_in_the_way").detail(different.join(", ")));
        }
        clear_identical(repo, &same)?;

        repo.checkout_tree(&repo.find_object(target, None)?, Some(&mut checkout))?;
        match repo.find_reference(&refname) {
            Ok(mut r) => {
                r.set_target(target, "ZIT-Suite: get latest (fast-forward)")?;
            }
            Err(_) => {
                repo.reference(&refname, target, true, "ZIT-Suite: get latest")?;
            }
        }
        repo.set_head(&refname)?;
        return Ok(UpdateKind::FastForward);
    }
    let ours = head_commit(repo).ok_or_else(|| AppError::new("workspace.git"))?;
    let their_commit = repo.find_commit(theirs.id())?;
    let mut idx = repo.merge_commits(&ours, &their_commit, None)?;
    if idx.has_conflicts() {
        let mut files = BTreeSet::new();
        for c in idx.conflicts()? {
            let c = c?;
            if let Some(e) = c.our.or(c.their).or(c.ancestor) {
                files.insert(String::from_utf8_lossy(&e.path).into_owned());
            }
        }
        return Err(AppError::new("workspace.conflicts").detail(files.into_iter().collect::<Vec<_>>().join(", ")));
    }
    let tree = repo.find_tree(idx.write_tree_to(repo)?)?;
    let (same, different) = unsaved_in_the_way(repo, &tree)?;
    if !different.is_empty() {
        return Err(AppError::new("workspace.unsaved_in_the_way").detail(different.join(", ")));
    }
    clear_identical(repo, &same)?;

    let msg = match remote_slug(repo, remote) {
        Some(slug) if branch == "main" || branch == "master" => format!("Get latest from {slug}"),
        Some(slug) => format!("Get latest from {slug} ({branch})"),
        None => format!("Get latest from {remote}/{branch}"),
    };

    let id = repo.commit(None, sig, sig, &msg, &tree, &[&ours, &their_commit])?;
    repo.checkout_tree(tree.as_object(), Some(&mut checkout))?;
    repo.head()?.set_target(id, "ZIT-Suite: get latest (merge)")?;
    Ok(UpdateKind::Merged)
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BranchInfo {
    pub name: String,
    pub current: bool,

    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub last_commit: Option<String>,
}

pub fn branches(repo: &Repository) -> AppResult<Vec<BranchInfo>> {
    let mut out = Vec::new();
    for b in repo.branches(Some(BranchType::Local))? {
        let (b, _) = b?;
        let name = b.name()?.unwrap_or_default().to_string();
        let upstream = b.upstream().ok();
        let (ahead, behind) = match (b.get().target(), upstream.as_ref().and_then(|u| u.get().target())) {
            (Some(l), Some(u)) => repo.graph_ahead_behind(l, u).unwrap_or((0, 0)),
            _ => (0, 0),
        };
        let last_commit = b.get().peel_to_commit().ok().map(|c| chrono::DateTime::from_timestamp(c.time().seconds(), 0).map(|t| t.to_rfc3339()).unwrap_or_default());
        out.push(BranchInfo {
            current: b.is_head(),
            upstream: upstream.and_then(|u| u.name().ok().flatten().map(str::to_string)),
            ahead: ahead as u32,
            behind: behind as u32,
            last_commit,
            name,
        });
    }
    out.sort_by(|a, b| b.current.cmp(&a.current).then(a.name.cmp(&b.name)));
    Ok(out)
}

pub fn valid_branch_name(name: &str) -> bool {
    git2::Branch::name_is_valid(name).unwrap_or(false)
}


pub fn switch_branch(repo: &Repository, name: &str) -> AppResult<()> {
    let refname = format!("refs/heads/{name}");
    let obj = repo.revparse_single(&refname).map_err(|_| AppError::new("workspace.no_branch").detail(name.to_string()))?;
    let mut co = CheckoutBuilder::new();
    co.safe();
    repo.checkout_tree(&obj, Some(&mut co)).map_err(|e| AppError::new("workspace.dirty_switch").detail(e.message().to_string()))?;
    repo.set_head(&refname)?;
    Ok(())
}

pub fn create_branch(repo: &Repository, name: &str, switch: bool) -> AppResult<()> {
    let name = name.trim();
    if !valid_branch_name(name) {
        return Err(AppError::new("workspace.bad_branch").detail(name.to_string()));
    }
    match head_commit(repo) {
        Some(h) => {
            repo.branch(name, &h, false)?;
            if switch {
                switch_branch(repo, name)?;
            }
        }

        None => repo.set_head(&format!("refs/heads/{name}"))?,
    }
    Ok(())
}


pub fn discard(repo: &Repository, paths: &[String]) -> AppResult<()> {
    let root = repo.workdir().map(Path::to_path_buf).ok_or_else(|| AppError::new("workspace.bare"))?;
    let all = changes(repo)?;
    let mut restore = Vec::new();
    let mut index = repo.index()?;
    for c in all.iter().filter(|c| paths.contains(&c.path)) {
        let in_head = head_commit(repo).and_then(|h| h.tree().ok()).is_some_and(|t| t.get_path(Path::new(&c.path)).is_ok());
        if in_head {
            restore.push(c.path.clone());
        } else {
            let _ = index.remove_path(Path::new(&c.path));
            let p = root.join(&c.path);
            if p.is_dir() {
                fs::remove_dir_all(&p)?;
            } else if p.exists() {
                fs::remove_file(&p)?;
            }
        }
        if let Some(old) = &c.old_path {
            restore.push(old.clone());
        }
    }
    index.write()?;
    if !restore.is_empty() {
        if let Some(h) = head_commit(repo) {
            repo.reset_default(Some(h.as_object()), restore.iter().map(String::as_str))?;
        }
        let mut co = CheckoutBuilder::new();
        co.force();
        for p in &restore {
            co.path(p);
        }
        repo.checkout_head(Some(&mut co))?;
    }
    Ok(())
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TreeEntry {
    pub name: String,
    pub path: String,
    pub dir: bool,
    pub ignored: bool,

    pub tracked: bool,
    pub size: u64,
}

fn rel(p: &str) -> String {
    p.trim_matches('/').replace('\\', "/")
}


pub fn tree(repo: &Repository, dir: &str) -> AppResult<Vec<TreeEntry>> {
    let root = repo.workdir().map(Path::to_path_buf).ok_or_else(|| AppError::new("workspace.bare"))?;
    let dir = rel(dir);
    let index = repo.index()?;
    let tracked_files: HashSet<String> = index.iter().map(|e| String::from_utf8_lossy(&e.path).into_owned()).collect();
    let mut out = Vec::new();
    for e in fs::read_dir(root.join(&dir))? {
        let e = e?;
        let name = e.file_name().to_string_lossy().into_owned();
        if name == ".git" {
            continue;
        }
        let path = if dir.is_empty() { name.clone() } else { format!("{dir}/{name}") };
        let meta = e.metadata()?;
        let is_dir = meta.is_dir();
        let tracked = if is_dir { tracked_files.iter().any(|t| t.starts_with(&format!("{path}/"))) } else { tracked_files.contains(&path) };
        out.push(TreeEntry {
            ignored: repo.is_path_ignored(&path).unwrap_or(false),
            size: if is_dir { 0 } else { meta.len() },
            dir: is_dir,
            name,
            path,
            tracked,
        });
    }
    out.sort_by(|a, b| b.dir.cmp(&a.dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

pub fn gitignore_path(repo: &Repository) -> AppResult<PathBuf> {
    Ok(repo.workdir().ok_or_else(|| AppError::new("workspace.bare"))?.join(".gitignore"))
}

pub fn read_gitignore(repo: &Repository) -> AppResult<String> {
    Ok(fs::read_to_string(gitignore_path(repo)?).unwrap_or_default())
}

pub fn write_gitignore(repo: &Repository, text: &str) -> AppResult<()> {
    let mut t = text.to_string();
    if !t.is_empty() && !t.ends_with('\n') {
        t.push('\n');
    }
    fs::write(gitignore_path(repo)?, t)?;
    Ok(())
}


pub fn add_ignore_patterns(repo: &Repository, patterns: &[String]) -> AppResult<usize> {
    let text = read_gitignore(repo)?;
    let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
    let mut added = 0;
    for p in patterns {
        let p = p.trim();
        if !p.is_empty() && !lines.iter().any(|l| l.trim() == p) {
            lines.push(p.to_string());
            added += 1;
        }
    }
    write_gitignore(repo, &lines.join("\n"))?;
    Ok(added)
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ShareResult {

    pub ok: bool,


    pub untracked: bool,

    pub blocked_by: Option<String>,
}


pub fn set_shared(path_to_repo: &str, path: &str, dir: bool, shared: bool) -> AppResult<ShareResult> {
    let path = rel(path);
    let rule = format!("/{path}{}", if dir { "/" } else { "" });
    let negation = format!("!{rule}");
    let repo = open(path_to_repo)?;
    let mut lines: Vec<String> = read_gitignore(&repo)?.lines().map(str::to_string).collect();
    lines.retain(|l| l.trim() != rule && l.trim() != negation);
    write_gitignore(&repo, &lines.join("\n"))?;

    let ignored_now = |repo_path: &str| -> AppResult<bool> { Ok(open(repo_path)?.is_path_ignored(&path)?) };
    if shared {
        if ignored_now(path_to_repo)? {

            let mut parent = Path::new(&path).parent();
            while let Some(p) = parent.filter(|p| !p.as_os_str().is_empty()) {
                let ps = p.to_string_lossy().replace('\\', "/");
                if open(path_to_repo)?.is_path_ignored(&ps)? {
                    return Ok(ShareResult { ok: false, untracked: false, blocked_by: Some(ps) });
                }
                parent = p.parent();
            }
            lines.push(negation);
            write_gitignore(&repo, &lines.join("\n"))?;
        }


        if let Some(head) = head_commit(&repo) {
            repo.reset_default(Some(head.as_object()), [path.as_str()])?;
        }
        return Ok(ShareResult { ok: !ignored_now(path_to_repo)?, untracked: false, blocked_by: None });
    }
    if !ignored_now(path_to_repo)? {
        lines.push(rule);
        write_gitignore(&repo, &lines.join("\n"))?;
    }

    let mut index = repo.index()?;
    let prefix = format!("{path}/");
    let tracked: Vec<String> =
        index.iter().map(|e| String::from_utf8_lossy(&e.path).into_owned()).filter(|p| *p == path || (dir && p.starts_with(&prefix))).collect();
    for p in &tracked {
        index.remove_path(Path::new(p))?;
    }
    if !tracked.is_empty() {
        index.write()?;
    }
    Ok(ShareResult { ok: ignored_now(path_to_repo)?, untracked: !tracked.is_empty(), blocked_by: None })
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Suggestion {
    pub pattern: String,

    pub reason: String,
}


pub fn suggestions(repo: &Repository) -> AppResult<Vec<Suggestion>> {
    let root = repo.workdir().map(Path::to_path_buf).ok_or_else(|| AppError::new("workspace.bare"))?;
    suggestions_at(&root, Some(repo))
}


pub fn suggestions_at(root: &Path, repo: Option<&Repository>) -> AppResult<Vec<Suggestion>> {
    let root = root.to_path_buf();
    let exists = |p: &str| root.join(p).exists();
    let any_top = |pred: &dyn Fn(&str) -> bool| {
        fs::read_dir(&root).map(|rd| rd.flatten().any(|e| pred(&e.file_name().to_string_lossy()))).unwrap_or(false)
    };
    let mut out: Vec<(&str, &str)> = Vec::new();
    for (dir, reason) in [
        ("node_modules", "deps"),
        ("bower_components", "deps"),
        ("vendor/bundle", "deps"),
        (".venv", "python"),
        ("venv", "python"),
        ("__pycache__", "python"),
        (".pytest_cache", "python"),
        ("dist", "build"),
        ("build", "build"),
        ("out", "build"),
        (".next", "build"),
        (".nuxt", "build"),
        ("coverage", "build"),
        (".idea", "editor"),
        (".vscode", "editor"),
        (".gradle", "build"),
    ] {
        if exists(dir) {
            out.push((dir, reason));
        }
    }
    if exists("Cargo.toml") && exists("target") {
        out.push(("target", "build"));
    }
    for (file, reason) in [(".DS_Store", "os"), ("Thumbs.db", "os"), ("desktop.ini", "os")] {
        if exists(file) {
            out.push((file, reason));
        }
    }
    if any_top(&|n| n == ".env" || n.starts_with(".env.")) {
        out.push((".env*", "secrets"));
    }
    if any_top(&|n| n.ends_with(".pem") || n.ends_with(".key") || n.ends_with(".p12") || n.starts_with("id_rsa")) {
        out.push(("*.pem", "secrets"));
        out.push(("*.key", "secrets"));
    }
    if any_top(&|n| n.ends_with(".log")) {
        out.push(("*.log", "logs"));
    }
    Ok(out
        .into_iter()
        .map(|(p, r)| {
            let pattern = if root.join(p).is_dir() { format!("{p}/") } else { p.to_string() };
            (pattern, r)
        })
        .filter(|(p, _)| {
            let probe = p.trim_end_matches('/').replace('*', "x");
            !repo.is_some_and(|r| r.is_path_ignored(&probe).unwrap_or(false))
        })
        .map(|(pattern, r)| Suggestion { pattern, reason: r.to_string() })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Tmp(PathBuf);
    impl Tmp {
        fn new(tag: &str) -> Self {
            let p = std::env::temp_dir().join(format!("zit-git-{}-{tag}-{}", std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()));
            fs::create_dir_all(&p).unwrap();
            Tmp(p)
        }
        fn s(&self) -> &str {
            self.0.to_str().unwrap()
        }
        fn write(&self, rel: &str, text: &str) {
            let p = self.0.join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, text).unwrap();
        }
    }
    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn sig() -> Signature<'static> {
        Signature::now("Tester", "t@example.com").unwrap()
    }

    #[test]
    fn get_latest_with_unrelated_histories() {
        let remote = Tmp::new("unrel-remote");
        Repository::init_bare(remote.s()).unwrap();
        let web = Tmp::new("unrel-web");
        let w = init(web.s()).unwrap();
        set_remote(&w, "origin", remote.s()).unwrap();
        web.write("a.txt", "same");
        commit(&w, None, "Add files via upload", &sig()).unwrap();
        push(&w, "origin", None).unwrap();

        let t = Tmp::new("unrel-local");
        let repo = init(t.s()).unwrap();
        set_remote(&repo, "origin", remote.s()).unwrap();
        t.write("a.txt", "same");
        commit(&repo, None, "local version", &sig()).unwrap();
        assert_eq!(push(&repo, "origin", None).unwrap_err().code, "workspace.push_rejected");
        fetch(&repo, "origin", None).unwrap();
        let r = get_latest(&repo, "origin", "main", &sig());
        println!("get_latest unrelated same content: {r:?}");
        assert!(r.is_ok(), "{r:?}");
        push(&repo, "origin", None).unwrap();
    }

    #[test]
    fn get_latest_when_nothing_is_saved_locally() {
        for (case, stage, mine) in [("untracked-same", false, "same"), ("staged-same", true, "same"), ("untracked-diff", false, "mine"), ("staged-diff", true, "mine")] {
            let remote = Tmp::new("adopt-remote");
            Repository::init_bare(remote.s()).unwrap();
            let web = Tmp::new("adopt-web");
            let w = init(web.s()).unwrap();
            set_remote(&w, "origin", remote.s()).unwrap();
            web.write("a.txt", "same");
            web.write("docs/only-on-github.md", "hi");
            commit(&w, None, "Add files via upload", &sig()).unwrap();
            push(&w, "origin", None).unwrap();

            let t = Tmp::new("adopt-local");
            let repo = init(t.s()).unwrap();
            set_remote(&repo, "origin", remote.s()).unwrap();
            t.write("a.txt", mine);
            t.write("local-only.txt", "new here");
            if stage {
                let mut i = repo.index().unwrap();
                i.add_path(Path::new("a.txt")).unwrap();
                i.write().unwrap();
            }
            assert_eq!(push(&repo, "origin", None).unwrap_err().code, "workspace.nothing_to_upload", "{case}");
            fetch(&repo, "origin", None).unwrap();
            assert_eq!(get_latest(&repo, "origin", "main", &sig()).unwrap(), UpdateKind::FastForward, "{case}");
            assert_eq!(fs::read_to_string(t.0.join("a.txt")).unwrap(), mine, "{case}: local file kept");
            assert_eq!(fs::read_to_string(t.0.join("docs/only-on-github.md")).unwrap(), "hi", "{case}");
            let ch: Vec<_> = changes(&repo).unwrap().into_iter().map(|c| (c.path, c.kind)).collect();
            let mut want = vec![("local-only.txt".to_string(), ChangeKind::New)];
            if mine != "same" {
                want.insert(0, ("a.txt".to_string(), ChangeKind::Modified));
            }
            assert_eq!(ch, want, "{case}");
            commit(&repo, None, "my changes", &sig()).unwrap();
            push(&repo, "origin", None).unwrap();
        }
    }

    #[test]
    fn unsaved_files_in_the_way_of_get_latest() {
        let remote = Tmp::new("way-remote");
        Repository::init_bare(remote.s()).unwrap().set_head("refs/heads/main").unwrap();
        let t = Tmp::new("way-local");
        let repo = init(t.s()).unwrap();
        set_remote(&repo, "origin", remote.s()).unwrap();
        t.write("a.txt", "1");
        commit(&repo, None, "base", &sig()).unwrap();
        push(&repo, "origin", None).unwrap();
        let other = Tmp::new("way-other");
        let o = clone(remote.s(), &other.0, None).unwrap();
        other.write("same.txt", "x");
        other.write("diff.txt", "theirs");
        commit(&o, None, "added on GitHub", &sig()).unwrap();
        push(&o, "origin", None).unwrap();

        t.write("same.txt", "x");
        t.write("diff.txt", "mine");
        fetch(&repo, "origin", None).unwrap();
        let e = get_latest(&repo, "origin", "main", &sig()).unwrap_err();
        assert_eq!((e.code.as_str(), e.detail.as_deref()), ("workspace.unsaved_in_the_way", Some("diff.txt")));
        fs::remove_file(t.0.join("diff.txt")).unwrap();
        assert_eq!(get_latest(&repo, "origin", "main", &sig()).unwrap(), UpdateKind::FastForward);
        assert_eq!(fs::read_to_string(t.0.join("diff.txt")).unwrap(), "theirs");
        assert!(changes(&repo).unwrap().is_empty());
    }

    #[test]
    fn slugs() {
        for s in ["https://github.com/o/r", "https://github.com/o/r.git", "git@github.com:o/r.git", "o/r", "github.com/o/r/", "ssh://git@github.com/o/r.git"] {
            assert_eq!(parse_slug(s).as_deref(), Some("o/r"), "{s}");
        }
        assert_eq!(parse_slug("https://gitlab.com/o/r"), None);
        assert_eq!(parse_slug("o/r/x"), None);
        assert_eq!(parse_slug("o r/x"), None);
    }

    #[test]
    fn status_commit_and_selective_commit() {
        let t = Tmp::new("commit");
        let repo = init(t.s()).unwrap();
        assert_eq!(current_branch(&repo).unwrap().as_deref(), Some("main"));
        t.write("a.txt", "a");
        t.write("src/b.rs", "b");
        let ch = changes(&repo).unwrap();
        assert_eq!(ch.iter().map(|c| (c.path.as_str(), c.kind)).collect::<Vec<_>>(), [("a.txt", ChangeKind::New), ("src/b.rs", ChangeKind::New)]);
        assert_eq!(suggest_message(&ch), "Add a.txt and b.rs");

        commit(&repo, Some(&["a.txt".into()]), "first", &sig()).unwrap();
        assert_eq!(changes(&repo).unwrap().iter().map(|c| c.path.as_str()).collect::<Vec<_>>(), ["src/b.rs"]);
        commit(&repo, None, "second", &sig()).unwrap();
        assert!(changes(&repo).unwrap().is_empty());
        assert_eq!(commit(&repo, None, "nothing", &sig()).unwrap_err().code, "workspace.nothing_to_commit");
        t.write("a.txt", "changed");
        fs::remove_file(t.0.join("src/b.rs")).unwrap();
        let kinds: Vec<_> = changes(&repo).unwrap().iter().map(|c| c.kind).collect();
        assert_eq!(kinds, [ChangeKind::Modified, ChangeKind::Deleted]);
        let h = history(&repo, 10, None).unwrap();
        assert_eq!(h.iter().map(|c| c.summary.as_str()).collect::<Vec<_>>(), ["second", "first"]);
    }

    #[test]
    fn discard_restores_and_removes() {
        let t = Tmp::new("discard");
        let repo = init(t.s()).unwrap();
        t.write("keep.txt", "v1");
        commit(&repo, None, "init", &sig()).unwrap();
        t.write("keep.txt", "v2");
        t.write("new.txt", "junk");
        discard(&repo, &["keep.txt".into(), "new.txt".into()]).unwrap();
        assert_eq!(fs::read_to_string(t.0.join("keep.txt")).unwrap(), "v1");
        assert!(!t.0.join("new.txt").exists());
        assert!(changes(&repo).unwrap().is_empty());
    }

    #[test]
    fn sharing_rules_and_untracking() {
        let t = Tmp::new("share");
        let repo = init(t.s()).unwrap();
        t.write("secret.env", "x");
        t.write("logs/a.log", "x");
        t.write("app.js", "x");
        commit(&repo, None, "init", &sig()).unwrap();

        let r = set_shared(t.s(), "secret.env", false, false).unwrap();
        assert!(r.ok && r.untracked);
        assert!(t.0.join("secret.env").exists());
        let repo = open(t.s()).unwrap();
        assert!(changes(&repo).unwrap().iter().any(|c| c.path == "secret.env" && c.kind == ChangeKind::Deleted));

        assert!(set_shared(t.s(), "logs", true, false).unwrap().ok);
        assert!(read_gitignore(&repo).unwrap().lines().any(|l| l == "/logs/"));

        assert!(set_shared(t.s(), "logs", true, true).unwrap().ok);
        assert!(!read_gitignore(&repo).unwrap().contains("/logs/"));

        let ch = changes(&open(t.s()).unwrap()).unwrap();
        assert!(!ch.iter().any(|c| c.path.starts_with("logs")), "{ch:?}");

        write_gitignore(&repo, "*.js").unwrap();
        let r = set_shared(t.s(), "app.js", false, true).unwrap();
        assert!(r.ok);
        assert!(read_gitignore(&repo).unwrap().lines().any(|l| l == "!/app.js"));

        write_gitignore(&repo, "logs/").unwrap();
        let r = set_shared(t.s(), "logs/a.log", false, true).unwrap();
        assert_eq!(r.blocked_by.as_deref(), Some("logs"));
        let entries = tree(&open(t.s()).unwrap(), "").unwrap();
        assert!(entries.iter().find(|e| e.name == "logs").unwrap().ignored);
        assert!(!entries.iter().any(|e| e.name == ".git"));
    }

    #[test]
    fn suggestions_find_junk() {
        let t = Tmp::new("suggest");
        let repo = init(t.s()).unwrap();
        t.write("node_modules/x/index.js", "x");
        t.write(".env", "TOKEN=1");
        t.write("Cargo.toml", "[package]");
        t.write("target/debug/x", "x");
        let s: Vec<String> = suggestions(&repo).unwrap().into_iter().map(|s| s.pattern).collect();
        assert!(s.contains(&"node_modules/".into()) && s.contains(&".env*".into()) && s.contains(&"target/".into()));
        add_ignore_patterns(&repo, &s).unwrap();
        assert!(suggestions(&open(t.s()).unwrap()).unwrap().is_empty());
    }

    #[test]
    fn branches_switch_safely() {
        let t = Tmp::new("branch");
        let repo = init(t.s()).unwrap();
        t.write("f.txt", "main");
        commit(&repo, None, "init", &sig()).unwrap();
        create_branch(&repo, "feature/x", true).unwrap();
        assert_eq!(current_branch(&repo).unwrap().as_deref(), Some("feature/x"));
        t.write("f.txt", "feature");
        commit(&repo, None, "on feature", &sig()).unwrap();
        switch_branch(&repo, "main").unwrap();
        assert_eq!(fs::read_to_string(t.0.join("f.txt")).unwrap(), "main");

        t.write("f.txt", "local edit");
        assert_eq!(switch_branch(&repo, "feature/x").unwrap_err().code, "workspace.dirty_switch");
        assert_eq!(fs::read_to_string(t.0.join("f.txt")).unwrap(), "local edit");
        assert_eq!(create_branch(&repo, "bad name..", false).unwrap_err().code, "workspace.bad_branch");
        let b = branches(&repo).unwrap();
        assert_eq!(b[0].name, "main");
        assert!(b[0].current);
    }

    #[test]
    fn clone_into_empty_folder_only() {
        let bare = Tmp::new("clone-src");

        Repository::init_bare(bare.s()).unwrap().set_head("refs/heads/main").unwrap();
        let a = Tmp::new("clone-a");
        let ra = init(a.s()).unwrap();
        set_remote(&ra, "origin", bare.s()).unwrap();
        a.write("hello.txt", "hi\n");
        commit(&ra, None, "first", &sig()).unwrap();
        push(&ra, "origin", None).unwrap();

        let dest = Tmp::new("clone-dest");
        let target = dest.0.join("copy");
        let rc = clone(bare.s(), &target, None).unwrap();
        assert_eq!(fs::read_to_string(target.join("hello.txt")).unwrap(), "hi\n");
        assert_eq!(current_branch(&rc).unwrap().as_deref(), Some("main"));

        dest.write("busy/x.txt", "x");
        match clone(bare.s(), &dest.0.join("busy"), None) {
            Err(e) => assert_eq!(e.code, "workspace.clone_target_not_empty"),
            Ok(_) => panic!("cloned into a folder with files"),
        }
        assert!(dest.0.join("busy/x.txt").exists());
    }


    #[test]
    fn push_fetch_get_latest_and_conflicts() {
        let bare = Tmp::new("bare");
        Repository::init_bare(bare.s()).unwrap();
        let url = bare.s().to_string();

        let a = Tmp::new("a");
        let ra = init(a.s()).unwrap();
        set_remote(&ra, "origin", &url).unwrap();
        a.write("shared.txt", "line1\n");
        commit(&ra, None, "base", &sig()).unwrap();
        push(&ra, "origin", None).unwrap();
        assert_eq!(ahead_behind(&ra, "origin", "main").unwrap(), Some((0, 0)));
        assert!(history(&ra, 5, Some("origin")).unwrap()[0].pushed);


        let b = Tmp::new("b");
        let rb = init(b.s()).unwrap();
        set_remote(&rb, "origin", &url).unwrap();
        fetch(&rb, "origin", None).unwrap();
        assert_eq!(get_latest(&rb, "origin", "main", &sig()).unwrap(), UpdateKind::FastForward);
        assert_eq!(fs::read_to_string(b.0.join("shared.txt")).unwrap(), "line1\n");
        b.write("other.txt", "from b");
        commit(&rb, None, "b adds other", &sig()).unwrap();
        push(&rb, "origin", None).unwrap();


        fetch(&ra, "origin", None).unwrap();
        assert_eq!(ahead_behind(&ra, "origin", "main").unwrap(), Some((0, 1)));
        assert_eq!(incoming(&ra, "origin", "main", 10).unwrap()[0].summary, "b adds other");
        assert_eq!(get_latest(&ra, "origin", "main", &sig()).unwrap(), UpdateKind::FastForward);
        assert_eq!(get_latest(&ra, "origin", "main", &sig()).unwrap(), UpdateKind::UpToDate);


        a.write("a-only.txt", "a");
        commit(&ra, None, "a work", &sig()).unwrap();
        fetch(&rb, "origin", None).unwrap();
        get_latest(&rb, "origin", "main", &sig()).unwrap();
        b.write("b-only.txt", "b");
        commit(&rb, None, "b work", &sig()).unwrap();
        push(&rb, "origin", None).unwrap();

        assert!(matches!(push(&ra, "origin", None).unwrap_err().code.as_str(), "workspace.push_rejected" | "workspace.git"));
        fetch(&ra, "origin", None).unwrap();
        assert_eq!(outgoing(&ra, "origin", "main", 10).unwrap().len(), 1);
        assert_eq!(get_latest(&ra, "origin", "main", &sig()).unwrap(), UpdateKind::Merged);
        assert!(a.0.join("b-only.txt").exists());

        assert_eq!(head_commit(&ra).unwrap().summary(), Some("Get latest from origin/main"));
        push(&ra, "origin", None).unwrap();

        create_branch(&ra, "side", true).unwrap();
        assert!(history(&ra, 5, Some("origin")).unwrap().iter().all(|c| c.pushed));
        a.write("side.txt", "s");
        commit(&ra, None, "side work", &sig()).unwrap();
        let h = history(&ra, 5, Some("origin")).unwrap();
        assert!(!h[0].pushed && h[1].pushed);
        switch_branch(&ra, "main").unwrap();


        fetch(&rb, "origin", None).unwrap();
        get_latest(&rb, "origin", "main", &sig()).unwrap();
        b.write("shared.txt", "from b\n");
        commit(&rb, None, "b edits shared", &sig()).unwrap();
        push(&rb, "origin", None).unwrap();
        a.write("shared.txt", "from a\n");
        commit(&ra, None, "a edits shared", &sig()).unwrap();
        fetch(&ra, "origin", None).unwrap();
        let e = get_latest(&ra, "origin", "main", &sig()).unwrap_err();
        assert_eq!(e.code, "workspace.conflicts");
        assert_eq!(e.detail.as_deref(), Some("shared.txt"));
        assert_eq!(fs::read_to_string(a.0.join("shared.txt")).unwrap(), "from a\n");
        assert!(changes(&ra).unwrap().is_empty());


        a.write("shared.txt", "dirty\n");
        assert_eq!(get_latest(&ra, "origin", "main", &sig()).unwrap_err().code, "workspace.uncommitted");
    }
}
