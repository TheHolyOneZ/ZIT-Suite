use std::collections::HashMap;
use std::path::{Path, PathBuf};

use git2::{build::RepoBuilder, Cred, DiffOptions, FetchOptions, RemoteCallbacks, Repository, Sort, TreeWalkMode, TreeWalkResult};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
pub struct FileStat {
    pub path: String,
    pub size: f64,
    pub lines: u32,
    pub blank: u32,
    pub language: Option<String>,
    pub binary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
pub struct Contributor {
    pub name: String,
    pub email: String,
    pub commits: u32,
    pub additions: f64,
    pub deletions: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
pub struct Month {

    pub month: String,
    pub commits: u32,
    pub additions: f64,
    pub deletions: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AuditReport {
    pub repo: String,
    pub branch: String,
    pub head: String,
    pub files: Vec<FileStat>,
    pub commits: u32,

    pub additions: f64,
    pub deletions: f64,
    pub first_commit: Option<String>,
    pub last_commit: Option<String>,
    pub contributors: Vec<Contributor>,
    pub monthly: Vec<Month>,

    pub history_capped: bool,
    pub generated_at: String,

    pub hot_files: Vec<FileChurn>,

    pub local: bool,
}


pub fn language_of(path: &str) -> Option<&'static str> {
    let name = path.rsplit('/').next().unwrap_or(path);
    let lower = name.to_ascii_lowercase();
    match lower.as_str() {
        "dockerfile" => return Some("Dockerfile"),
        "makefile" | "gnumakefile" => return Some("Makefile"),
        "cmakelists.txt" => return Some("CMake"),
        _ => {}
    }
    let ext = lower.rsplit_once('.').map(|(_, e)| e)?;
    Some(match ext {
        "rs" => "Rust",
        "ts" | "mts" | "cts" => "TypeScript",
        "tsx" => "TSX",
        "js" | "mjs" | "cjs" => "JavaScript",
        "jsx" => "JSX",
        "py" | "pyw" => "Python",
        "go" => "Go",
        "java" => "Java",
        "kt" | "kts" => "Kotlin",
        "swift" => "Swift",
        "c" | "h" => "C",
        "cc" | "cpp" | "cxx" | "hpp" | "hh" | "hxx" => "C++",
        "cs" => "C#",
        "rb" => "Ruby",
        "php" => "PHP",
        "lua" => "Lua",
        "dart" => "Dart",
        "scala" => "Scala",
        "zig" => "Zig",
        "sh" | "bash" | "zsh" | "fish" => "Shell",
        "ps1" | "psm1" => "PowerShell",
        "bat" | "cmd" => "Batch",
        "html" | "htm" => "HTML",
        "css" => "CSS",
        "scss" | "sass" => "SCSS",
        "vue" => "Vue",
        "svelte" => "Svelte",
        "md" | "markdown" | "mdx" => "Markdown",
        "json" | "jsonc" => "JSON",
        "yml" | "yaml" => "YAML",
        "toml" => "TOML",
        "xml" => "XML",
        "sql" => "SQL",
        "glsl" | "frag" | "vert" | "wgsl" | "hlsl" => "Shader",
        "txt" => "Text",
        _ => return None,
    })
}


pub fn count_lines(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes[..bytes.len().min(8000)].contains(&0) {
        return None;
    }
    if bytes.is_empty() {
        return Some((0, 0));
    }
    let mut lines = 0u32;
    let mut blank = 0u32;
    for line in bytes.split(|b| *b == b'\n') {
        lines += 1;
        if line.iter().all(|b| b.is_ascii_whitespace()) {
            blank += 1;
        }
    }

    if bytes.ends_with(b"\n") {
        lines -= 1;
        blank -= 1;
    }
    Some((lines, blank))
}

fn callbacks<'a>(token: Option<&'a str>, progress: &'a dyn Fn(u32, u32)) -> RemoteCallbacks<'a> {
    let mut cb = RemoteCallbacks::new();
    if let Some(t) = token {
        cb.credentials(move |_, _, _| Cred::userpass_plaintext("x-access-token", t));
    }
    cb.transfer_progress(move |p| {
        progress(p.received_objects() as u32, p.total_objects() as u32);
        true
    });
    cb
}


pub fn sync_mirror(url: &str, dir: &Path, token: Option<&str>, progress: &dyn Fn(u32, u32)) -> AppResult<Repository> {
    let mut fo = FetchOptions::new();
    fo.remote_callbacks(callbacks(token, progress));
    if dir.join("HEAD").exists() {
        let repo = Repository::open_bare(dir)?;
        {
            let mut remote = repo.find_remote("origin")?;
            remote.fetch(&["+refs/heads/*:refs/heads/*"], Some(&mut fo), None)?;

            if let Ok(buf) = remote.default_branch() {
                if let Some(name) = buf.as_str() {
                    let _ = repo.set_head(name);
                }
            }
        }
        Ok(repo)
    } else {
        std::fs::create_dir_all(dir).map_err(|e| AppError::new("audit.io").detail(e.to_string()))?;
        Ok(RepoBuilder::new().bare(true).fetch_options(fo).clone(url, dir)?)
    }
}


pub fn files_at_head(repo: &Repository) -> AppResult<(String, String, Vec<FileStat>)> {
    let head = repo.head().map_err(|_| AppError::new("audit.empty"))?;
    let branch = head.shorthand().unwrap_or("HEAD").to_string();
    let commit = head.peel_to_commit()?;
    let mut out = Vec::new();
    commit.tree()?.walk(TreeWalkMode::PreOrder, |dir, entry| {
        if entry.kind() == Some(git2::ObjectType::Blob) {
            if let Ok(blob) = repo.find_blob(entry.id()) {
                let path = format!("{dir}{}", entry.name().unwrap_or(""));
                let counted = count_lines(blob.content());
                out.push(FileStat {
                    language: language_of(&path).map(str::to_string),
                    size: blob.size() as f64,
                    lines: counted.map_or(0, |c| c.0),
                    blank: counted.map_or(0, |c| c.1),
                    binary: counted.is_none(),
                    path,
                });
            }
        }
        TreeWalkResult::Ok
    })?;
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok((branch, commit.id().to_string(), out))
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileChurn {
    pub path: String,
    pub commits: u32,
    pub additions: f64,
    pub deletions: f64,
}


fn top_churn(by_path: HashMap<String, FileChurn>, n: usize) -> Vec<FileChurn> {
    let mut v: Vec<_> = by_path.into_values().collect();
    v.sort_by(|a, b| b.commits.cmp(&a.commits).then((b.additions + b.deletions).total_cmp(&(a.additions + a.deletions))).then(a.path.cmp(&b.path)));
    v.truncate(n);
    v
}

pub struct History {
    pub commits: u32,
    pub additions: u64,
    pub deletions: u64,
    pub first: Option<i64>,
    pub last: Option<i64>,
    pub contributors: Vec<Contributor>,
    pub monthly: Vec<Month>,
    pub capped: bool,
    pub hot_files: Vec<FileChurn>,
}


pub fn history(repo: &Repository, line_cap: u32, progress: &dyn Fn(u32)) -> AppResult<History> {
    let head = repo.head()?.peel_to_commit()?;
    let mut walk = repo.revwalk()?;
    walk.push(head.id())?;
    walk.set_sorting(Sort::TIME)?;
    let mut opts = DiffOptions::new();
    opts.ignore_submodules(true);
    let mut by_email: HashMap<String, Contributor> = HashMap::new();
    let mut by_month: HashMap<String, Month> = HashMap::new();
    let mut by_path: HashMap<String, FileChurn> = HashMap::new();
    let (mut commits, mut add, mut del, mut first, mut last, mut capped) = (0u32, 0u64, 0u64, None::<i64>, None::<i64>, false);
    for oid in walk {
        let c = repo.find_commit(oid?)?;
        commits += 1;
        if commits % 200 == 0 {
            progress(commits);
        }
        let t = c.time().seconds();
        first = Some(first.map_or(t, |f: i64| f.min(t)));
        last = Some(last.map_or(t, |l: i64| l.max(t)));
        let (a, d) = if c.parent_count() > 1 || commits > line_cap {
            capped |= commits > line_cap;
            (0, 0)
        } else {
            let parent_tree = c.parent(0).ok().and_then(|p| p.tree().ok());
            let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&c.tree()?), Some(&mut opts))?;
            let (mut a, mut d) = (0u64, 0u64);
            for i in 0..diff.deltas().len() {
                let delta = diff.get_delta(i);
                let Some(path) = delta.as_ref().and_then(|x| x.new_file().path().or(x.old_file().path())).map(|p| p.to_string_lossy().replace('\\', "/")) else { continue };

                let (_, fa, fd) = git2::Patch::from_diff(&diff, i).ok().flatten().and_then(|p| p.line_stats().ok()).unwrap_or((0, 0, 0));
                a += fa as u64;
                d += fd as u64;
                let f = by_path.entry(path.clone()).or_insert_with(|| FileChurn { path, commits: 0, additions: 0.0, deletions: 0.0 });
                f.commits += 1;
                f.additions += fa as f64;
                f.deletions += fd as f64;
            }
            (a, d)
        };
        add += a;
        del += d;
        let author = c.author();
        let email = author.email().unwrap_or("").to_lowercase();
        let e = by_email.entry(email.clone()).or_insert_with(|| Contributor { name: author.name().unwrap_or("?").to_string(), email, commits: 0, additions: 0.0, deletions: 0.0 });
        e.commits += 1;
        e.additions += a as f64;
        e.deletions += d as f64;
        let month = chrono::DateTime::from_timestamp(t, 0).map(|d| d.format("%Y-%m").to_string()).unwrap_or_default();
        let m = by_month.entry(month.clone()).or_insert(Month { month, commits: 0, additions: 0.0, deletions: 0.0 });
        m.commits += 1;
        m.additions += a as f64;
        m.deletions += d as f64;
    }
    let mut contributors: Vec<_> = by_email.into_values().collect();
    contributors.sort_by(|a, b| b.commits.cmp(&a.commits).then(a.name.cmp(&b.name)));
    let mut monthly: Vec<_> = by_month.into_values().collect();
    monthly.sort_by(|a, b| a.month.cmp(&b.month));
    Ok(History { commits, additions: add, deletions: del, first, last, contributors, monthly, capped, hot_files: top_churn(by_path, 50) })
}


pub fn cache_dir(root: &Path, repo: &str) -> PathBuf {
    root.join(repo.replace('/', "__"))
}

pub fn dir_size(p: &Path) -> u64 {
    std::fs::read_dir(p)
        .map(|rd| {
            rd.flatten()
                .map(|e| match e.metadata() {
                    Ok(m) if m.is_dir() => dir_size(&e.path()),
                    Ok(m) => m.len(),
                    Err(_) => 0,
                })
                .sum()
        })
        .unwrap_or(0)
}

pub fn ts(secs: Option<i64>) -> Option<String> {
    secs.and_then(|s| chrono::DateTime::from_timestamp(s, 0)).map(|d| d.to_rfc3339())
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::Signature;

    #[test]
    fn counts_lines_and_blank() {
        assert_eq!(count_lines(b""), Some((0, 0)));
        assert_eq!(count_lines(b"a\n\nb\n"), Some((3, 1)));
        assert_eq!(count_lines(b"a\nb"), Some((2, 0)));
        assert_eq!(count_lines(b"  \n"), Some((1, 1)));
        assert_eq!(count_lines(&[b'a', 0, b'b']), None);
    }

    #[test]
    fn languages() {
        assert_eq!(language_of("src/main.rs"), Some("Rust"));
        assert_eq!(language_of("web/App.TSX"), Some("TSX"));
        assert_eq!(language_of("Dockerfile"), Some("Dockerfile"));
        assert_eq!(language_of("LICENSE"), None);
    }

    fn commit(repo: &Repository, files: &[(&str, &str)], msg: &str, who: &str) {
        let dir = repo.workdir().unwrap();
        for (p, c) in files {
            let full = dir.join(p);
            std::fs::create_dir_all(full.parent().unwrap()).unwrap();
            std::fs::write(full, c).unwrap();
        }
        let mut idx = repo.index().unwrap();
        idx.add_all(["*"], git2::IndexAddOption::DEFAULT, None).unwrap();
        idx.write().unwrap();
        let tree = repo.find_tree(idx.write_tree().unwrap()).unwrap();
        let sig = Signature::now(who, &format!("{who}@x.dev")).unwrap();
        let parents: Vec<_> = repo.head().ok().and_then(|h| h.peel_to_commit().ok()).into_iter().collect();
        let refs: Vec<&git2::Commit> = parents.iter().collect();
        repo.commit(Some("HEAD"), &sig, &sig, msg, &tree, &refs).unwrap();
    }

    #[test]
    fn audits_a_repo_through_a_bare_mirror() {
        let base = std::env::temp_dir().join(format!("zit-audit-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let src = Repository::init(base.join("src")).unwrap();
        commit(&src, &[("a.rs", "fn main() {}\n\n// x\n"), ("docs/readme.md", "# hi\n")], "init", "Ann");
        commit(&src, &[("a.rs", "fn main() {}\n")], "trim", "Bob");
        commit(&src, &[("img.bin", "\0\0bin")], "binary", "Ann");

        let url = base.join("src").to_string_lossy().to_string();
        let mirror = sync_mirror(&url, &base.join("mirror"), None, &|_, _| {}).unwrap();
        assert!(mirror.is_bare());
        let (_, head, files) = files_at_head(&mirror).unwrap();
        assert_eq!(head.len(), 40);
        let a = files.iter().find(|f| f.path == "a.rs").unwrap();
        assert_eq!((a.lines, a.blank, a.language.as_deref()), (1, 0, Some("Rust")));
        assert!(files.iter().any(|f| f.path == "docs/readme.md" && f.lines == 1));
        assert!(files.iter().find(|f| f.path == "img.bin").unwrap().binary);

        let h = history(&mirror, 10_000, &|_| {}).unwrap();
        assert_eq!(h.commits, 3);
        assert_eq!(h.additions, 4);
        assert_eq!(h.deletions, 2);
        assert_eq!(h.contributors[0].name, "Ann");
        assert_eq!(h.contributors[0].commits, 2);
        assert!(!h.capped);
        assert_eq!((h.hot_files[0].path.as_str(), h.hot_files[0].commits, h.hot_files[0].deletions), ("a.rs", 2, 2.0));
        assert!(h.hot_files.iter().any(|f| f.path == "img.bin" && f.additions == 0.0));


        commit(&src, &[("b.py", "print(1)\n")], "more", "Bob");
        let again = sync_mirror(&url, &base.join("mirror"), None, &|_, _| {}).unwrap();
        assert!(files_at_head(&again).unwrap().2.iter().any(|f| f.path == "b.py"));
        assert!(dir_size(&base.join("mirror")) > 0);
        let _ = std::fs::remove_dir_all(&base);
    }
}
