use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;

use super::client::GitHubClient;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ContributorStat {
    pub login: String,
    pub avatar_url: String,
    pub commits: u32,
    pub additions: f64,
    pub deletions: f64,

    pub first_week: Option<f64>,
    pub last_week: Option<f64>,

    pub weekly: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ContributorStats {

    pub pending: bool,

    pub contributors: Vec<ContributorStat>,

    pub week_starts: Vec<f64>,
}

const WEEKS: usize = 52;
const WEEK: f64 = 7.0 * 86_400.0;

pub fn parse(v: &Value) -> Option<Vec<ContributorStat>> {
    let list = v.as_array()?;
    let mut out: Vec<ContributorStat> = list
        .iter()
        .map(|c| {
            let weeks = c.get("weeks").and_then(Value::as_array).cloned().unwrap_or_default();
            let n = |w: &Value, k: &str| w.get(k).and_then(Value::as_f64).unwrap_or(0.0);
            let active: Vec<&Value> = weeks.iter().filter(|w| n(w, "c") > 0.0).collect();
            ContributorStat {
                login: c.pointer("/author/login").and_then(Value::as_str).unwrap_or("ghost").to_string(),
                avatar_url: c.pointer("/author/avatar_url").and_then(Value::as_str).unwrap_or_default().to_string(),
                commits: c.get("total").and_then(Value::as_u64).unwrap_or(0) as u32,
                additions: weeks.iter().map(|w| n(w, "a")).sum(),
                deletions: weeks.iter().map(|w| n(w, "d")).sum(),
                first_week: active.first().map(|w| n(w, "w")),
                last_week: active.last().map(|w| n(w, "w")),

                weekly: {
                    let mut v: Vec<u32> = weeks.iter().rev().take(WEEKS).rev().map(|w| n(w, "c") as u32).collect();
                    let mut padded = vec![0; WEEKS - v.len()];
                    padded.append(&mut v);
                    padded
                },
            }
        })
        .collect();
    out.sort_by(|a, b| b.commits.cmp(&a.commits).then(a.login.cmp(&b.login)));
    Some(out)
}


pub fn week_starts(v: &Value) -> Vec<f64> {
    let last = v
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|c| c.get("weeks")?.as_array()?.last()?.get("w")?.as_f64())
        .fold(None, |m: Option<f64>, w| Some(m.map_or(w, |m| m.max(w))));
    match last {
        Some(l) => (0..WEEKS).map(|i| l - (WEEKS - 1 - i) as f64 * WEEK).collect(),
        None => vec![],
    }
}

pub async fn contributors(c: &GitHubClient, repo: &str) -> AppResult<ContributorStats> {
    for attempt in 0..4u64 {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(1500 * attempt)).await;
        }
        let v: Value = c.get_json(&format!("/repos/{repo}/stats/contributors")).await?;
        if let Some(list) = parse(&v) {
            return Ok(ContributorStats { pending: false, contributors: list, week_starts: week_starts(&v) });
        }
    }
    Ok(ContributorStats { pending: true, contributors: vec![], week_starts: vec![] })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_and_detects_pending() {
        assert!(parse(&json!({})).is_none());
        let v = json!([
            { "total": 1, "author": { "login": "b", "avatar_url": "" }, "weeks": [{ "w": 100, "a": 5, "d": 1, "c": 1 }] },
            { "total": 3, "author": null, "weeks": [{ "w": 100, "a": 0, "d": 0, "c": 0 }, { "w": 200, "a": 10, "d": 2, "c": 3 }] }
        ]);
        let s = parse(&v).unwrap();
        assert_eq!(s[0].login, "ghost");
        assert_eq!((s[0].commits, s[0].additions, s[0].first_week), (3, 10.0, Some(200.0)));
        assert_eq!((s[0].weekly.len(), &s[0].weekly[50..]), (52, &[0, 3][..]));
        assert_eq!(s[1].deletions, 1.0);
        let w = week_starts(&v);
        assert_eq!((w.len(), w[51], w[50]), (52, 200.0, 200.0 - WEEK));
    }
}
