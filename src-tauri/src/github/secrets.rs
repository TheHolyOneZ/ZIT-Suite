use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;

use super::client::{enc, GitHubClient};
use crate::error::{AppError, AppResult};


#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq, Hash)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Scope {
    Repo,
    Env { env: String },
}

impl Scope {
    fn base(&self, repo: &str) -> String {
        match self {
            Scope::Repo => format!("/repos/{repo}/actions"),
            Scope::Env { env } => format!("/repos/{repo}/environments/{}", enc(env)),
        }
    }
}


pub fn valid_name(name: &str) -> bool {
    let n = name.to_ascii_uppercase();
    !n.is_empty()
        && n.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
        && !n.starts_with(|c: char| c.is_ascii_digit())
        && !n.starts_with("GITHUB_")
}

fn check_name(name: &str) -> AppResult<String> {
    if valid_name(name) {
        Ok(name.to_ascii_uppercase())
    } else {
        Err(AppError::new("secrets.bad_name").detail(name.to_string()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
pub struct SecretMeta {
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
pub struct Variable {
    pub name: String,
    pub value: String,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn list_secrets(c: &GitHubClient, repo: &str, scope: &Scope, fresh: bool) -> AppResult<Vec<SecretMeta>> {
    c.paginate_key(&format!("{}/secrets?per_page=100", scope.base(repo)), "secrets", fresh).await
}

pub async fn list_variables(c: &GitHubClient, repo: &str, scope: &Scope, fresh: bool) -> AppResult<Vec<Variable>> {

    c.paginate_key(&format!("{}/variables?per_page=30", scope.base(repo)), "variables", fresh).await
}


pub fn seal(public_key_b64: &str, value: &str) -> AppResult<String> {
    let raw = B64.decode(public_key_b64.trim()).map_err(|e| AppError::new("secrets.bad_key").detail(e.to_string()))?;
    let bytes: [u8; 32] = raw.try_into().map_err(|_| AppError::new("secrets.bad_key"))?;
    let pk = crypto_box::PublicKey::from(bytes);
    let sealed = pk
        .seal(&mut crypto_box::aead::OsRng, value.as_bytes())
        .map_err(|_| AppError::new("secrets.seal_failed"))?;
    Ok(B64.encode(sealed))
}

#[derive(Deserialize)]
struct PublicKey {
    key_id: String,
    key: String,
}


pub const MAX_SECRET_BYTES: usize = 48 * 1024;

pub async fn set_secret(c: &GitHubClient, repo: &str, scope: &Scope, name: &str, value: &str) -> AppResult<()> {
    let name = check_name(name)?;
    if value.len() > MAX_SECRET_BYTES {
        return Err(AppError::new("secrets.too_large"));
    }
    let base = scope.base(repo);
    let pk: PublicKey = c.get_json(&format!("{base}/secrets/public-key")).await?;
    let body = json!({ "encrypted_value": seal(&pk.key, value)?, "key_id": pk.key_id });
    c.send_json(Method::PUT, &format!("{base}/secrets/{}", enc(&name)), Some(&body)).await?;
    Ok(())
}

pub async fn delete_secret(c: &GitHubClient, repo: &str, scope: &Scope, name: &str) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("{}/secrets/{}", scope.base(repo), enc(name)), None).await?;
    Ok(())
}


pub async fn set_variable(c: &GitHubClient, repo: &str, scope: &Scope, name: &str, value: &str) -> AppResult<()> {
    let name = check_name(name)?;
    let base = scope.base(repo);
    let body = json!({ "name": name, "value": value });
    match c.send_json(Method::PATCH, &format!("{base}/variables/{}", enc(&name)), Some(&body)).await {
        Ok(_) => Ok(()),
        Err(e) if e.code == "github.not_found" => c.send_json(Method::POST, &format!("{base}/variables"), Some(&body)).await.map(drop),
        Err(e) => Err(e),
    }
}

pub async fn delete_variable(c: &GitHubClient, repo: &str, scope: &Scope, name: &str) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("{}/variables/{}", scope.base(repo), enc(name)), None).await?;
    Ok(())
}


#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum BranchPolicy {

    #[default]
    All,

    Protected,

    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
pub struct Reviewer {

    pub kind: String,

    pub name: String,
    pub id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
pub struct Environment {
    pub name: String,
    pub html_url: String,
    pub created_at: String,
    pub updated_at: String,

    pub wait_timer: u32,
    pub reviewers: Vec<Reviewer>,
    pub prevent_self_review: bool,
    pub branch_policy: BranchPolicy,

    pub patterns: Vec<String>,
    pub can_admins_bypass: bool,
}

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(Value::as_str).unwrap_or_default().to_string()
}

pub fn parse_environment(v: &Value) -> Environment {
    let rules = v.get("protection_rules").and_then(Value::as_array).cloned().unwrap_or_default();
    let rule = |t: &str| rules.iter().find(|r| r.get("type").and_then(Value::as_str) == Some(t)).cloned();
    let reviewers_rule = rule("required_reviewers");
    let reviewers = reviewers_rule
        .as_ref()
        .and_then(|r| r.get("reviewers"))
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .map(|x| {
                    let who = x.get("reviewer").cloned().unwrap_or_default();
                    Reviewer {
                        kind: s(x, "type"),
                        name: who.get("login").or_else(|| who.get("slug")).and_then(Value::as_str).unwrap_or("?").to_string(),
                        id: who.get("id").and_then(Value::as_u64).unwrap_or(0),
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    let policy = v.get("deployment_branch_policy").filter(|p| !p.is_null());
    let branch_policy = match policy {
        None => BranchPolicy::All,
        Some(p) if p.get("custom_branch_policies").and_then(Value::as_bool) == Some(true) => BranchPolicy::Custom,
        Some(_) => BranchPolicy::Protected,
    };
    Environment {
        name: s(v, "name"),
        html_url: s(v, "html_url"),
        created_at: s(v, "created_at"),
        updated_at: s(v, "updated_at"),
        wait_timer: rule("wait_timer").and_then(|r| r.get("wait_timer").and_then(Value::as_u64)).unwrap_or(0) as u32,
        reviewers,
        prevent_self_review: reviewers_rule.and_then(|r| r.get("prevent_self_review").and_then(Value::as_bool)).unwrap_or(false),
        branch_policy,
        patterns: vec![],
        can_admins_bypass: v.get("can_admins_bypass").and_then(Value::as_bool).unwrap_or(true),
    }
}

#[derive(Deserialize)]
struct BranchPolicyItem {
    id: u64,
    name: String,
}

async fn patterns(c: &GitHubClient, repo: &str, env: &str, fresh: bool) -> AppResult<Vec<BranchPolicyItem>> {
    c.paginate_key(&format!("/repos/{repo}/environments/{}/deployment-branch-policies?per_page=100", enc(env)), "branch_policies", fresh).await
}


pub async fn list_environments(c: &GitHubClient, repo: &str, fresh: bool) -> AppResult<Vec<Environment>> {
    let raw: Vec<Value> = c.paginate_key(&format!("/repos/{repo}/environments?per_page=100"), "environments", fresh).await?;
    let mut out = Vec::with_capacity(raw.len());
    for v in &raw {
        let mut e = parse_environment(v);
        if e.branch_policy == BranchPolicy::Custom {
            e.patterns = patterns(c, repo, &e.name, fresh).await?.into_iter().map(|p| p.name).collect();
            e.patterns.sort();
        }
        out.push(e);
    }
    Ok(out)
}

pub async fn get_environment(c: &GitHubClient, repo: &str, name: &str) -> AppResult<Option<Environment>> {
    match c.get_json::<Value>(&format!("/repos/{repo}/environments/{}", enc(name))).await {
        Ok(v) => {
            let mut e = parse_environment(&v);
            if e.branch_policy == BranchPolicy::Custom {
                e.patterns = patterns(c, repo, name, true).await?.into_iter().map(|p| p.name).collect();
                e.patterns.sort();
            }
            Ok(Some(e))
        }
        Err(e) if e.code == "github.not_found" => Ok(None),
        Err(e) => Err(e),
    }
}


#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
pub struct EnvConfig {
    pub wait_timer: u32,

    pub reviewers: Vec<String>,
    pub prevent_self_review: bool,
    pub branch_policy: BranchPolicy,
    pub patterns: Vec<String>,
    pub can_admins_bypass: bool,
}

impl EnvConfig {
    fn normalized(&self) -> EnvConfig {
        let mut c = self.clone();
        c.reviewers = c.reviewers.iter().map(|r| r.trim().trim_start_matches('@').to_lowercase()).filter(|r| !r.is_empty()).collect();
        c.reviewers.sort();
        c.reviewers.dedup();
        c.patterns = if c.branch_policy == BranchPolicy::Custom {
            let mut p: Vec<String> = c.patterns.iter().map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect();
            p.sort();
            p.dedup();
            p
        } else {
            vec![]
        };
        if c.reviewers.is_empty() {
            c.prevent_self_review = false;
        }
        c
    }
}


pub fn config_of(e: &Environment) -> EnvConfig {
    EnvConfig {
        wait_timer: e.wait_timer,
        reviewers: e.reviewers.iter().filter(|r| r.kind == "User").map(|r| r.name.clone()).collect(),
        prevent_self_review: e.prevent_self_review,
        branch_policy: e.branch_policy,
        patterns: e.patterns.clone(),
        can_admins_bypass: e.can_admins_bypass,
    }
}

pub fn same_config(a: &EnvConfig, b: &EnvConfig) -> bool {
    a.normalized() == b.normalized()
}

#[derive(Deserialize)]
struct UserId {
    id: u64,
}


fn plan_gate(e: AppError) -> AppError {
    let d = e.detail.clone().unwrap_or_default().to_lowercase();
    if d.contains("upgrade") || d.contains("not available") || d.contains("github pro") || d.contains("billing plan") {
        AppError { code: "secrets.env_plan".into(), ..e }
    } else {
        e
    }
}


pub fn env_body(cfg: &EnvConfig, current: Option<&Environment>, reviewer_ids: &[u64]) -> Value {
    let mut body = serde_json::Map::new();
    if cfg.wait_timer > 0 || current.is_some_and(|e| e.wait_timer > 0) {
        body.insert("wait_timer".into(), json!(cfg.wait_timer));
    }
    if !cfg.reviewers.is_empty() || current.is_some_and(|e| !e.reviewers.is_empty()) {
        let reviewers: Vec<Value> = reviewer_ids.iter().map(|id| json!({ "type": "User", "id": id })).collect();
        body.insert("reviewers".into(), Value::Array(reviewers));
        body.insert("prevent_self_review".into(), json!(cfg.prevent_self_review && !cfg.reviewers.is_empty()));
    }
    let policy = match cfg.branch_policy {
        BranchPolicy::All => Value::Null,
        BranchPolicy::Protected => json!({ "protected_branches": true, "custom_branch_policies": false }),
        BranchPolicy::Custom => json!({ "protected_branches": false, "custom_branch_policies": true }),
    };
    body.insert("deployment_branch_policy".into(), policy);
    if !cfg.can_admins_bypass || current.is_some_and(|e| !e.can_admins_bypass) {
        body.insert("can_admins_bypass".into(), json!(cfg.can_admins_bypass));
    }
    Value::Object(body)
}

pub async fn upsert_environment(c: &GitHubClient, repo: &str, name: &str, cfg: &EnvConfig) -> AppResult<()> {
    let cfg = cfg.normalized();
    if cfg.reviewers.len() > 6 {
        return Err(AppError::new("secrets.too_many_reviewers"));
    }
    let current = get_environment(c, repo, name).await?;
    let mut ids = Vec::with_capacity(cfg.reviewers.len());
    for login in &cfg.reviewers {
        let u: UserId = c.get_json(&format!("/users/{}", enc(login))).await?;
        ids.push(u.id);
    }
    let body = env_body(&cfg, current.as_ref(), &ids);
    c.send_json(Method::PUT, &format!("/repos/{repo}/environments/{}", enc(name)), Some(&body)).await.map_err(plan_gate)?;
    if cfg.branch_policy == BranchPolicy::Custom {
        let path = format!("/repos/{repo}/environments/{}/deployment-branch-policies", enc(name));
        let existing = patterns(c, repo, name, true).await?;
        for p in existing.iter().filter(|p| !cfg.patterns.contains(&p.name)) {
            c.send_json::<()>(Method::DELETE, &format!("{path}/{}", p.id), None).await?;
        }
        for want in cfg.patterns.iter().filter(|w| !existing.iter().any(|p| &p.name == *w)) {
            c.send_json(Method::POST, &path, Some(&json!({ "name": want, "type": "branch" }))).await?;
        }
    }
    Ok(())
}

pub async fn delete_environment(c: &GitHubClient, repo: &str, name: &str) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/repos/{repo}/environments/{}", enc(name)), None).await?;
    Ok(())
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct EnvScan {
    pub env: Environment,
    pub secrets: Vec<SecretMeta>,
    pub variables: Vec<Variable>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RepoSecrets {
    pub repo: String,
    pub secrets: Vec<SecretMeta>,
    pub variables: Vec<Variable>,
    pub environments: Vec<EnvScan>,
    pub error: Option<AppError>,
}

async fn scan_inner(c: &GitHubClient, repo: &str, fresh: bool) -> AppResult<RepoSecrets> {
    let (secrets, variables, envs) =
        tokio::join!(list_secrets(c, repo, &Scope::Repo, fresh), list_variables(c, repo, &Scope::Repo, fresh), list_environments(c, repo, fresh));

    let envs = match envs {
        Err(e) if e.code == "github.not_found" || e.code == "github.forbidden" => vec![],
        other => other?,
    };
    let mut environments = Vec::new();
    for env in envs {
        let scope = Scope::Env { env: env.name.clone() };
        let (s, v) = tokio::join!(list_secrets(c, repo, &scope, fresh), list_variables(c, repo, &scope, fresh));
        environments.push(EnvScan { env, secrets: s?, variables: v? });
    }
    Ok(RepoSecrets { repo: repo.into(), secrets: secrets?, variables: variables?, environments, error: None })
}

pub async fn scan_repo(c: &GitHubClient, repo: &str, fresh: bool) -> RepoSecrets {
    scan_inner(c, repo, fresh).await.unwrap_or_else(|error| RepoSecrets {
        repo: repo.into(),
        secrets: vec![],
        variables: vec![],
        environments: vec![],
        error: Some(error),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sealed_box_round_trip() {
        let sk = crypto_box::SecretKey::generate(&mut crypto_box::aead::OsRng);
        let pk_b64 = B64.encode(sk.public_key().as_bytes());
        let sealed = B64.decode(seal(&pk_b64, "hunter2 ✓").unwrap()).unwrap();
        assert_eq!(sk.unseal(&sealed).unwrap(), "hunter2 ✓".as_bytes());

        assert_ne!(seal(&pk_b64, "x").unwrap(), seal(&pk_b64, "x").unwrap());
        assert_eq!(seal("not base64!", "x").unwrap_err().code, "secrets.bad_key");
        assert_eq!(seal(&B64.encode([1u8; 7]), "x").unwrap_err().code, "secrets.bad_key");
    }

    #[test]
    fn names_follow_github_rules() {
        assert!(valid_name("NPM_TOKEN") && valid_name("npm_token") && valid_name("_X1"));
        assert!(!valid_name("") && !valid_name("1ABC") && !valid_name("GITHUB_TOKEN") && !valid_name("A-B") && !valid_name("A B"));
    }

    #[test]
    fn scope_paths() {
        assert_eq!(Scope::Repo.base("o/r"), "/repos/o/r/actions");
        assert_eq!(Scope::Env { env: "prod eu".into() }.base("o/r"), "/repos/o/r/environments/prod%20eu");
    }

    #[test]
    fn parses_environment_rules() {
        let e = parse_environment(&json!({
            "name": "production", "html_url": "h", "created_at": "c", "updated_at": "u", "can_admins_bypass": false,
            "protection_rules": [
                { "type": "wait_timer", "wait_timer": 30 },
                { "type": "required_reviewers", "prevent_self_review": true, "reviewers": [
                    { "type": "User", "reviewer": { "login": "Octo", "id": 1 } },
                    { "type": "Team", "reviewer": { "slug": "ops", "id": 9 } } ] },
                { "type": "branch_policy" } ],
            "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
        }));
        assert_eq!(e.wait_timer, 30);
        assert!(e.prevent_self_review && !e.can_admins_bypass);
        assert_eq!(e.branch_policy, BranchPolicy::Custom);
        assert_eq!(e.reviewers.iter().map(|r| r.name.as_str()).collect::<Vec<_>>(), ["Octo", "ops"]);
        let bare = parse_environment(&json!({ "name": "github-pages", "deployment_branch_policy": null }));
        assert_eq!((bare.branch_policy, bare.wait_timer, bare.can_admins_bypass), (BranchPolicy::All, 0, true));
        assert_eq!(parse_environment(&json!({ "deployment_branch_policy": { "protected_branches": true, "custom_branch_policies": false } })).branch_policy, BranchPolicy::Protected);
    }

    #[test]
    fn env_body_only_sends_rules_in_use() {
        let plain = EnvConfig { branch_policy: BranchPolicy::Custom, can_admins_bypass: true, ..Default::default() };
        let b = env_body(&plain, None, &[]);

        assert!(b.get("reviewers").is_none() && b.get("wait_timer").is_none() && b.get("can_admins_bypass").is_none());
        assert_eq!(b["deployment_branch_policy"]["custom_branch_policies"], true);

        let mut cur = parse_environment(&json!({ "name": "p", "can_admins_bypass": false, "protection_rules": [
            { "type": "wait_timer", "wait_timer": 9 },
            { "type": "required_reviewers", "reviewers": [{ "type": "User", "reviewer": { "login": "o", "id": 1 } }] } ] }));
        let cleared = env_body(&EnvConfig { can_admins_bypass: true, ..Default::default() }, Some(&cur), &[]);
        assert_eq!(cleared["wait_timer"], 0);
        assert_eq!(cleared["reviewers"], json!([]));
        assert_eq!(cleared["can_admins_bypass"], true);
        assert!(cleared["deployment_branch_policy"].is_null());
        cur.reviewers.clear();
        let with = env_body(&EnvConfig { reviewers: vec!["o".into()], prevent_self_review: true, ..Default::default() }, Some(&cur), &[42]);
        assert_eq!(with["reviewers"], json!([{ "type": "User", "id": 42 }]));
        assert_eq!(with["prevent_self_review"], true);
    }

    #[test]
    fn env_config_comparison_is_normalized() {
        let a = EnvConfig { reviewers: vec!["@Octo".into(), "bob".into()], branch_policy: BranchPolicy::Custom, patterns: vec!["main".into(), "release/*".into()], ..Default::default() };
        let b = EnvConfig { reviewers: vec!["BOB".into(), "octo".into()], branch_policy: BranchPolicy::Custom, patterns: vec!["release/*".into(), "main".into(), " ".into()], ..Default::default() };
        assert!(same_config(&a, &b));

        let c = EnvConfig { patterns: vec!["x".into()], prevent_self_review: true, ..Default::default() };
        assert!(same_config(&c, &EnvConfig::default()));
        assert!(!same_config(&a, &EnvConfig { wait_timer: 5, ..a.clone() }));
    }
}
