use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use reqwest::header::{HeaderMap, ACCEPT, AUTHORIZATION, ETAG, IF_NONE_MATCH, LINK, USER_AGENT};
use reqwest::{Method, RequestBuilder, Response, StatusCode};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;

use crate::error::{AppError, AppResult};

pub const API: &str = "https://api.github.com";
const UA: &str = concat!("ZIT-Suite/", env!("CARGO_PKG_VERSION"));
const MAX_RETRY_WAIT_SECS: u64 = 60;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RateLimit {

    pub resource: String,
    pub limit: u32,
    pub remaining: u32,

    pub reset: u32,
}

type CachedPage = (String, Value, Option<String>);

#[derive(Clone)]
pub struct GitHubClient {
    http: reqwest::Client,
    token: Arc<String>,

    etags: Arc<Mutex<HashMap<String, CachedPage>>>,

    rate: Arc<Mutex<HashMap<String, RateLimit>>>,

    dirty: Arc<AtomicBool>,
}


#[derive(Serialize, Deserialize)]
pub struct DiskEntry {
    pub url: String,
    pub etag: String,
    pub body: Value,
    pub next: Option<String>,
    pub saved: i64,
}


fn persistable(url: &str) -> bool {
    !url.contains("/secret-scanning/")
}

impl GitHubClient {
    pub fn new(token: String) -> AppResult<Self> {
        let http = reqwest::Client::builder()
            .user_agent(UA)
            .timeout(Duration::from_secs(60))
            .build()?;
        Ok(Self {
            http,
            token: Arc::new(token),
            etags: Arc::default(),
            rate: Arc::default(),
            dirty: Arc::default(),
        })
    }


    pub fn take_dirty_cache(&self) -> Option<Vec<DiskEntry>> {
        if !self.dirty.swap(false, Ordering::Relaxed) {
            return None;
        }
        let now = chrono::Utc::now().timestamp();
        Some(
            self.etags
                .lock()
                .unwrap()
                .iter()
                .filter(|(url, _)| persistable(url))
                .map(|(url, (etag, body, next))| DiskEntry { url: url.clone(), etag: etag.clone(), body: body.clone(), next: next.clone(), saved: now })
                .collect(),
        )
    }


    pub fn load_cache(&self, entries: Vec<DiskEntry>, max_age_secs: i64) {
        let now = chrono::Utc::now().timestamp();
        let mut map = self.etags.lock().unwrap();
        for e in entries.into_iter().filter(|e| now - e.saved <= max_age_secs && persistable(&e.url)) {
            map.entry(e.url).or_insert((e.etag, e.body, e.next));
        }
    }


    pub(crate) fn token(&self) -> &str {
        &self.token
    }


    pub fn rate_limits(&self) -> Vec<RateLimit> {
        let mut v: Vec<RateLimit> = self.rate.lock().unwrap().values().cloned().collect();
        v.sort_by_key(|r| (r.resource != "core", r.resource.clone()));
        v
    }

    fn url(path: &str) -> String {
        if path.starts_with("http") {
            path.to_string()
        } else {
            format!("{API}{path}")
        }
    }

    pub fn request(&self, method: Method, path: &str) -> RequestBuilder {
        self.http
            .request(method, Self::url(path))
            .header(AUTHORIZATION, format!("Bearer {}", self.token))
            .header(ACCEPT, "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header(USER_AGENT, UA)
    }


    pub async fn execute(&self, rb: RequestBuilder) -> AppResult<Response> {
        let retry = rb.try_clone();
        let res = rb.send().await?;
        self.record_rate(res.headers());

        if let Some(wait) = retry_after(&res) {
            if let Some(retry) = retry {
                tokio::time::sleep(Duration::from_secs(wait)).await;
                let res = retry.send().await?;
                self.record_rate(res.headers());
                return check(res).await;
            }
        }
        check(res).await
    }

    fn record_rate(&self, h: &HeaderMap) {
        let num = |k: &str| h.get(k).and_then(|v| v.to_str().ok()).and_then(|v| v.parse::<u32>().ok());
        if let (Some(limit), Some(remaining), Some(reset)) =
            (num("x-ratelimit-limit"), num("x-ratelimit-remaining"), num("x-ratelimit-reset"))
        {
            let resource = h.get("x-ratelimit-resource").and_then(|v| v.to_str().ok()).unwrap_or("core").to_string();
            let mut rate = self.rate.lock().unwrap();
            let next = merge_rate(rate.get(&resource), RateLimit { resource: resource.clone(), limit, remaining, reset });
            rate.insert(resource, next);
        }
    }

    pub async fn get_json_query<T: DeserializeOwned>(&self, path: &str, query: &[(&str, String)]) -> AppResult<T> {
        let res = self.execute(self.request(Method::GET, path).query(query)).await?;
        Ok(res.json().await?)
    }


    pub async fn get_json_accept<T: DeserializeOwned>(&self, path: &str, query: &[(&str, String)], accept: &str) -> AppResult<T> {
        let rb = self
            .http
            .request(Method::GET, Self::url(path))
            .header(AUTHORIZATION, format!("Bearer {}", self.token))
            .header(ACCEPT, accept)
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header(USER_AGENT, UA)
            .query(query);
        Ok(self.execute(rb).await?.json().await?)
    }

    pub async fn get_json<T: DeserializeOwned>(&self, path: &str) -> AppResult<T> {
        let res = self.execute(self.request(Method::GET, path)).await?;
        Ok(res.json().await?)
    }


    async fn get_cached(&self, url: &str, fresh: bool) -> AppResult<(Value, Option<String>)> {
        let mut rb = self.request(Method::GET, url);
        let cached = if fresh { None } else { self.etags.lock().unwrap().get(url).cloned() };
        if let Some((etag, _, _)) = &cached {
            rb = rb.header(IF_NONE_MATCH, etag);
        }
        let res = rb.send().await?;
        self.record_rate(res.headers());

        if res.status() == StatusCode::NOT_MODIFIED {
            if let Some((_, body, next)) = cached {
                return Ok((body, next));
            }
        }
        let res = check(res).await?;
        let next = res
            .headers()
            .get(LINK)
            .and_then(|v| v.to_str().ok())
            .and_then(parse_next_link);
        let etag = res.headers().get(ETAG).and_then(|v| v.to_str().ok()).map(str::to_string);
        let body: Value = res.json().await?;
        if let Some(etag) = etag {
            self.etags.lock().unwrap().insert(url.to_string(), (etag, body.clone(), next.clone()));
            self.dirty.store(true, Ordering::Relaxed);
        }
        Ok((body, next))
    }


    pub async fn get_page(&self, path: &str, fresh: bool) -> AppResult<(Value, Option<String>)> {
        self.get_cached(&Self::url(path), fresh).await
    }


    pub async fn paginate<T: DeserializeOwned>(&self, path: &str) -> AppResult<Vec<T>> {
        self.paginate_with(path, false).await
    }


    pub async fn paginate_with<T: DeserializeOwned>(&self, path: &str, fresh: bool) -> AppResult<Vec<T>> {
        let mut out = Vec::new();
        let mut next = Some(Self::url(path));
        while let Some(url) = next {
            let (body, n) = self.get_cached(&url, fresh).await?;
            let page: Vec<T> = serde_json::from_value(body)?;
            out.extend(page);
            next = n;
        }
        Ok(out)
    }


    pub async fn paginate_key<T: DeserializeOwned>(&self, path: &str, key: &str, fresh: bool) -> AppResult<Vec<T>> {
        let mut out = Vec::new();
        let mut next = Some(Self::url(path));
        while let Some(url) = next {
            let (mut body, n) = self.get_cached(&url, fresh).await?;
            let items = body.get_mut(key).map(Value::take).unwrap_or(Value::Array(vec![]));
            out.extend(serde_json::from_value::<Vec<T>>(items)?);
            next = n;
        }
        Ok(out)
    }


    pub async fn send_json<B: Serialize + ?Sized>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
    ) -> AppResult<Option<Value>> {
        let mut rb = self.request(method, path);
        if let Some(b) = body {
            rb = rb.json(b);
        }
        let res = self.execute(rb).await?;
        if res.status() == StatusCode::NO_CONTENT {
            return Ok(None);
        }
        let bytes = res.bytes().await?;
        if bytes.is_empty() {
            return Ok(None);
        }
        Ok(Some(serde_json::from_slice(&bytes)?))
    }


    pub async fn graphql(&self, query: &str, variables: Value) -> AppResult<Value> {
        let body = serde_json::json!({ "query": query, "variables": variables });
        let res = self.execute(self.request(Method::POST, "/graphql").json(&body)).await?;
        let mut v: Value = res.json().await?;
        if let Some(errs) = v.get("errors").and_then(Value::as_array).filter(|e| !e.is_empty()) {
            let msg = errs.iter().filter_map(|e| e.get("message").and_then(Value::as_str)).collect::<Vec<_>>().join("; ");
            let code = if errs.iter().any(|e| e.get("type").and_then(Value::as_str) == Some("RATE_LIMITED")) {
                "github.rate_limited"
            } else if errs.iter().any(|e| e.get("type").and_then(Value::as_str) == Some("NOT_FOUND")) {
                "github.not_found"
            } else {
                "github.graphql"
            };
            return Err(AppError::new(code).detail(msg));
        }
        Ok(v.get_mut("data").map(Value::take).unwrap_or(Value::Null))
    }


    pub async fn graphql_lenient(&self, query: &str, variables: Value) -> AppResult<Value> {
        let body = serde_json::json!({ "query": query, "variables": variables });
        let res = self.execute(self.request(Method::POST, "/graphql").json(&body)).await?;
        let mut v: Value = res.json().await?;
        match v.get_mut("data").map(Value::take) {
            Some(d) if !d.is_null() => Ok(d),
            _ => Err(AppError::new("github.graphql").detail(v["errors"][0]["message"].as_str().unwrap_or_default().to_string())),
        }
    }


    pub async fn get_bytes(&self, path: &str, accept: &str) -> AppResult<Vec<u8>> {
        let rb = self.request(Method::GET, path).header(ACCEPT, accept);
        let res = self.execute(rb).await?;
        Ok(res.bytes().await?.to_vec())
    }
}


pub fn enc(segment: &str) -> String {
    let mut out = String::with_capacity(segment.len());
    for b in segment.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}


pub fn merge_rate(current: Option<&RateLimit>, incoming: RateLimit) -> RateLimit {
    match current {
        Some(c) if incoming.reset < c.reset => c.clone(),
        Some(c) if incoming.reset == c.reset => RateLimit { remaining: incoming.remaining.min(c.remaining), ..incoming },
        _ => incoming,
    }
}


fn retry_after(res: &Response) -> Option<u64> {
    let s = res.status();
    if s != StatusCode::TOO_MANY_REQUESTS && s != StatusCode::FORBIDDEN {
        return None;
    }
    res.headers()
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .filter(|w| *w <= MAX_RETRY_WAIT_SECS)
}

async fn check(res: Response) -> AppResult<Response> {
    let status = res.status();
    if status.is_success() {
        return Ok(res);
    }
    let remaining_zero = res
        .headers()
        .get("x-ratelimit-remaining")
        .and_then(|v| v.to_str().ok())
        == Some("0");
    let message = res
        .json::<Value>()
        .await
        .ok()
        .and_then(|v| v.get("message").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_default();
    Err(map_status(status, remaining_zero, &message).detail(message).status(status.as_u16()))
}

pub fn map_status(status: StatusCode, remaining_zero: bool, message: &str) -> AppError {
    let code = match status.as_u16() {
        401 => "github.unauthorized",
        403 if remaining_zero || message.to_lowercase().contains("rate limit") => "github.rate_limited",
        429 => "github.rate_limited",
        403 => "github.forbidden",
        404 => "github.not_found",
        409 => "github.conflict",
        422 => "github.validation",
        500..=599 => "github.server",
        _ => "github.http",
    };
    AppError::new(code)
}


pub fn parse_next_link(header: &str) -> Option<String> {
    header.split(',').find_map(|part| {
        let mut segs = part.split(';');
        let url = segs.next()?.trim().strip_prefix('<')?.strip_suffix('>')?;
        segs.any(|s| s.trim() == r#"rel="next""#).then(|| url.to_string())
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn cache_saves_and_restores_without_secrets() {
        let c = super::GitHubClient::new("t".into()).unwrap();
        assert!(c.take_dirty_cache().is_none(), "nothing to save yet");
        c.etags.lock().unwrap().insert("https://api.github.com/user/repos".into(), ("e1".into(), serde_json::json!([1]), None));
        c.etags.lock().unwrap().insert("https://api.github.com/repos/o/r/secret-scanning/alerts".into(), ("e2".into(), serde_json::json!([{ "secret": "ghp_x" }]), None));
        c.dirty.store(true, std::sync::atomic::Ordering::Relaxed);
        let saved = c.take_dirty_cache().unwrap();
        assert_eq!(saved.len(), 1, "secret-scanning answers never go to disk");
        assert!(c.take_dirty_cache().is_none(), "clean after saving");
        let json = serde_json::to_vec(&saved).unwrap();
        let fresh = super::GitHubClient::new("t".into()).unwrap();
        let mut entries: Vec<super::DiskEntry> = serde_json::from_slice(&json).unwrap();
        entries.push(super::DiskEntry { url: "https://api.github.com/old".into(), etag: "x".into(), body: serde_json::json!(null), next: None, saved: 0 });
        fresh.load_cache(entries, 3600);
        let map = fresh.etags.lock().unwrap();
        assert_eq!(map.len(), 1, "expired entry skipped");
        assert_eq!(map["https://api.github.com/user/repos"].0, "e1");
    }

    use super::*;

    #[test]
    fn parses_next_link() {
        let h = r#"<https://api.github.com/user/repos?page=2>; rel="next", <https://api.github.com/user/repos?page=5>; rel="last""#;
        assert_eq!(parse_next_link(h).as_deref(), Some("https://api.github.com/user/repos?page=2"));
    }

    #[test]
    fn parses_real_github_header() {
        let h = r#"<https://api.github.com/user/repos?per_page=100&affiliation=owner%2Ccollaborator%2Corganization_member&page=2>; rel="next", <https://api.github.com/user/repos?per_page=100&affiliation=owner%2Ccollaborator%2Corganization_member&page=3>; rel="last""#;
        assert!(parse_next_link(h).unwrap().ends_with("page=2"));
    }

    #[test]
    fn no_next_on_last_page() {
        let h = r#"<https://api.github.com/user/repos?page=1>; rel="prev", <https://api.github.com/user/repos?page=1>; rel="first""#;
        assert_eq!(parse_next_link(h), None);
    }

    #[test]
    fn encodes_path_segments() {
        assert_eq!(enc("good first issue"), "good%20first%20issue");
        assert_eq!(enc("a/b"), "a%2Fb");
        assert_eq!(enc("bug"), "bug");
        assert_eq!(enc("✨"), "%E2%9C%A8");
    }

    #[test]
    fn rate_display_is_monotonic_per_window() {
        let r = |remaining, reset| RateLimit { resource: "core".into(), limit: 5000, remaining, reset };
        let cur = r(4577, 100);
        assert_eq!(merge_rate(Some(&cur), r(4721, 100)).remaining, 4577, "same window: keep the lower count");
        assert_eq!(merge_rate(Some(&cur), r(4999, 50)).remaining, 4577, "older window is ignored");
        assert_eq!(merge_rate(Some(&cur), r(4990, 200)).remaining, 4990, "new window replaces");
        assert_eq!(merge_rate(None, r(1, 1)).remaining, 1);
    }

    #[test]
    fn maps_statuses() {
        assert_eq!(map_status(StatusCode::FORBIDDEN, true, "").code, "github.rate_limited");
        assert_eq!(map_status(StatusCode::FORBIDDEN, false, "API rate limit exceeded").code, "github.rate_limited");
        assert_eq!(map_status(StatusCode::FORBIDDEN, false, "Must have admin rights").code, "github.forbidden");
        assert_eq!(map_status(StatusCode::NOT_FOUND, false, "").code, "github.not_found");
        assert_eq!(map_status(StatusCode::BAD_GATEWAY, false, "").code, "github.server");
    }
}
