use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;

use super::client::GitHubClient;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TrafficDay {

    pub day: String,
    pub count: u32,
    pub uniques: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TrafficSource {
    pub name: String,
    pub count: u32,
    pub uniques: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Traffic {
    pub repo: String,
    pub views: u32,
    pub view_uniques: u32,
    pub clones: u32,
    pub clone_uniques: u32,
    pub views_daily: Vec<TrafficDay>,
    pub clones_daily: Vec<TrafficDay>,
    pub referrers: Vec<TrafficSource>,
    pub paths: Vec<TrafficSource>,
    pub error: Option<AppError>,
}

fn days(v: &Value, key: &str) -> Vec<TrafficDay> {
    v.get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|d| TrafficDay {
            day: d.get("timestamp").and_then(Value::as_str).unwrap_or_default().chars().take(10).collect(),
            count: d.get("count").and_then(Value::as_u64).unwrap_or(0) as u32,
            uniques: d.get("uniques").and_then(Value::as_u64).unwrap_or(0) as u32,
        })
        .collect()
}

fn sources(v: &Value, name_key: &str) -> Vec<TrafficSource> {
    v.as_array()
        .into_iter()
        .flatten()
        .map(|s| TrafficSource {
            name: s.get(name_key).and_then(Value::as_str).unwrap_or_default().to_string(),
            count: s.get("count").and_then(Value::as_u64).unwrap_or(0) as u32,
            uniques: s.get("uniques").and_then(Value::as_u64).unwrap_or(0) as u32,
        })
        .collect()
}

pub async fn get(c: &GitHubClient, repo: &str, fresh: bool) -> Traffic {
    let mut t = Traffic { repo: repo.into(), views: 0, view_uniques: 0, clones: 0, clone_uniques: 0, views_daily: vec![], clones_daily: vec![], referrers: vec![], paths: vec![], error: None };
    let base = format!("/repos/{repo}/traffic");
    match c.get_page(&format!("{base}/views"), fresh).await {
        Ok((v, _)) => {
            t.views = v.get("count").and_then(Value::as_u64).unwrap_or(0) as u32;
            t.view_uniques = v.get("uniques").and_then(Value::as_u64).unwrap_or(0) as u32;
            t.views_daily = days(&v, "views");
        }
        Err(e) => {
            t.error = Some(e);
            return t;
        }
    }
    if let Ok((v, _)) = c.get_page(&format!("{base}/clones"), fresh).await {
        t.clones = v.get("count").and_then(Value::as_u64).unwrap_or(0) as u32;
        t.clone_uniques = v.get("uniques").and_then(Value::as_u64).unwrap_or(0) as u32;
        t.clones_daily = days(&v, "clones");
    }

    if t.views > 0 {
        if let Ok((v, _)) = c.get_page(&format!("{base}/popular/referrers"), fresh).await {
            t.referrers = sources(&v, "referrer");
        }
        if let Ok((v, _)) = c.get_page(&format!("{base}/popular/paths"), fresh).await {
            t.paths = sources(&v, "path");
        }
    }
    t
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_days_and_sources() {
        let d = days(&json!({ "views": [{ "timestamp": "2026-10-01T00:00:00Z", "count": 5, "uniques": 2 }] }), "views");
        assert_eq!((d[0].day.as_str(), d[0].count, d[0].uniques), ("2026-10-01", 5, 2));
        let s = sources(&json!([{ "referrer": "github.com", "count": 9, "uniques": 3 }]), "referrer");
        assert_eq!((s[0].name.as_str(), s[0].count), ("github.com", 9));
    }
}
