use std::collections::BTreeMap;
use std::path::Path;

use git2::build::CheckoutBuilder;
use git2::{DiffFormat, DiffOptions, Repository, ResetType, Signature, StashFlags};
use serde::{Deserialize, Serialize};
use specta::Type;

use super::git::{self, ChangeKind, CommitInfo, UpdateKind};
use crate::error::{AppError, AppResult};


#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LineKind {
    Hunk,
    Context,
    Add,
    Remove,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PatchLine {
    pub kind: LineKind,
    pub old: Option<u32>,
    pub new: Option<u32>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorkDiff {
    pub path: String,
    pub binary: bool,
    pub additions: u32,
    pub deletions: u32,
    pub lines: Vec<PatchLine>,

    pub truncated: bool,
}

const MAX_LINES: usize = 5000;

pub fn file_diff(repo: &Repository, path: &str) -> AppResult<WorkDiff> {
    let head_tree = git::head_commit(repo).map(|c| c.tree()).transpose()?;
    let mut o = DiffOptions::new();
    o.pathspec(path).disable_pathspec_match(true).include_untracked(true).recurse_untracked_dirs(true).show_untracked_content(true).context_lines(3);
    let diff = repo.diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut o))?;
    let mut out = WorkDiff { path: path.to_string(), binary: false, additions: 0, deletions: 0, lines: vec![], truncated: false };
    diff.print(DiffFormat::Patch, |delta, _hunk, l| {
        if delta.flags().is_binary() {
            out.binary = true;
            return true;
        }
        let kind = match l.origin() {
            '+' => LineKind::Add,
            '-' => LineKind::Remove,
            ' ' => LineKind::Context,
            'H' => LineKind::Hunk,
            _ => return true,
        };
        match kind {
            LineKind::Add => out.additions += 1,
            LineKind::Remove => out.deletions += 1,
            _ => {}
        }
        if out.lines.len() >= MAX_LINES {
            out.truncated = true;
            return true;
        }
        let text = String::from_utf8_lossy(l.content()).trim_end_matches(['\n', '\r']).to_string();
        out.lines.push(PatchLine { kind, old: l.old_lineno(), new: l.new_lineno(), text });
        true
    })?;
    Ok(out)
}


fn on_any_remote(repo: &Repository, id: git2::Oid) -> AppResult<bool> {
    for r in repo.references_glob("refs/remotes/*")?.flatten() {
        if let Some(t) = r.target() {
            if t == id || repo.graph_descendant_of(t, id).unwrap_or(false) {
                return Ok(true);
            }
        }
    }
    Ok(false)
}


pub fn undo_since(repo: &Repository, sha: &str) -> AppResult<Vec<CommitInfo>> {
    let branch = git::current_branch(repo)?.ok_or_else(|| AppError::new("workspace.detached"))?;
    let target = git2::Oid::from_str(sha).map_err(|_| AppError::new("workspace.not_in_history"))?;
    let mut cur = git::head_commit(repo).ok_or_else(|| AppError::new("workspace.nothing_to_undo"))?;
    let mut undone = vec![];
    loop {
        if cur.parent_count() > 1 {
            return Err(AppError::new("workspace.undo_merge"));
        }
        if on_any_remote(repo, cur.id())? {
            return Err(AppError::new("workspace.undo_uploaded"));
        }
        undone.push(git::info(&cur, false));
        if cur.id() == target {
            break;
        }
        cur = cur.parent(0).map_err(|_| AppError::new("workspace.not_in_history"))?;
    }
    match cur.parent(0) {
        Ok(parent) => repo.reset(parent.as_object(), ResetType::Soft, None)?,
        Err(_) => repo.find_reference(&format!("refs/heads/{branch}"))?.delete()?,
    }
    Ok(undone)
}

pub fn undo_last(repo: &Repository) -> AppResult<CommitInfo> {
    let head = git::head_commit(repo).ok_or_else(|| AppError::new("workspace.nothing_to_undo"))?;
    if head.parent_count() == 0 {
        return Err(AppError::new("workspace.undo_first"));
    }
    if head.parent_count() > 1 {
        return Err(AppError::new("workspace.undo_merge"));
    }
    if on_any_remote(repo, head.id())? {
        return Err(AppError::new("workspace.undo_uploaded"));
    }
    let undone = git::info(&head, false);
    repo.reset(head.parent(0)?.as_object(), ResetType::Soft, None)?;
    Ok(undone)
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Parked {
    pub index: u32,
    pub message: String,
    pub branch: Option<String>,
    pub time: String,
}


fn split_stash_message(raw: &str) -> (Option<String>, String) {
    for prefix in ["On ", "WIP on "] {
        if let Some(rest) = raw.strip_prefix(prefix) {
            if let Some((branch, msg)) = rest.split_once(": ") {
                return (Some(branch.to_string()), msg.to_string());
            }
        }
    }
    (None, raw.to_string())
}


pub fn park(repo: &mut Repository, message: &str, sig: &Signature) -> AppResult<()> {
    let msg = message.trim();
    match repo.stash_save2(sig, (!msg.is_empty()).then_some(msg), Some(StashFlags::INCLUDE_UNTRACKED)) {
        Ok(_) => Ok(()),
        Err(e) if e.code() == git2::ErrorCode::NotFound => Err(AppError::new("workspace.nothing_to_park")),
        Err(e) => Err(e.into()),
    }
}

pub fn parked(repo: &mut Repository) -> AppResult<Vec<Parked>> {
    let mut raw = Vec::new();
    repo.stash_foreach(|i, msg, id| {
        raw.push((i, msg.to_string(), *id));
        true
    })?;
    Ok(raw
        .into_iter()
        .map(|(i, msg, id)| {
            let (branch, message) = split_stash_message(&msg);
            let time = repo.find_commit(id).ok().and_then(|c| chrono::DateTime::from_timestamp(c.time().seconds(), 0)).map(|t| t.to_rfc3339()).unwrap_or_default();
            Parked { index: i as u32, message, branch, time }
        })
        .collect())
}


pub fn unpark(repo: &mut Repository, index: u32) -> AppResult<()> {
    repo.stash_pop(index as usize, None).map_err(|e| match e.code() {
        git2::ErrorCode::Conflict | git2::ErrorCode::MergeConflict | git2::ErrorCode::Uncommitted => AppError::new("workspace.unpark_conflict").detail(e.message().to_string()),
        _ => e.into(),
    })
}

pub fn drop_parked(repo: &mut Repository, index: u32) -> AppResult<()> {
    Ok(repo.stash_drop(index as usize)?)
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ConflictFile {
    pub path: String,

    pub mine: bool,
    pub theirs: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Pick {
    Mine,
    Theirs,
}

fn merge_index<'r>(repo: &'r Repository, remote: &str, branch: &str) -> AppResult<(git2::Commit<'r>, git2::Commit<'r>, git2::Index)> {
    let theirs = repo
        .find_reference(&format!("refs/remotes/{remote}/{branch}"))
        .map_err(|_| AppError::new("workspace.no_remote_branch").detail(format!("{remote}/{branch}")))?
        .peel_to_commit()?;
    let ours = git::head_commit(repo).ok_or_else(|| AppError::new("workspace.git"))?;
    let idx = repo.merge_commits(&ours, &theirs, None)?;
    Ok((ours, theirs, idx))
}

fn conflicts_of(idx: &git2::Index) -> AppResult<BTreeMap<String, ConflictFile>> {
    let mut out = BTreeMap::new();
    for c in idx.conflicts()? {
        let c = c?;
        let Some(e) = c.our.as_ref().or(c.their.as_ref()).or(c.ancestor.as_ref()) else { continue };
        let path = String::from_utf8_lossy(&e.path).into_owned();
        out.insert(path.clone(), ConflictFile { path, mine: c.our.is_some(), theirs: c.their.is_some() });
    }
    Ok(out)
}


pub fn conflicts(repo: &Repository, remote: &str, branch: &str) -> AppResult<Vec<ConflictFile>> {
    let (_, _, idx) = merge_index(repo, remote, branch)?;
    Ok(conflicts_of(&idx)?.into_values().collect())
}


pub fn merge_with_picks(repo: &Repository, remote: &str, branch: &str, picks: &[(String, Pick)], sig: &Signature) -> AppResult<UpdateKind> {
    if git::changes(repo)?.iter().any(|c| c.kind != ChangeKind::New) {
        return Err(AppError::new("workspace.uncommitted"));
    }
    let (ours, their_commit, mut idx) = merge_index(repo, remote, branch)?;
    let picks: BTreeMap<&str, Pick> = picks.iter().map(|(p, k)| (p.as_str(), *k)).collect();
    let mut chosen = Vec::new();
    for c in idx.conflicts()? {
        let c = c?;
        let Some(any) = c.our.as_ref().or(c.their.as_ref()).or(c.ancestor.as_ref()) else { continue };
        let path = String::from_utf8_lossy(&any.path).into_owned();
        let pick = *picks.get(path.as_str()).ok_or_else(|| AppError::new("workspace.unresolved").detail(path.clone()))?;
        chosen.push((path, if pick == Pick::Mine { c.our } else { c.their }));
    }
    let count = chosen.len();
    for (path, entry) in chosen {
        idx.conflict_remove(Path::new(&path))?;
        if let Some(mut e) = entry {
            e.flags &= !0x3000;
            idx.add(&e)?;
        }
    }
    let tree = repo.find_tree(idx.write_tree_to(repo)?)?;
    let msg = match git::remote_slug(repo, remote) {
        Some(slug) => format!("Get latest from {slug} ({branch}), {count} conflicting file(s) picked"),
        None => format!("Get latest from {remote}/{branch}, {count} conflicting file(s) picked"),
    };
    let id = repo.commit(None, sig, sig, &msg, &tree, &[&ours, &their_commit])?;
    let mut checkout = CheckoutBuilder::new();
    checkout.safe();
    repo.checkout_tree(tree.as_object(), Some(&mut checkout))?;
    repo.head()?.set_target(id, "ZIT-Suite: get latest (conflicts picked)")?;
    Ok(UpdateKind::Merged)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    struct Tmp(PathBuf);
    impl Tmp {
        fn new(tag: &str) -> Self {
            let p = std::env::temp_dir().join(format!("zit-tools-{}-{tag}-{}", std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()));
            fs::create_dir_all(&p).unwrap();
            Tmp(p)
        }
        fn s(&self) -> &str {
            self.0.to_str().unwrap()
        }
        fn write(&self, rel: &str, text: &str) {
            fs::write(self.0.join(rel), text).unwrap();
        }
        fn read(&self, rel: &str) -> String {
            fs::read_to_string(self.0.join(rel)).unwrap()
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
    fn diff_of_one_file() {
        let t = Tmp::new("diff");
        let repo = git::init(t.s()).unwrap();
        t.write("a.txt", "one\ntwo\nthree\n");
        t.write("b.txt", "other\n");
        git::commit(&repo, None, "init", &sig()).unwrap();
        t.write("a.txt", "one\nTWO\nthree\n");
        t.write("b.txt", "changed\n");
        let d = file_diff(&repo, "a.txt").unwrap();
        assert_eq!((d.additions, d.deletions, d.binary), (1, 1, false));
        assert_eq!(d.lines[0].kind, LineKind::Hunk);
        assert!(d.lines.iter().any(|l| l.kind == LineKind::Add && l.text == "TWO" && l.new == Some(2)));
        assert!(!d.lines.iter().any(|l| l.text.contains("changed")));
        t.write("new.txt", "fresh\n");
        assert_eq!(file_diff(&repo, "new.txt").unwrap().additions, 1);
    }

    #[test]
    fn undo_only_local_saves() {
        let t = Tmp::new("undo");
        let repo = git::init(t.s()).unwrap();
        t.write("a.txt", "1");
        git::commit(&repo, None, "first", &sig()).unwrap();
        assert_eq!(undo_last(&repo).unwrap_err().code, "workspace.undo_first");
        t.write("a.txt", "2");
        git::commit(&repo, None, "second", &sig()).unwrap();
        let undone = undo_last(&repo).unwrap();
        assert_eq!(undone.summary, "second");
        assert_eq!(t.read("a.txt"), "2");
        assert_eq!(git::changes(&repo).unwrap().len(), 1);

        git::commit(&repo, None, "again", &sig()).unwrap();
        let head = git::head_commit(&repo).unwrap().id();
        repo.reference("refs/remotes/origin/main", head, true, "test").unwrap();
        assert_eq!(undo_last(&repo).unwrap_err().code, "workspace.undo_uploaded");
    }

    #[test]
    fn undo_several_local_saves() {
        let t = Tmp::new("undo-many");
        let repo = git::init(t.s()).unwrap();
        t.write("a.txt", "1");
        let first = git::commit(&repo, None, "first", &sig()).unwrap();
        t.write("a.txt", "2");
        let second = git::commit(&repo, None, "second", &sig()).unwrap();
        t.write("b.txt", "3");
        git::commit(&repo, None, "third", &sig()).unwrap();
        let undone = undo_since(&repo, &second.sha).unwrap();
        assert_eq!(undone.iter().map(|c| c.summary.as_str()).collect::<Vec<_>>(), ["third", "second"]);
        assert_eq!(git::head_commit(&repo).unwrap().summary(), Some("first"));
        assert_eq!((t.read("a.txt").as_str(), t.read("b.txt").as_str()), ("2", "3"));
        assert_eq!(git::changes(&repo).unwrap().len(), 2);

        let undone = undo_since(&repo, &first.sha).unwrap();
        assert_eq!(undone.len(), 1);
        assert!(git::head_commit(&repo).is_none());
        assert_eq!(git::current_branch(&repo).unwrap().as_deref(), Some("main"));
        assert_eq!(git::changes(&repo).unwrap().len(), 2);
        git::commit(&repo, None, "one clean version", &sig()).unwrap();
        let h = git::history(&repo, 10, None).unwrap();
        assert_eq!(h.iter().map(|c| c.summary.as_str()).collect::<Vec<_>>(), ["one clean version"]);

        let head = git::head_commit(&repo).unwrap().id();
        repo.reference("refs/remotes/origin/main", head, true, "test").unwrap();
        assert_eq!(undo_since(&repo, &head.to_string()).unwrap_err().code, "workspace.undo_uploaded");
    }

    #[test]
    fn park_and_unpark() {
        let t = Tmp::new("park");
        let mut repo = git::init(t.s()).unwrap();
        t.write("a.txt", "1");
        git::commit(&repo, None, "first", &sig()).unwrap();
        assert_eq!(park(&mut repo, "x", &sig()).unwrap_err().code, "workspace.nothing_to_park");
        t.write("a.txt", "edited");
        t.write("new.txt", "n");
        park(&mut repo, "half done", &sig()).unwrap();
        assert_eq!(t.read("a.txt"), "1");
        assert!(!t.0.join("new.txt").exists());
        let list = parked(&mut repo).unwrap();
        assert_eq!((list.len(), list[0].message.as_str(), list[0].branch.as_deref()), (1, "half done", Some("main")));
        unpark(&mut repo, 0).unwrap();
        assert_eq!(t.read("a.txt"), "edited");
        assert!(t.0.join("new.txt").exists());
        assert!(parked(&mut repo).unwrap().is_empty());
    }

    #[test]
    fn pick_mine_or_theirs() {
        let t = Tmp::new("pick");
        let repo = git::init(t.s()).unwrap();
        t.write("a.txt", "base\n");
        t.write("b.txt", "base\n");
        git::commit(&repo, None, "base", &sig()).unwrap();
        let base = git::head_commit(&repo).unwrap();

        let mut idx = repo.index().unwrap();
        let mut add = |p: &str, text: &str| {
            let oid = repo.blob(text.as_bytes()).unwrap();
            let mut e = idx.get_path(Path::new(p), 0).unwrap();
            e.id = oid;
            e.file_size = text.len() as u32;
            idx.add(&e).unwrap();
        };
        add("a.txt", "theirs a\n");
        add("b.txt", "theirs b\n");
        let tree = repo.find_tree(idx.write_tree_to(&repo).unwrap()).unwrap();
        let theirs = repo.commit(None, &sig(), &sig(), "theirs", &tree, &[&base]).unwrap();
        repo.reference("refs/remotes/origin/main", theirs, true, "test").unwrap();

        let mut i = repo.index().unwrap();
        i.read_tree(&base.tree().unwrap()).unwrap();
        i.write().unwrap();
        t.write("a.txt", "mine a\n");
        t.write("b.txt", "mine b\n");
        git::commit(&repo, None, "mine", &sig()).unwrap();

        let c = conflicts(&repo, "origin", "main").unwrap();
        assert_eq!(c.iter().map(|x| x.path.as_str()).collect::<Vec<_>>(), ["a.txt", "b.txt"]);
        assert_eq!(merge_with_picks(&repo, "origin", "main", &[("a.txt".into(), Pick::Mine)], &sig()).unwrap_err().code, "workspace.unresolved");
        merge_with_picks(&repo, "origin", "main", &[("a.txt".into(), Pick::Mine), ("b.txt".into(), Pick::Theirs)], &sig()).unwrap();
        assert_eq!((t.read("a.txt").as_str(), t.read("b.txt").as_str()), ("mine a\n", "theirs b\n"));
        assert_eq!(git::head_commit(&repo).unwrap().parent_count(), 2);
        assert!(git::changes(&repo).unwrap().is_empty());
    }

    #[test]
    fn stash_messages() {
        assert_eq!(split_stash_message("On main: hi: there"), (Some("main".into()), "hi: there".into()));
        assert_eq!(split_stash_message("plain"), (None, "plain".into()));
    }
}
