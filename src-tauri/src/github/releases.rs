use std::path::Path;
use std::sync::Arc;

use futures_util::stream::{self, StreamExt};
use reqwest::header::{CONTENT_LENGTH, CONTENT_TYPE};
use reqwest::{Body, Method};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;

use super::client::{enc, GitHubClient};
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Asset {
    pub id: u64,
    pub name: String,
    pub size: u64,
    pub download_count: u64,
    pub browser_download_url: String,
    pub content_type: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Release {
    pub id: u64,
    pub tag_name: String,
    pub target_commitish: String,
    pub name: Option<String>,
    pub body: Option<String>,
    pub draft: bool,
    pub prerelease: bool,
    pub created_at: String,
    pub published_at: Option<String>,
    pub html_url: String,
    pub assets: Vec<Asset>,
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ReleaseInput {
    pub tag_name: String,

    pub target: Option<String>,
    pub name: String,
    pub body: String,
    pub draft: bool,
    pub prerelease: bool,
    pub make_latest: bool,
}

fn release_body(i: &ReleaseInput) -> AppResult<Value> {
    let tag = i.tag_name.trim();
    if !valid_tag(tag) {
        return Err(AppError::new("releases.bad_tag").detail(tag.to_string()));
    }
    let mut b = json!({
        "tag_name": tag,
        "name": if i.name.trim().is_empty() { tag } else { i.name.trim() },
        "body": i.body,
        "draft": i.draft,
        "prerelease": i.prerelease,
        "make_latest": if i.make_latest && !i.draft && !i.prerelease { "true" } else { "false" },
    });
    if let Some(t) = i.target.as_deref().filter(|t| !t.trim().is_empty()) {
        b["target_commitish"] = json!(t.trim());
    }
    Ok(b)
}


pub fn valid_tag(t: &str) -> bool {
    !t.is_empty()
        && t.len() <= 200
        && !t.starts_with(['-', '/', '.'])
        && !t.ends_with(['/', '.'])
        && !t.ends_with(".lock")
        && !t.contains("..")
        && !t.contains("//")
        && !t.contains("@{")
        && t.chars().all(|c| !c.is_whitespace() && !c.is_control() && !"~^:?*[\\".contains(c))
}

pub async fn list(c: &GitHubClient, repo: &str, fresh: bool) -> AppResult<Vec<Release>> {
    c.paginate_with(&format!("/repos/{repo}/releases?per_page=100"), fresh).await
}

pub async fn create(c: &GitHubClient, repo: &str, i: &ReleaseInput) -> AppResult<Release> {
    let v = c.send_json(Method::POST, &format!("/repos/{repo}/releases"), Some(&release_body(i)?)).await?;
    Ok(serde_json::from_value(v.unwrap_or_default())?)
}

pub async fn update(c: &GitHubClient, repo: &str, id: u64, i: &ReleaseInput) -> AppResult<Release> {
    let v = c.send_json(Method::PATCH, &format!("/repos/{repo}/releases/{id}"), Some(&release_body(i)?)).await?;
    Ok(serde_json::from_value(v.unwrap_or_default())?)
}


pub async fn delete(c: &GitHubClient, repo: &str, id: u64, tag: Option<&str>) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/repos/{repo}/releases/{id}"), None).await?;
    if let Some(t) = tag {
        delete_tag(c, repo, t).await?;
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Notes {
    pub name: String,
    pub body: String,
}


pub async fn generate_notes(c: &GitHubClient, repo: &str, tag: &str, target: Option<&str>, previous: Option<&str>) -> AppResult<Notes> {
    let mut b = json!({ "tag_name": tag });
    if let Some(t) = target.filter(|t| !t.is_empty()) {
        b["target_commitish"] = json!(t);
    }
    if let Some(p) = previous.filter(|p| !p.is_empty()) {
        b["previous_tag_name"] = json!(p);
    }
    let v = c.send_json(Method::POST, &format!("/repos/{repo}/releases/generate-notes"), Some(&b)).await?;
    Ok(serde_json::from_value(v.unwrap_or_default())?)
}

fn content_type(name: &str) -> &'static str {
    match Path::new(name).extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref() {
        Some("zip") => "application/zip",
        Some("gz" | "tgz") => "application/gzip",
        Some("json") => "application/json",
        Some("txt" | "md" | "sha256" | "sig" | "asc") => "text/plain",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("pdf") => "application/pdf",
        Some("exe" | "msi") => "application/vnd.microsoft.portable-executable",
        Some("deb") => "application/vnd.debian.binary-package",
        _ => "application/octet-stream",
    }
}


pub fn asset_name(path: &str) -> String {
    Path::new(path).file_name().map(|n| n.to_string_lossy().replace(' ', ".")).unwrap_or_else(|| "file".into())
}

pub type Progress = Arc<dyn Fn(u64, u64) + Send + Sync>;


pub async fn upload_asset(c: &GitHubClient, repo: &str, release_id: u64, path: &str, progress: Progress) -> AppResult<Asset> {
    let bytes = tokio::fs::read(path).await.map_err(|e| AppError::new("releases.read_failed").detail(e.to_string()))?;
    let total = bytes.len() as u64;
    let name = asset_name(path);
    let chunks: Vec<Vec<u8>> = bytes.chunks(256 * 1024).map(<[u8]>::to_vec).collect();
    let mut sent = 0u64;
    let body = stream::iter(chunks).map(move |chunk| {
        sent += chunk.len() as u64;
        progress(sent, total);
        Ok::<_, std::io::Error>(chunk)
    });
    let url = format!("https://uploads.github.com/repos/{repo}/releases/{release_id}/assets?name={}", enc(&name));
    let rb = c
        .request(Method::POST, &url)
        .header(CONTENT_TYPE, content_type(&name))
        .header(CONTENT_LENGTH, total)
        .body(Body::wrap_stream(body));
    let res = c.execute(rb).await.map_err(|e| if e.code == "github.validation" { AppError::new("releases.asset_exists").detail(name.clone()) } else { e })?;
    Ok(res.json().await?)
}

pub async fn delete_asset(c: &GitHubClient, repo: &str, asset_id: u64) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/repos/{repo}/releases/assets/{asset_id}"), None).await.map(drop)
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Tag {
    pub name: String,
    pub sha: String,
}

#[derive(Deserialize)]
struct TagRaw {
    name: String,
    commit: TagCommit,
}
#[derive(Deserialize)]
struct TagCommit {
    sha: String,
}

pub async fn tags(c: &GitHubClient, repo: &str, fresh: bool) -> AppResult<Vec<Tag>> {
    let raw: Vec<TagRaw> = c.paginate_with(&format!("/repos/{repo}/tags?per_page=100"), fresh).await?;
    Ok(raw.into_iter().map(|t| Tag { name: t.name, sha: t.commit.sha }).collect())
}


pub async fn create_tag(c: &GitHubClient, repo: &str, name: &str, target: &str) -> AppResult<()> {
    if !valid_tag(name) {
        return Err(AppError::new("releases.bad_tag").detail(name.to_string()));
    }

    let sha = match c.get_json::<Value>(&format!("/repos/{repo}/commits/{}", enc(target))).await {
        Ok(v) => v.get("sha").and_then(Value::as_str).unwrap_or(target).to_string(),
        Err(e) => return Err(e),
    };
    let body = json!({ "ref": format!("refs/tags/{name}"), "sha": sha });
    c.send_json(Method::POST, &format!("/repos/{repo}/git/refs"), Some(&body))
        .await
        .map_err(|e| if e.code == "github.validation" { AppError::new("releases.tag_exists").detail(name.to_string()) } else { e })
        .map(drop)
}

pub async fn delete_tag(c: &GitHubClient, repo: &str, name: &str) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/repos/{repo}/git/refs/tags/{}", enc(name)), None).await.map(drop)
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ReleaseSummary {
    pub tag: String,
    pub name: Option<String>,
    pub published_at: Option<String>,
    pub prerelease: bool,
    pub html_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RepoReleases {
    pub repo: String,
    pub branch: String,

    pub releases: u32,
    pub drafts: u32,

    pub latest: Option<ReleaseSummary>,
    pub downloads: u64,

    pub tags: Vec<String>,

    pub since: Option<u32>,
    pub since_tag: Option<String>,
    pub error: Option<AppError>,
}


pub fn base_tag(latest: Option<&ReleaseSummary>, tags: &[String]) -> Option<String> {
    latest.map(|l| l.tag.clone()).or_else(|| tags.first().cloned())
}

pub fn summarize(list: &[Release]) -> (u32, u32, Option<ReleaseSummary>, u64) {
    let published: Vec<&Release> = list.iter().filter(|r| !r.draft).collect();
    let pick = published.iter().find(|r| !r.prerelease).or_else(|| published.first());
    let latest = pick.map(|r| ReleaseSummary { tag: r.tag_name.clone(), name: r.name.clone(), published_at: r.published_at.clone(), prerelease: r.prerelease, html_url: r.html_url.clone() });
    let downloads = list.iter().flat_map(|r| &r.assets).map(|a| a.download_count).sum();
    (published.len() as u32, (list.len() - published.len()) as u32, latest, downloads)
}


async fn ahead(c: &GitHubClient, repo: &str, base: &str, head: &str, fresh: bool) -> AppResult<u32> {
    let (v, _) = c.get_page(&format!("/repos/{repo}/compare/{}...{}?per_page=1", enc(base), enc(head)), fresh).await?;
    Ok(v["ahead_by"].as_u64().unwrap_or(0) as u32)
}

pub async fn overview(c: &GitHubClient, repo: &str, branch: &str, fresh: bool) -> RepoReleases {
    let mut out = RepoReleases { repo: repo.into(), branch: branch.into(), releases: 0, drafts: 0, latest: None, downloads: 0, tags: vec![], since: None, since_tag: None, error: None };
    let list = match list(c, repo, fresh).await {
        Ok(l) => l,
        Err(e) => {
            out.error = Some(e);
            return out;
        }
    };
    (out.releases, out.drafts, out.latest, out.downloads) = summarize(&list);
    if let Ok((v, _)) = c.get_page(&format!("/repos/{repo}/tags?per_page=100"), fresh).await {
        out.tags = v.as_array().into_iter().flatten().filter_map(|t| t["name"].as_str().map(str::to_string)).collect();
    }
    out.since_tag = base_tag(out.latest.as_ref(), &out.tags);
    if let Some(tag) = &out.since_tag {
        out.since = ahead(c, repo, tag, branch, fresh).await.ok();
    }
    out
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CommitLine {
    pub sha: String,
    pub message: String,
    pub author: Option<String>,
    pub date: Option<String>,
    pub html_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Unreleased {
    pub base: String,
    pub head: String,

    pub total: u32,
    pub commits: Vec<CommitLine>,
}


pub async fn unreleased(c: &GitHubClient, repo: &str, base: &str, head: &str) -> AppResult<Unreleased> {
    let (v, _) = c.get_page(&format!("/repos/{repo}/compare/{}...{}?per_page=250", enc(base), enc(head)), false).await?;
    let mut commits: Vec<CommitLine> = v["commits"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|x| CommitLine {
            sha: x["sha"].as_str().unwrap_or_default().to_string(),
            message: x["commit"]["message"].as_str().unwrap_or_default().lines().next().unwrap_or_default().to_string(),
            author: x["author"]["login"].as_str().or(x["commit"]["author"]["name"].as_str()).map(str::to_string),
            date: x["commit"]["author"]["date"].as_str().map(str::to_string),
            html_url: x["html_url"].as_str().unwrap_or_default().to_string(),
        })
        .collect();
    commits.reverse();
    Ok(Unreleased { base: base.into(), head: head.into(), total: v["ahead_by"].as_u64().unwrap_or(commits.len() as u64) as u32, commits })
}


pub fn next_tag(last: Option<&str>, bump: &str, today: chrono::NaiveDate) -> String {
    if bump == "date" {
        let base = format!("v{}", today.format("%Y.%m.%d"));
        return match last {
            Some(l) if l == base || l.starts_with(&format!("{base}.")) => {
                let n = l.strip_prefix(&format!("{base}.")).and_then(|x| x.parse::<u32>().ok()).unwrap_or(1);
                format!("{base}.{}", n + 1)
            }
            _ => base,
        };
    }
    let (prefix, rest) = match last {
        Some(l) if l.starts_with('v') || l.starts_with('V') => (&l[..1], &l[1..]),
        Some(l) => ("", l),
        None => ("v", ""),
    };

    let core = rest.split(['-', '+']).next().unwrap_or("");
    let parts: Vec<Option<u64>> = core.split('.').map(|x| x.parse().ok()).collect();
    let (mut ma, mut mi, mut pa) = match parts.as_slice() {
        [Some(a)] => (*a, 0, 0),
        [Some(a), Some(b)] => (*a, *b, 0),
        [Some(a), Some(b), Some(c), ..] => (*a, *b, *c),
        _ => return format!("{prefix}0.1.0"),
    };
    match bump {
        "major" => (ma, mi, pa) = (ma + 1, 0, 0),
        "minor" => (mi, pa) = (mi + 1, 0),
        _ => pa += 1,
    }
    format!("{prefix}{ma}.{mi}.{pa}")
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ReleasePlan {
    pub last: Option<String>,
    pub tag: String,
    pub branch: String,

    pub commits: u32,
}


pub async fn plan_next(c: &GitHubClient, repo: &str, branch: &str, bump: &str) -> AppResult<ReleasePlan> {
    let last = match c.get_json::<Value>(&format!("/repos/{repo}/releases/latest")).await {
        Ok(v) => v["tag_name"].as_str().map(str::to_string),
        Err(e) if e.code == "github.not_found" => None,
        Err(e) => return Err(e),
    };
    let commits = match &last {
        Some(tag) => unreleased(c, repo, tag, branch).await?.total,
        None => 1,
    };
    let tag = next_tag(last.as_deref(), bump, chrono::Local::now().date_naive());
    Ok(ReleasePlan { last, tag, branch: branch.to_string(), commits })
}


pub async fn release_next(c: &GitHubClient, repo: &str, branch: &str, bump: &str, draft: bool, prerelease: bool) -> AppResult<()> {
    let plan = plan_next(c, repo, branch, bump).await?;
    if plan.commits == 0 {
        return Ok(());
    }
    let body = json!({
        "tag_name": plan.tag,
        "target_commitish": branch,
        "name": plan.tag,
        "generate_release_notes": true,
        "draft": draft,
        "prerelease": prerelease,
    });
    c.send_json(Method::POST, &format!("/repos/{repo}/releases"), Some(&body)).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn next_tags() {
        let d = chrono::NaiveDate::from_ymd_opt(2026, 10, 5).unwrap();
        assert_eq!(next_tag(Some("v1.2.3"), "patch", d), "v1.2.4");
        assert_eq!(next_tag(Some("1.2.3"), "minor", d), "1.3.0");
        assert_eq!(next_tag(Some("v1.9"), "major", d), "v2.0.0");
        assert_eq!(next_tag(Some("v1.2.3-beta.1"), "patch", d), "v1.2.4");
        assert_eq!(next_tag(None, "patch", d), "v0.1.0");
        assert_eq!(next_tag(Some("nightly"), "minor", d), "0.1.0");
        assert_eq!(next_tag(Some("v1.0.0"), "date", d), "v2026.10.05");
        assert_eq!(next_tag(Some("v2026.10.05"), "date", d), "v2026.10.05.2");
        assert_eq!(next_tag(Some("v2026.10.05.2"), "date", d), "v2026.10.05.3");
    }


    fn rel(tag: &str, draft: bool, pre: bool, dl: u64) -> Release {
        Release {
            id: 1,
            tag_name: tag.into(),
            target_commitish: "main".into(),
            name: None,
            body: None,
            draft,
            prerelease: pre,
            created_at: String::new(),
            published_at: Some("2026-01-01T00:00:00Z".into()),
            html_url: String::new(),
            assets: vec![Asset { id: 1, name: "a".into(), size: 1, download_count: dl, browser_download_url: String::new(), content_type: String::new(), updated_at: String::new() }],
        }
    }

    #[test]
    fn summary_skips_drafts_and_prefers_stable() {
        let (n, drafts, latest, dl) = summarize(&[rel("v3.0.0", true, false, 0), rel("v2.1.0-rc1", false, true, 5), rel("v2.0.0", false, false, 10)]);
        assert_eq!((n, drafts, dl), (2, 1, 15));
        assert_eq!(latest.as_ref().unwrap().tag, "v2.0.0");
        assert_eq!(base_tag(latest.as_ref(), &["v9".into()]).as_deref(), Some("v2.0.0"));
        assert_eq!(base_tag(None, &["v9".into()]).as_deref(), Some("v9"));
        assert_eq!(summarize(&[rel("v1.0.0-beta", false, true, 0)]).2.unwrap().tag, "v1.0.0-beta");
    }

    #[test]
    fn tag_names() {
        for ok in ["v1.2.0", "release-2026-10", "v2.0.0-beta.1", "builds/42"] {
            assert!(valid_tag(ok), "{ok}");
        }
        for bad in ["", "v 1", "-x", "a..b", "x.lock", "a:b", "x/", "a~1", "@{x"] {
            assert!(!valid_tag(bad), "{bad}");
        }
    }

    #[test]
    fn release_body_defaults() {
        let i = ReleaseInput { tag_name: " v1.0.0 ".into(), target: Some("main".into()), name: "".into(), body: "notes".into(), draft: false, prerelease: false, make_latest: true };
        let b = release_body(&i).unwrap();
        assert_eq!(b["tag_name"], "v1.0.0");
        assert_eq!(b["name"], "v1.0.0");
        assert_eq!(b["make_latest"], "true");
        assert_eq!(b["target_commitish"], "main");
        let draft = ReleaseInput { draft: true, ..i };
        assert_eq!(release_body(&draft).unwrap()["make_latest"], "false");
    }

    #[test]
    fn asset_names_and_types() {
        assert_eq!(asset_name("/tmp/My App 1.0.zip"), "My.App.1.0.zip");
        assert_eq!(content_type("x.ZIP"), "application/zip");
        assert_eq!(content_type("x.AppImage"), "application/octet-stream");
    }


    #[tokio::test]
    #[ignore]
    async fn live_upload_asset() {
        let var = |k: &str| std::env::var(k).unwrap_or_else(|_| panic!("{k}"));
        let repo = var("ZIT_TEST_REPO");
        assert!(repo.contains("zit-suite-sandbox"), "refusing to touch a non-sandbox repo");
        let c = GitHubClient::new(var("ZIT_TEST_TOKEN")).unwrap();
        let rel = list(&c, &repo, true).await.unwrap().into_iter().find(|r| r.tag_name == var("ZIT_TEST_TAG")).expect("release");
        let path = var("ZIT_TEST_FILE");
        let size = std::fs::metadata(&path).unwrap().len();
        let calls = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let seen = calls.clone();
        let progress: Progress = Arc::new(move |sent, total| {
            assert!(sent <= total);
            seen.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        });
        let a = upload_asset(&c, &repo, rel.id, &path, progress).await.unwrap();
        assert_eq!(a.size, size);
        assert_eq!(a.name, asset_name(&path));
        assert!(calls.load(std::sync::atomic::Ordering::Relaxed) > 1, "progress reported in chunks");

        let again = upload_asset(&c, &repo, rel.id, &path, Arc::new(|_, _| {})).await.unwrap_err();
        assert_eq!(again.code, "releases.asset_exists");
    }
}
