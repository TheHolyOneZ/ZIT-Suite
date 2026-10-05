use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;

use super::client::GitHubClient;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Critical,
    High,
    Medium,
    Low,
    Unknown,
}

impl Severity {
    fn parse(s: Option<&str>) -> Self {
        match s.map(str::to_ascii_lowercase).as_deref() {
            Some("critical") => Self::Critical,
            Some("high" | "error") => Self::High,
            Some("medium" | "moderate" | "warning") => Self::Medium,
            Some("low" | "note") => Self::Low,
            _ => Self::Unknown,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AlertKind {

    Dependency,

    Code,

    Secret,
}

impl AlertKind {
    fn path(self) -> &'static str {
        match self {
            Self::Dependency => "dependabot/alerts",
            Self::Code => "code-scanning/alerts",
            Self::Secret => "secret-scanning/alerts",
        }
    }


    pub fn reasons(self) -> &'static [&'static str] {
        match self {
            Self::Dependency => &["fix_started", "inaccurate", "no_bandwidth", "not_used", "tolerable_risk"],
            Self::Code => &["false positive", "won't fix", "used in tests"],
            Self::Secret => &["false_positive", "wont_fix", "revoked", "used_in_tests"],
        }
    }
}


#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
pub struct Alert {
    pub kind: AlertKind,
    pub number: u32,

    pub state: String,
    pub severity: Severity,

    pub key: String,
    pub title: String,
    pub description: Option<String>,
    pub package: Option<String>,
    pub ecosystem: Option<String>,

    pub location: Option<String>,
    pub vulnerable_range: Option<String>,
    pub patched: Option<String>,
    pub ghsa: Option<String>,
    pub cve: Option<String>,
    pub cvss: Option<f64>,
    pub tool: Option<String>,

    pub validity: Option<String>,
    pub push_protection_bypassed: bool,
    pub reason: Option<String>,
    pub comment: Option<String>,
    pub html_url: String,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub closed_at: Option<String>,
}

fn s(v: &Value, ptr: &str) -> Option<String> {
    v.pointer(ptr).and_then(Value::as_str).filter(|x| !x.is_empty()).map(str::to_string)
}

impl Alert {
    fn base(kind: AlertKind, v: &Value) -> Self {
        Alert {
            kind,
            number: v.get("number").and_then(Value::as_u64).unwrap_or(0) as u32,
            state: s(v, "/state").unwrap_or_else(|| "open".into()),
            severity: Severity::Unknown,
            key: String::new(),
            title: String::new(),
            description: None,
            package: None,
            ecosystem: None,
            location: None,
            vulnerable_range: None,
            patched: None,
            ghsa: None,
            cve: None,
            cvss: None,
            tool: None,
            validity: None,
            push_protection_bypassed: false,
            reason: None,
            comment: None,
            html_url: s(v, "/html_url").unwrap_or_default(),
            created_at: s(v, "/created_at").unwrap_or_default(),
            updated_at: s(v, "/updated_at"),
            closed_at: None,
        }
    }

    pub fn from_dependabot(v: &Value) -> Self {
        let ghsa = s(v, "/security_advisory/ghsa_id");
        let package = s(v, "/dependency/package/name");
        Alert {
            severity: Severity::parse(v.pointer("/security_vulnerability/severity").or(v.pointer("/security_advisory/severity")).and_then(Value::as_str)),
            key: ghsa.clone().unwrap_or_else(|| format!("dep:{}", package.clone().unwrap_or_default())),
            title: s(v, "/security_advisory/summary").unwrap_or_default(),
            description: s(v, "/security_advisory/description"),
            package,
            ecosystem: s(v, "/dependency/package/ecosystem"),
            location: s(v, "/dependency/manifest_path"),
            vulnerable_range: s(v, "/security_vulnerability/vulnerable_version_range"),
            patched: s(v, "/security_vulnerability/first_patched_version/identifier"),
            ghsa,
            cve: s(v, "/security_advisory/cve_id"),
            cvss: v.pointer("/security_advisory/cvss/score").and_then(Value::as_f64).filter(|x| *x > 0.0),
            reason: s(v, "/dismissed_reason"),
            comment: s(v, "/dismissed_comment"),
            closed_at: s(v, "/dismissed_at").or_else(|| s(v, "/fixed_at")).or_else(|| s(v, "/auto_dismissed_at")),
            ..Self::base(AlertKind::Dependency, v)
        }
    }

    pub fn from_code(v: &Value) -> Self {
        let path = s(v, "/most_recent_instance/location/path");
        let line = v.pointer("/most_recent_instance/location/start_line").and_then(Value::as_u64);
        Alert {
            severity: Severity::parse(
                v.pointer("/rule/security_severity_level").and_then(Value::as_str).or(v.pointer("/rule/severity").and_then(Value::as_str)),
            ),
            key: s(v, "/rule/id").unwrap_or_default(),
            title: s(v, "/rule/description").or_else(|| s(v, "/rule/name")).unwrap_or_default(),
            description: s(v, "/most_recent_instance/message/text"),
            location: path.map(|p| match line {
                Some(l) => format!("{p}:{l}"),
                None => p,
            }),
            tool: s(v, "/tool/name"),
            reason: s(v, "/dismissed_reason"),
            comment: s(v, "/dismissed_comment"),
            closed_at: s(v, "/dismissed_at").or_else(|| s(v, "/fixed_at")),
            ..Self::base(AlertKind::Code, v)
        }
    }


    pub fn from_secret(v: &Value) -> Self {
        let validity = s(v, "/validity");
        Alert {

            severity: if validity.as_deref() == Some("active") { Severity::Critical } else { Severity::High },
            key: s(v, "/secret_type").unwrap_or_default(),
            title: s(v, "/secret_type_display_name").or_else(|| s(v, "/secret_type")).unwrap_or_default(),
            validity,
            push_protection_bypassed: v.get("push_protection_bypassed").and_then(Value::as_bool).unwrap_or(false),
            reason: s(v, "/resolution"),
            comment: s(v, "/resolution_comment"),
            closed_at: s(v, "/resolved_at"),
            ..Self::base(AlertKind::Secret, v)
        }
    }
}


#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Feature {
    DependabotAlerts,
    SecurityUpdates,
    SecretScanning,
    PushProtection,
    PrivateReporting,

    CodeScanning,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FeatureState {
    On,
    Off,

    Unavailable,
}

impl FeatureState {
    fn from_bool(on: bool) -> Self {
        if on { Self::On } else { Self::Off }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
pub struct Posture {
    pub dependabot_alerts: FeatureState,
    pub security_updates: FeatureState,
    pub secret_scanning: FeatureState,
    pub push_protection: FeatureState,
    pub private_reporting: FeatureState,
    pub code_scanning: FeatureState,
}

impl Posture {
    pub fn get(&self, f: Feature) -> FeatureState {
        match f {
            Feature::DependabotAlerts => self.dependabot_alerts,
            Feature::SecurityUpdates => self.security_updates,
            Feature::SecretScanning => self.secret_scanning,
            Feature::PushProtection => self.push_protection,
            Feature::PrivateReporting => self.private_reporting,
            Feature::CodeScanning => self.code_scanning,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RepoSecurity {
    pub repo: String,
    pub private: bool,
    pub archived: bool,
    pub posture: Posture,

    pub alerts: Vec<Alert>,

    pub partial: Vec<AlertKind>,
    pub error: Option<AppError>,
}


fn sa_status(repo: &Value, name: &str) -> Option<bool> {
    repo.pointer(&format!("/security_and_analysis/{name}/status")).and_then(Value::as_str).map(|s| s == "enabled")
}


const NEGATIVE_TTL: Duration = Duration::from_secs(30 * 60);

fn negative() -> &'static Mutex<HashMap<String, (Instant, AppError)>> {
    static CACHE: OnceLock<Mutex<HashMap<String, (Instant, AppError)>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}


async fn remembering<T, F>(path: &str, fresh: bool, fetch: F) -> AppResult<T>
where
    F: std::future::Future<Output = AppResult<T>>,
{
    if !fresh {
        if let Some((at, e)) = negative().lock().unwrap().get(path) {
            if at.elapsed() < NEGATIVE_TTL {
                return Err(e.clone());
            }
        }
    }
    let res = fetch.await;
    let mut cache = negative().lock().unwrap();
    match &res {
        Err(e) if e.code == "github.not_found" || e.code == "github.forbidden" => {
            cache.insert(path.to_string(), (Instant::now(), e.clone()));
        }
        _ => {
            cache.remove(path);
        }
    }
    res
}


pub fn forget(repo: &str) {
    let prefix = format!("/repos/{repo}/");
    negative().lock().unwrap().retain(|k, _| !k.starts_with(&prefix));
}

fn is_disabled_msg(e: &AppError) -> bool {
    e.detail.as_deref().is_some_and(|d| d.to_lowercase().contains("disabled"))
}


async fn list_alerts(c: &GitHubClient, repo: &str, kind: AlertKind, closed: bool, fresh: bool) -> AppResult<Option<Vec<Alert>>> {
    let state = if closed { "" } else { "&state=open" };
    let path = format!("/repos/{repo}/{}?per_page=100{state}", kind.path());
    let res: AppResult<Vec<Value>> = remembering(&path, fresh, c.paginate_with(&path, fresh)).await;
    match res {
        Ok(items) => Ok(Some(
            items
                .iter()
                .map(|v| match kind {
                    AlertKind::Dependency => Alert::from_dependabot(v),
                    AlertKind::Code => Alert::from_code(v),
                    AlertKind::Secret => Alert::from_secret(v),
                })
                .collect(),
        )),

        Err(e) if e.code == "github.not_found" || (e.code == "github.forbidden" && is_disabled_msg(&e)) => Ok(None),
        Err(e) => Err(e),
    }
}

async fn get_value(c: &GitHubClient, path: &str, fresh: bool) -> AppResult<Value> {
    Ok(remembering(path, fresh, c.get_page(path, fresh)).await?.0)
}


pub async fn scan_repo(c: &GitHubClient, repo: &str, closed: bool, fresh: bool) -> RepoSecurity {
    match scan_inner(c, repo, Some(closed), fresh).await {
        Ok(r) => r,
        Err(error) => RepoSecurity {
            repo: repo.into(),
            private: false,
            archived: false,
            posture: Posture {
                dependabot_alerts: FeatureState::Unavailable,
                security_updates: FeatureState::Unavailable,
                secret_scanning: FeatureState::Unavailable,
                push_protection: FeatureState::Unavailable,
                private_reporting: FeatureState::Unavailable,
                code_scanning: FeatureState::Unavailable,
            },
            alerts: vec![],
            partial: vec![],
            error: Some(error),
        },
    }
}


async fn scan_inner(c: &GitHubClient, repo: &str, alerts_mode: Option<bool>, fresh: bool) -> AppResult<RepoSecurity> {
    use FeatureState::*;
    let info = get_value(c, &format!("/repos/{repo}"), fresh).await?;
    let private = info.get("private").and_then(Value::as_bool).unwrap_or(false);
    let archived = info.get("archived").and_then(Value::as_bool).unwrap_or(false);
    let mut alerts = Vec::new();
    let mut partial = Vec::new();

    let closed = alerts_mode.unwrap_or(false);

    let dep = match alerts_mode {
        Some(_) => list_alerts(c, repo, AlertKind::Dependency, closed, fresh).await,
        None => match get_value(c, &format!("/repos/{repo}/dependabot/alerts?per_page=1"), fresh).await {
            Ok(_) => Ok(Some(vec![])),
            Err(e) if e.code == "github.forbidden" && is_disabled_msg(&e) => Ok(None),
            Err(e) => Err(e),
        },
    };
    let dependabot_alerts = match dep {
        Ok(Some(a)) => {
            alerts.extend(a);
            On
        }
        Ok(None) => Off,
        Err(_) => {
            partial.push(AlertKind::Dependency);
            Unavailable
        }
    };
    let security_updates = match sa_status(&info, "dependabot_security_updates") {
        Some(b) => FeatureState::from_bool(b),
        None => match get_value(c, &format!("/repos/{repo}/automated-security-fixes"), fresh).await {
            Ok(v) => FeatureState::from_bool(v.get("enabled").and_then(Value::as_bool).unwrap_or(false)),
            Err(_) => Unavailable,
        },
    };
    let (secret_scanning, push_protection) = match (sa_status(&info, "secret_scanning"), sa_status(&info, "secret_scanning_push_protection")) {
        (Some(s), p) => (FeatureState::from_bool(s), p.map_or(Unavailable, FeatureState::from_bool)),
        (None, _) => (Unavailable, Unavailable),
    };
    if secret_scanning == On && alerts_mode.is_some() {
        match list_alerts(c, repo, AlertKind::Secret, closed, fresh).await {
            Ok(a) => alerts.extend(a.unwrap_or_default()),
            Err(_) => partial.push(AlertKind::Secret),
        }
    }

    let private_reporting = if private {
        Unavailable
    } else {
        match get_value(c, &format!("/repos/{repo}/private-vulnerability-reporting"), fresh).await {
            Ok(v) => FeatureState::from_bool(v.get("enabled").and_then(Value::as_bool).unwrap_or(false)),
            Err(_) => Unavailable,
        }
    };

    let code_scanning = if private && sa_status(&info, "advanced_security").is_none() {
        Unavailable
    } else {
        let setup = match get_value(c, &format!("/repos/{repo}/code-scanning/default-setup"), fresh).await {
            Ok(v) => FeatureState::from_bool(v.get("state").and_then(Value::as_str) == Some("configured")),
            Err(_) => Unavailable,
        };
        if setup != Unavailable && alerts_mode.is_some() {

            match list_alerts(c, repo, AlertKind::Code, closed, fresh).await {
                Ok(Some(a)) => {
                    alerts.extend(a);
                    if setup == Off { On } else { setup }
                }
                Ok(None) => setup,
                Err(_) => {
                    partial.push(AlertKind::Code);
                    setup
                }
            }
        } else {
            setup
        }
    };
    let posture = Posture { dependabot_alerts, security_updates, secret_scanning, push_protection, private_reporting, code_scanning };
    Ok(RepoSecurity { repo: repo.into(), private, archived, posture, alerts, partial, error: None })
}


pub async fn posture(c: &GitHubClient, repo: &str) -> AppResult<Posture> {
    Ok(scan_inner(c, repo, None, true).await?.posture)
}

fn sa_patch(name: &str, on: bool) -> Value {
    json!({ "security_and_analysis": { name: { "status": if on { "enabled" } else { "disabled" } } } })
}


pub async fn set_feature(c: &GitHubClient, repo: &str, f: Feature, on: bool) -> AppResult<()> {
    forget(repo);
    let method = if on { Method::PUT } else { Method::DELETE };
    let base = format!("/repos/{repo}");
    match f {
        Feature::DependabotAlerts => c.send_json::<()>(method, &format!("{base}/vulnerability-alerts"), None).await.map(drop),
        Feature::SecurityUpdates => {
            if on {
                c.send_json::<()>(Method::PUT, &format!("{base}/vulnerability-alerts"), None).await?;
            }
            c.send_json::<()>(method, &format!("{base}/automated-security-fixes"), None).await.map(drop)
        }
        Feature::SecretScanning => c.send_json(Method::PATCH, &base, Some(&sa_patch("secret_scanning", on))).await.map(drop),
        Feature::PushProtection => {
            let mut body = sa_patch("secret_scanning_push_protection", on);
            if on {
                body["security_and_analysis"]["secret_scanning"] = json!({ "status": "enabled" });
            }
            c.send_json(Method::PATCH, &base, Some(&body)).await.map(drop)
        }
        Feature::PrivateReporting => c.send_json::<()>(method, &format!("{base}/private-vulnerability-reporting"), None).await.map(drop),
        Feature::CodeScanning => {
            let body = json!({ "state": if on { "configured" } else { "not-configured" } });
            c.send_json(Method::PATCH, &format!("{base}/code-scanning/default-setup"), Some(&body)).await.map(drop)
        }
    }
}

pub async fn get_alert(c: &GitHubClient, repo: &str, kind: AlertKind, number: u32) -> AppResult<Alert> {
    let v: Value = c.get_json(&format!("/repos/{repo}/{}/{number}", kind.path())).await?;
    Ok(match kind {
        AlertKind::Dependency => Alert::from_dependabot(&v),
        AlertKind::Code => Alert::from_code(&v),
        AlertKind::Secret => Alert::from_secret(&v),
    })
}


pub fn alert_body(kind: AlertKind, open: bool, reason: Option<&str>, comment: Option<&str>) -> AppResult<Value> {
    let comment = comment.map(str::trim).filter(|c| !c.is_empty());
    if open {
        return Ok(json!({ "state": "open" }));
    }
    let reason = reason.filter(|r| kind.reasons().contains(r)).ok_or_else(|| AppError::new("security.bad_reason"))?;
    let mut body = match kind {
        AlertKind::Dependency | AlertKind::Code => json!({ "state": "dismissed", "dismissed_reason": reason }),
        AlertKind::Secret => json!({ "state": "resolved", "resolution": reason }),
    };
    if let Some(c) = comment {
        let key = if kind == AlertKind::Secret { "resolution_comment" } else { "dismissed_comment" };
        body[key] = json!(c.chars().take(280).collect::<String>());
    }
    Ok(body)
}

pub async fn set_alert(c: &GitHubClient, repo: &str, kind: AlertKind, number: u32, open: bool, reason: Option<&str>, comment: Option<&str>) -> AppResult<()> {
    let body = alert_body(kind, open, reason, comment)?;
    c.send_json(Method::PATCH, &format!("/repos/{repo}/{}/{number}", kind.path()), Some(&body)).await.map(drop)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_dependabot_alert() {
        let v = json!({
            "number": 3, "state": "open", "html_url": "u", "created_at": "2026-01-01T00:00:00Z",
            "dependency": { "package": { "ecosystem": "npm", "name": "lodash" }, "manifest_path": "package-lock.json" },
            "security_advisory": { "ghsa_id": "GHSA-x", "cve_id": "CVE-1", "summary": "Prototype pollution", "severity": "high", "cvss": { "score": 7.4 } },
            "security_vulnerability": { "severity": "critical", "vulnerable_version_range": "< 4.17.21", "first_patched_version": { "identifier": "4.17.21" } }
        });
        let a = Alert::from_dependabot(&v);
        assert_eq!((a.kind, a.number, a.severity), (AlertKind::Dependency, 3, Severity::Critical));
        assert_eq!(a.key, "GHSA-x");
        assert_eq!(a.patched.as_deref(), Some("4.17.21"));
        assert_eq!(a.location.as_deref(), Some("package-lock.json"));
        assert_eq!(a.cvss, Some(7.4));
        assert_eq!(a.state, "open");
    }

    #[test]
    fn parses_code_and_secret_alerts_without_the_secret() {
        let code = Alert::from_code(&json!({
            "number": 1, "state": "dismissed", "dismissed_reason": "false positive",
            "rule": { "id": "js/xss", "severity": "error", "description": "XSS" },
            "tool": { "name": "CodeQL" },
            "most_recent_instance": { "location": { "path": "src/a.js", "start_line": 12 } }
        }));
        assert_eq!((code.severity, code.location.as_deref(), code.reason.as_deref()), (Severity::High, Some("src/a.js:12"), Some("false positive")));
        let secret = Alert::from_secret(&json!({
            "number": 2, "state": "open", "secret_type": "github_personal_access_token",
            "secret_type_display_name": "GitHub PAT", "secret": "ghp_SHOULD_NOT_APPEAR", "validity": "active"
        }));
        assert_eq!(secret.severity, Severity::Critical);
        assert!(!serde_json::to_string(&secret).unwrap().contains("ghp_SHOULD_NOT_APPEAR"));
    }

    #[test]
    fn alert_bodies_validate_reasons() {
        assert_eq!(alert_body(AlertKind::Dependency, true, None, None).unwrap(), json!({ "state": "open" }));
        let b = alert_body(AlertKind::Secret, false, Some("revoked"), Some(" rotated ")).unwrap();
        assert_eq!(b, json!({ "state": "resolved", "resolution": "revoked", "resolution_comment": "rotated" }));
        assert_eq!(alert_body(AlertKind::Code, false, Some("fix_started"), None).unwrap_err().code, "security.bad_reason");
        assert!(alert_body(AlertKind::Code, false, Some("won't fix"), None).is_ok());
    }

    #[test]
    fn severity_mapping() {
        assert_eq!(Severity::parse(Some("moderate")), Severity::Medium);
        assert_eq!(Severity::parse(Some("note")), Severity::Low);
        assert_eq!(Severity::parse(None), Severity::Unknown);
        assert!(Severity::Critical < Severity::Low);
    }
}
