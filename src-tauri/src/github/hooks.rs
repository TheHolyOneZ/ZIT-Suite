use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use specta::Type;

use super::client::GitHubClient;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
pub struct HookResponse {

    pub code: Option<u16>,

    pub status: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
pub struct Hook {
    pub id: u64,
    pub active: bool,
    pub events: Vec<String>,
    pub url: String,

    pub content_type: String,
    pub insecure_ssl: bool,

    pub has_secret: bool,
    pub created_at: String,
    pub updated_at: String,
    pub last_response: HookResponse,
}


#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
pub struct HookInput {
    pub url: String,
    pub content_type: String,

    pub secret: Option<String>,
    pub insecure_ssl: bool,
    pub events: Vec<String>,
    pub active: bool,
}


#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
pub struct HookPatch {
    pub url: Option<String>,
    pub content_type: Option<String>,
    pub secret: Option<String>,
    pub insecure_ssl: Option<bool>,
    pub events: Option<Vec<String>>,
    pub active: Option<bool>,
}

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(Value::as_str).unwrap_or_default().to_string()
}

pub fn parse_hook(v: &Value) -> Hook {
    let cfg = v.get("config").cloned().unwrap_or_default();
    let lr = v.get("last_response").cloned().unwrap_or_default();

    let insecure = match cfg.get("insecure_ssl") {
        Some(Value::String(x)) => x == "1",
        Some(Value::Number(n)) => n.as_u64() == Some(1),
        _ => false,
    };
    Hook {
        id: v.get("id").and_then(Value::as_u64).unwrap_or(0),
        active: v.get("active").and_then(Value::as_bool).unwrap_or(false),
        events: v
            .get("events")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_str).map(str::to_string).collect())
            .unwrap_or_default(),
        url: s(&cfg, "url"),
        content_type: cfg.get("content_type").and_then(Value::as_str).unwrap_or("form").to_string(),
        insecure_ssl: insecure,
        has_secret: cfg.get("secret").and_then(Value::as_str).is_some_and(|x| !x.is_empty()),
        created_at: s(v, "created_at"),
        updated_at: s(v, "updated_at"),
        last_response: HookResponse {
            code: lr.get("code").and_then(Value::as_u64).map(|c| c as u16),
            status: lr.get("status").and_then(Value::as_str).unwrap_or("unused").to_string(),
            message: lr.get("message").and_then(Value::as_str).map(str::to_string),
        },
    }
}


pub fn same_url(a: &str, b: &str) -> bool {
    let n = |x: &str| x.trim().trim_end_matches('/').to_lowercase();
    n(a) == n(b)
}

fn config_json(url: &str, content_type: &str, insecure_ssl: bool, secret: Option<&str>) -> Value {
    let mut cfg = Map::new();
    cfg.insert("url".into(), json!(url.trim()));
    cfg.insert("content_type".into(), json!(content_type));
    cfg.insert("insecure_ssl".into(), json!(if insecure_ssl { "1" } else { "0" }));
    if let Some(sec) = secret {
        cfg.insert("secret".into(), json!(sec));
    }
    Value::Object(cfg)
}


pub async fn list(c: &GitHubClient, repo: &str, fresh: bool) -> AppResult<Vec<Hook>> {
    let raw: Vec<Value> = c.paginate_with(&format!("/repos/{repo}/hooks?per_page=100"), fresh).await?;

    Ok(raw.iter().filter(|v| v.get("name").and_then(Value::as_str).unwrap_or("web") == "web").map(parse_hook).collect())
}

pub async fn get(c: &GitHubClient, repo: &str, id: u64) -> AppResult<Hook> {
    let v: Value = c.get_json(&format!("/repos/{repo}/hooks/{id}")).await?;
    Ok(parse_hook(&v))
}

pub async fn create(c: &GitHubClient, repo: &str, input: &HookInput) -> AppResult<Hook> {
    let secret = input.secret.as_deref().filter(|x| !x.is_empty());
    let body = json!({
        "name": "web",
        "active": input.active,
        "events": input.events,
        "config": config_json(&input.url, &input.content_type, input.insecure_ssl, secret),
    });
    let v = c.send_json(Method::POST, &format!("/repos/{repo}/hooks"), Some(&body)).await?;
    Ok(parse_hook(&v.unwrap_or_default()))
}


pub async fn patch(c: &GitHubClient, repo: &str, id: u64, p: &HookPatch) -> AppResult<()> {
    let mut hook = Map::new();
    if let Some(events) = &p.events {
        hook.insert("events".into(), json!(events));
    }
    if let Some(active) = p.active {
        hook.insert("active".into(), json!(active));
    }
    if !hook.is_empty() {
        c.send_json(Method::PATCH, &format!("/repos/{repo}/hooks/{id}"), Some(&Value::Object(hook))).await?;
    }
    let mut cfg = Map::new();
    if let Some(url) = &p.url {
        cfg.insert("url".into(), json!(url.trim()));
    }
    if let Some(ct) = &p.content_type {
        cfg.insert("content_type".into(), json!(ct));
    }
    if let Some(ssl) = p.insecure_ssl {
        cfg.insert("insecure_ssl".into(), json!(if ssl { "1" } else { "0" }));
    }
    if let Some(sec) = &p.secret {
        cfg.insert("secret".into(), json!(sec));
    }
    if !cfg.is_empty() {
        c.send_json(Method::PATCH, &format!("/repos/{repo}/hooks/{id}/config"), Some(&Value::Object(cfg))).await?;
    }
    Ok(())
}


pub fn effective_patch(h: &Hook, p: &HookPatch) -> HookPatch {
    let mut events_sorted = h.events.clone();
    events_sorted.sort();
    HookPatch {
        url: p.url.clone().filter(|u| u.trim() != h.url),
        content_type: p.content_type.clone().filter(|ct| *ct != h.content_type),

        secret: p.secret.clone().filter(|sec| !sec.is_empty() || h.has_secret),
        insecure_ssl: p.insecure_ssl.filter(|x| *x != h.insecure_ssl),
        events: p.events.clone().filter(|e| {
            let mut e = e.clone();
            e.sort();
            e != events_sorted
        }),
        active: p.active.filter(|a| *a != h.active),
    }
}

impl HookPatch {
    pub fn is_empty(&self) -> bool {
        *self == HookPatch::default()
    }
}

pub async fn delete(c: &GitHubClient, repo: &str, id: u64) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/repos/{repo}/hooks/{id}"), None).await?;
    Ok(())
}


pub async fn ping(c: &GitHubClient, repo: &str, id: u64) -> AppResult<()> {
    c.send_json::<()>(Method::POST, &format!("/repos/{repo}/hooks/{id}/pings"), None).await?;
    Ok(())
}


pub async fn test_push(c: &GitHubClient, repo: &str, id: u64) -> AppResult<()> {
    c.send_json::<()>(Method::POST, &format!("/repos/{repo}/hooks/{id}/tests"), None).await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Delivery {

    pub id: String,
    pub guid: String,
    pub delivered_at: String,
    pub redelivery: bool,

    pub duration: f64,

    pub status: String,

    pub status_code: u16,
    pub event: String,
    pub action: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DeliveryPage {
    pub items: Vec<Delivery>,

    pub next: Option<String>,
}

fn parse_delivery(v: &Value) -> Delivery {
    Delivery {
        id: v.get("id").and_then(Value::as_u64).map(|n| n.to_string()).unwrap_or_default(),
        guid: s(v, "guid"),
        delivered_at: s(v, "delivered_at"),
        redelivery: v.get("redelivery").and_then(Value::as_bool).unwrap_or(false),
        duration: v.get("duration").and_then(Value::as_f64).unwrap_or(0.0),
        status: s(v, "status"),
        status_code: v.get("status_code").and_then(Value::as_u64).unwrap_or(0) as u16,
        event: s(v, "event"),
        action: v.get("action").and_then(Value::as_str).map(str::to_string),
    }
}

impl Delivery {
    pub fn ok(&self) -> bool {
        (200..300).contains(&self.status_code)
    }
}


pub async fn deliveries(c: &GitHubClient, repo: &str, id: u64, page: Option<String>, per_page: u32, fresh: bool) -> AppResult<DeliveryPage> {

    let prefix = format!("/repos/{repo}/hooks/{id}/deliveries");
    let path = match page {
        Some(p) if p.starts_with(&format!("{}{prefix}", super::client::API)) => p,
        Some(_) => return Err(AppError::new("internal.bad_cursor")),
        None => format!("{prefix}?per_page={}", per_page.clamp(1, 100)),
    };
    let (body, next) = c.get_page(&path, fresh).await?;
    let items = body.as_array().map(|a| a.iter().map(parse_delivery).collect()).unwrap_or_default();
    Ok(DeliveryPage { items, next })
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Header {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DeliveryDetail {
    pub delivery: Delivery,

    pub url: String,
    pub request_headers: Vec<Header>,

    pub request_payload: String,
    pub response_headers: Vec<Header>,
    pub response_body: Option<String>,
}

fn headers(v: Option<&Value>) -> Vec<Header> {
    let mut out: Vec<Header> = v
        .and_then(Value::as_object)
        .map(|m| {
            m.iter()
                .map(|(k, v)| Header { name: k.clone(), value: v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string()) })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by_key(|h| h.name.to_lowercase());
    out
}

pub fn parse_delivery_detail(v: &Value) -> DeliveryDetail {
    let payload = match v.pointer("/request/payload") {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Null) | None => String::new(),
        Some(p) => serde_json::to_string_pretty(p).unwrap_or_default(),
    };
    let body = match v.pointer("/response/payload") {
        Some(Value::String(s)) => Some(s.clone()),
        Some(Value::Null) | None => None,
        Some(p) => Some(p.to_string()),
    };
    DeliveryDetail {
        delivery: parse_delivery(v),
        url: s(v, "url"),
        request_headers: headers(v.pointer("/request/headers")),
        request_payload: payload,
        response_headers: headers(v.pointer("/response/headers")),
        response_body: body,
    }
}


fn delivery_id(raw: &str) -> AppResult<u64> {
    raw.parse::<u64>().map_err(|_| AppError::new("internal.bad_cursor").detail(raw.to_string()))
}

pub async fn delivery(c: &GitHubClient, repo: &str, id: u64, delivery_id_raw: &str) -> AppResult<DeliveryDetail> {
    let delivery_id = delivery_id(delivery_id_raw)?;
    let v: Value = c.get_json(&format!("/repos/{repo}/hooks/{id}/deliveries/{delivery_id}")).await?;
    Ok(parse_delivery_detail(&v))
}

pub async fn redeliver(c: &GitHubClient, repo: &str, id: u64, delivery_id_raw: &str) -> AppResult<()> {
    let delivery_id = delivery_id(delivery_id_raw)?;
    c.send_json::<()>(Method::POST, &format!("/repos/{repo}/hooks/{id}/deliveries/{delivery_id}/attempts"), None).await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RepoHooks {
    pub repo: String,
    pub hooks: Vec<Hook>,
    pub error: Option<AppError>,
}

pub async fn repo_hooks(c: &GitHubClient, repo: &str, fresh: bool) -> RepoHooks {
    match list(c, repo, fresh).await {
        Ok(hooks) => RepoHooks { repo: repo.into(), hooks, error: None },
        Err(error) => RepoHooks { repo: repo.into(), hooks: vec![], error: Some(error) },
    }
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct HookHealth {
    pub repo: String,
    pub id: u64,
    pub checked: u32,
    pub failed: u32,
    pub last_failure: Option<Delivery>,
    pub last_delivery: Option<Delivery>,
    pub error: Option<AppError>,
}

pub fn summarize(repo: &str, id: u64, items: &[Delivery]) -> HookHealth {
    HookHealth {
        repo: repo.into(),
        id,
        checked: items.len() as u32,
        failed: items.iter().filter(|d| !d.ok()).count() as u32,
        last_failure: items.iter().find(|d| !d.ok()).cloned(),
        last_delivery: items.first().cloned(),
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hook() -> Hook {
        parse_hook(&json!({
            "id": 7, "name": "web", "active": true, "events": ["push", "pull_request"],
            "config": { "url": "https://ci.example.com/hook", "content_type": "json", "insecure_ssl": "0", "secret": "********" },
            "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-02T00:00:00Z",
            "last_response": { "code": 200, "status": "active", "message": "OK" }
        }))
    }

    #[test]
    fn parses_hook() {
        let h = hook();
        assert_eq!(h.id, 7);
        assert!(h.has_secret && !h.insecure_ssl);
        assert_eq!(h.content_type, "json");
        assert_eq!(h.last_response.code, Some(200));
        let unused = parse_hook(&json!({ "id": 1, "config": { "url": "x", "insecure_ssl": 1 }, "last_response": { "code": null, "status": "unused", "message": null } }));
        assert!(unused.insecure_ssl && !unused.has_secret);
        assert_eq!(unused.last_response.code, None);
        assert_eq!(unused.content_type, "form");
    }

    #[test]
    fn url_matching() {
        assert!(same_url("https://CI.example.com/hook/", " https://ci.example.com/hook"));
        assert!(!same_url("https://ci.example.com/hook", "https://ci.example.com/hook2"));
    }

    #[test]
    fn effective_patch_drops_unchanged_fields() {
        let h = hook();
        let p = HookPatch { events: Some(vec!["pull_request".into(), "push".into()]), active: Some(true), content_type: Some("json".into()), ..Default::default() };
        assert!(effective_patch(&h, &p).is_empty());
        let p = HookPatch { active: Some(false), ..Default::default() };
        assert_eq!(effective_patch(&h, &p).active, Some(false));

        let mut no_secret = hook();
        no_secret.has_secret = false;
        assert!(effective_patch(&no_secret, &HookPatch { secret: Some(String::new()), ..Default::default() }).is_empty());
        assert!(!effective_patch(&no_secret, &HookPatch { secret: Some("s".into()), ..Default::default() }).is_empty());
    }

    #[test]
    fn delivery_detail_pretty_prints_payload() {
        let d = parse_delivery_detail(&json!({
            "id": 1, "guid": "g", "delivered_at": "t", "redelivery": false, "duration": 0.31, "status": "Invalid HTTP Response: 404",
            "status_code": 404, "event": "ping", "action": null, "url": "https://x",
            "request": { "headers": { "X-GitHub-Event": "ping", "Accept": "*/*" }, "payload": { "zen": "Keep it simple." } },
            "response": { "headers": { "Content-Type": "text/html" }, "payload": "<h1>nope</h1>" }
        }));
        assert!(!d.delivery.ok());
        assert_eq!(d.delivery.id, "1");
        assert_eq!(d.request_headers[0].name, "Accept");
        assert!(d.request_payload.contains("\"zen\": \"Keep it simple.\""));
        assert_eq!(d.response_body.as_deref(), Some("<h1>nope</h1>"));
    }

    #[test]
    fn delivery_ids_survive_beyond_2_pow_53() {
        let d = parse_delivery(&json!({ "id": 3846290009938198563u64, "status_code": 200 }));
        assert_eq!(d.id, "3846290009938198563");
        assert_eq!(delivery_id("3846290009938198563").unwrap(), 3846290009938198563);
        assert!(delivery_id("1/../../x").is_err());
    }

    #[test]
    fn health_summary() {
        let mk = |code: u16| Delivery { id: code.to_string(), guid: String::new(), delivered_at: String::new(), redelivery: false, duration: 0.0, status: String::new(), status_code: code, event: "push".into(), action: None };
        let h = summarize("o/r", 1, &[mk(200), mk(500), mk(0), mk(204)]);
        assert_eq!((h.checked, h.failed), (4, 2));
        assert_eq!(h.last_failure.unwrap().status_code, 500);
        assert_eq!(h.last_delivery.unwrap().status_code, 200);
    }
}
