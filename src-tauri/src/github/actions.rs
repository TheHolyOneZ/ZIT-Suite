use std::collections::BTreeMap;

use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;

use super::client::{enc, GitHubClient};
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Workflow {
    pub id: u64,
    pub name: String,
    pub path: String,

    pub state: String,
    pub html_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Run {
    pub id: u64,
    pub workflow_id: u64,
    pub name: Option<String>,
    pub display_title: Option<String>,
    pub event: String,

    pub status: Option<String>,

    pub conclusion: Option<String>,
    pub head_branch: Option<String>,
    pub head_sha: String,
    pub run_number: u64,
    pub run_attempt: Option<u64>,
    pub created_at: String,
    pub updated_at: String,
    pub run_started_at: Option<String>,
    pub html_url: String,
    pub actor: Option<Actor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Actor {
    pub login: String,
}

pub async fn workflows(c: &GitHubClient, repo: &str, fresh: bool) -> AppResult<Vec<Workflow>> {
    c.paginate_key(&format!("/repos/{repo}/actions/workflows?per_page=100"), "workflows", fresh).await
}


pub async fn runs(c: &GitHubClient, repo: &str, workflow: Option<u64>, per_page: u32, fresh: bool) -> AppResult<Vec<Run>> {
    let base = match workflow {
        Some(w) => format!("/repos/{repo}/actions/workflows/{w}/runs"),
        None => format!("/repos/{repo}/actions/runs"),
    };
    let (mut body, _) = c.get_page(&format!("{base}?per_page={}", per_page.clamp(1, 100)), fresh).await?;
    let items = body.get_mut("workflow_runs").map(Value::take).unwrap_or(Value::Array(vec![]));
    Ok(serde_json::from_value(items)?)
}


pub async fn dispatch(c: &GitHubClient, repo: &str, workflow_id: u64, git_ref: &str, inputs: &BTreeMap<String, String>) -> AppResult<()> {
    let body = json!({ "ref": git_ref, "inputs": inputs });
    c.send_json(Method::POST, &format!("/repos/{repo}/actions/workflows/{workflow_id}/dispatches"), Some(&body))
        .await
        .map_err(|e| {

            if e.code == "github.validation" && e.detail.as_deref().is_some_and(|d| d.contains("workflow_dispatch")) {
                AppError::new("actions.not_dispatchable")
            } else {
                e
            }
        })
        .map(drop)
}

pub async fn rerun(c: &GitHubClient, repo: &str, run_id: u64, failed_only: bool) -> AppResult<()> {
    let what = if failed_only { "rerun-failed-jobs" } else { "rerun" };
    c.send_json::<()>(Method::POST, &format!("/repos/{repo}/actions/runs/{run_id}/{what}"), None).await.map(drop)
}

pub async fn cancel(c: &GitHubClient, repo: &str, run_id: u64) -> AppResult<()> {
    c.send_json::<()>(Method::POST, &format!("/repos/{repo}/actions/runs/{run_id}/cancel"), None).await.map(drop)
}

pub async fn set_enabled(c: &GitHubClient, repo: &str, workflow_id: u64, on: bool) -> AppResult<()> {
    let what = if on { "enable" } else { "disable" };
    c.send_json::<()>(Method::PUT, &format!("/repos/{repo}/actions/workflows/{workflow_id}/{what}"), None).await.map(drop)
}


pub async fn source(c: &GitHubClient, repo: &str, path: &str, git_ref: Option<&str>) -> AppResult<String> {
    let path = path.split('/').map(enc).collect::<Vec<_>>().join("/");
    let q = git_ref.map(|r| format!("?ref={}", enc(r))).unwrap_or_default();
    let bytes = c.get_bytes(&format!("/repos/{repo}/contents/{path}{q}"), "application/vnd.github.raw+json").await?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Step {
    pub number: u64,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Job {
    pub id: u64,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub html_url: Option<String>,
    pub runner_name: Option<String>,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub steps: Vec<Step>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Artifact {
    pub id: u64,
    pub name: String,
    pub size_in_bytes: u64,
    pub expired: bool,
    pub created_at: Option<String>,
    pub expires_at: Option<String>,
}


pub async fn jobs(c: &GitHubClient, repo: &str, run_id: u64, fresh: bool) -> AppResult<Vec<Job>> {
    c.paginate_key(&format!("/repos/{repo}/actions/runs/{run_id}/jobs?per_page=100"), "jobs", fresh).await
}


pub const LOG_TAIL: usize = 3 * 1024 * 1024;


pub async fn job_log(c: &GitHubClient, repo: &str, job_id: u64) -> AppResult<JobLog> {
    let bytes = c.get_bytes(&format!("/repos/{repo}/actions/jobs/{job_id}/logs"), "application/vnd.github+json").await?;
    Ok(tail_log(&bytes, LOG_TAIL))
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct JobLog {
    pub text: String,

    pub cut: u32,
}

pub fn tail_log(bytes: &[u8], max: usize) -> JobLog {
    if bytes.len() <= max {
        return JobLog { text: String::from_utf8_lossy(bytes).into_owned(), cut: 0 };
    }
    let mut start = bytes.len() - max;
    if let Some(nl) = bytes[start..].iter().position(|&b| b == b'\n') {
        start += nl + 1;
    }
    JobLog { text: String::from_utf8_lossy(&bytes[start..]).into_owned(), cut: start as u32 }
}

pub async fn artifacts(c: &GitHubClient, repo: &str, run_id: u64, fresh: bool) -> AppResult<Vec<Artifact>> {
    c.paginate_key(&format!("/repos/{repo}/actions/runs/{run_id}/artifacts?per_page=100"), "artifacts", fresh).await
}


pub async fn download_artifact(c: &GitHubClient, repo: &str, artifact_id: u64, dest: &std::path::Path) -> AppResult<u64> {
    use tokio::io::AsyncWriteExt;
    let rb = c.request(Method::GET, &format!("/repos/{repo}/actions/artifacts/{artifact_id}/zip")).timeout(std::time::Duration::from_secs(60 * 30));
    let mut res = c.execute(rb).await?;
    let part = dest.with_extension("zip.part");
    let mut f = tokio::fs::File::create(&part).await?;
    let mut n = 0u64;
    while let Some(chunk) = res.chunk().await? {
        f.write_all(&chunk).await?;
        n += chunk.len() as u64;
    }
    f.flush().await?;
    drop(f);
    tokio::fs::rename(&part, dest).await?;
    Ok(n)
}

pub async fn delete_run(c: &GitHubClient, repo: &str, run_id: u64) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/repos/{repo}/actions/runs/{run_id}"), None).await.map(drop)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_tail_cuts_at_a_line_start() {
        let log = b"aaaa\nbbbb\ncccc\n";
        let t = tail_log(log, 8);
        assert_eq!(t.text, "cccc\n");
        assert_eq!(t.cut, 10);
        assert_eq!(tail_log(log, 100).cut, 0);
    }
}
