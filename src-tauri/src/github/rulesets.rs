use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;

use super::branches::Ruleset;
use super::client::GitHubClient;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type, PartialEq)]
pub struct PrRule {
    pub approvals: u32,
    pub dismiss_stale: bool,
    pub code_owners: bool,
    pub last_push: bool,
    pub resolve_threads: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type, PartialEq)]
pub struct ChecksRule {

    pub strict: bool,
    pub contexts: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type, PartialEq)]
pub struct RulesetDraft {
    pub name: String,

    pub enforcement: String,

    pub include: Vec<String>,
    pub exclude: Vec<String>,
    pub block_deletion: bool,
    pub block_force_push: bool,
    pub linear_history: bool,
    pub signed_commits: bool,
    pub restrict_creation: bool,
    pub restrict_update: bool,
    pub pull_request: Option<PrRule>,
    pub status_checks: Option<ChecksRule>,

    pub other_rules: Vec<String>,
}

const KNOWN: &[&str] = &["deletion", "non_fast_forward", "required_linear_history", "required_signatures", "creation", "update", "pull_request", "required_status_checks"];

fn strings(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_str).map(str::to_string).collect()).unwrap_or_default()
}

pub fn draft_of(v: &Value) -> RulesetDraft {
    let rules = v.get("rules").and_then(Value::as_array).cloned().unwrap_or_default();
    let find = |t: &str| rules.iter().find(|r| r.get("type").and_then(Value::as_str) == Some(t));
    let has = |t: &str| find(t).is_some();
    let b = |r: &Value, k: &str| r.pointer(&format!("/parameters/{k}")).and_then(Value::as_bool).unwrap_or(false);
    RulesetDraft {
        name: v.get("name").and_then(Value::as_str).unwrap_or_default().to_string(),
        enforcement: v.get("enforcement").and_then(Value::as_str).unwrap_or("active").to_string(),
        include: strings(v.pointer("/conditions/ref_name/include")),
        exclude: strings(v.pointer("/conditions/ref_name/exclude")),
        block_deletion: has("deletion"),
        block_force_push: has("non_fast_forward"),
        linear_history: has("required_linear_history"),
        signed_commits: has("required_signatures"),
        restrict_creation: has("creation"),
        restrict_update: has("update"),
        pull_request: find("pull_request").map(|r| PrRule {
            approvals: r.pointer("/parameters/required_approving_review_count").and_then(Value::as_u64).unwrap_or(0) as u32,
            dismiss_stale: b(r, "dismiss_stale_reviews_on_push"),
            code_owners: b(r, "require_code_owner_review"),
            last_push: b(r, "require_last_push_approval"),
            resolve_threads: b(r, "required_review_thread_resolution"),
        }),
        status_checks: find("required_status_checks").map(|r| ChecksRule {
            strict: b(r, "strict_required_status_checks_policy"),
            contexts: r
                .pointer("/parameters/required_status_checks")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(|c| c.get("context").and_then(Value::as_str)).map(str::to_string).collect())
                .unwrap_or_default(),
        }),
        other_rules: rules.iter().filter_map(|r| r.get("type").and_then(Value::as_str)).filter(|t| !KNOWN.contains(t)).map(str::to_string).collect(),
    }
}

fn rules_of(d: &RulesetDraft) -> Vec<Value> {
    let mut out = Vec::new();
    for (on, t) in [
        (d.block_deletion, "deletion"),
        (d.block_force_push, "non_fast_forward"),
        (d.linear_history, "required_linear_history"),
        (d.signed_commits, "required_signatures"),
        (d.restrict_creation, "creation"),
        (d.restrict_update, "update"),
    ] {
        if on {
            out.push(json!({ "type": t }));
        }
    }
    if let Some(p) = &d.pull_request {
        out.push(json!({ "type": "pull_request", "parameters": {
            "required_approving_review_count": p.approvals.min(10),
            "dismiss_stale_reviews_on_push": p.dismiss_stale,
            "require_code_owner_review": p.code_owners,
            "require_last_push_approval": p.last_push,
            "required_review_thread_resolution": p.resolve_threads,
        }}));
    }
    if let Some(c) = &d.status_checks {
        let checks: Vec<Value> = c.contexts.iter().map(|x| x.trim()).filter(|x| !x.is_empty()).map(|x| json!({ "context": x })).collect();
        if !checks.is_empty() {
            out.push(json!({ "type": "required_status_checks", "parameters": {
                "strict_required_status_checks_policy": c.strict,
                "required_status_checks": checks,
            }}));
        }
    }
    out
}


pub fn payload(d: &RulesetDraft, keep: Vec<Value>) -> AppResult<Value> {
    if d.name.trim().is_empty() {
        return Err(AppError::new("branches.ruleset_name"));
    }
    let clean = |v: &[String]| v.iter().map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect::<Vec<_>>();
    let include = clean(&d.include);
    if include.is_empty() {
        return Err(AppError::new("branches.ruleset_target"));
    }
    let mut rules = keep;
    rules.extend(rules_of(d));
    Ok(json!({
        "name": d.name.trim(),
        "target": "branch",
        "enforcement": d.enforcement,
        "conditions": { "ref_name": { "include": include, "exclude": clean(&d.exclude) } },
        "rules": rules,
    }))
}

pub async fn get(c: &GitHubClient, repo: &str, id: u64) -> AppResult<RulesetDraft> {
    let v: Value = c.get_json(&format!("/repos/{repo}/rulesets/{id}")).await?;
    Ok(draft_of(&v))
}

fn summary(v: Option<Value>) -> AppResult<Ruleset> {
    Ok(serde_json::from_value(v.unwrap_or_default())?)
}

pub async fn create(c: &GitHubClient, repo: &str, d: &RulesetDraft) -> AppResult<Ruleset> {
    summary(c.send_json(Method::POST, &format!("/repos/{repo}/rulesets"), Some(&payload(d, vec![])?)).await?)
}

pub async fn update(c: &GitHubClient, repo: &str, id: u64, d: &RulesetDraft) -> AppResult<Ruleset> {
    let cur: Value = c.get_json(&format!("/repos/{repo}/rulesets/{id}")).await?;
    let keep: Vec<Value> = cur
        .get("rules")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter(|r| !r.get("type").and_then(Value::as_str).is_some_and(|t| KNOWN.contains(&t))).cloned().collect())
        .unwrap_or_default();
    summary(c.send_json(Method::PUT, &format!("/repos/{repo}/rulesets/{id}"), Some(&payload(d, keep)?)).await?)
}

pub async fn delete(c: &GitHubClient, repo: &str, id: u64) -> AppResult<()> {
    c.send_json::<()>(Method::DELETE, &format!("/repos/{repo}/rulesets/{id}"), None).await.map(drop)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_and_keeps_unknown_rules() {
        let gh = json!({
            "name": "main rules", "enforcement": "active",
            "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
            "rules": [
                { "type": "deletion" }, { "type": "non_fast_forward" },
                { "type": "pull_request", "parameters": { "required_approving_review_count": 2, "dismiss_stale_reviews_on_push": true, "require_code_owner_review": false, "require_last_push_approval": false, "required_review_thread_resolution": true } },
                { "type": "required_status_checks", "parameters": { "strict_required_status_checks_policy": true, "required_status_checks": [{ "context": "ci" }] } },
                { "type": "commit_message_pattern", "parameters": { "operator": "starts_with", "pattern": "feat" } }
            ]
        });
        let d = draft_of(&gh);
        assert!(d.block_deletion && d.block_force_push && !d.linear_history);
        assert_eq!(d.pull_request.as_ref().unwrap().approvals, 2);
        assert_eq!(d.status_checks.as_ref().unwrap().contexts, ["ci"]);
        assert_eq!(d.other_rules, ["commit_message_pattern"]);

        let keep = vec![gh["rules"][4].clone()];
        let p = payload(&d, keep).unwrap();
        let types: Vec<&str> = p["rules"].as_array().unwrap().iter().map(|r| r["type"].as_str().unwrap()).collect();
        assert_eq!(types, ["commit_message_pattern", "deletion", "non_fast_forward", "pull_request", "required_status_checks"]);
        assert_eq!(draft_of(&p).pull_request, d.pull_request);
    }

    #[test]
    fn validates() {
        let mut d = RulesetDraft { name: " ".into(), include: vec!["~ALL".into()], ..Default::default() };
        assert_eq!(payload(&d, vec![]).unwrap_err().code, "branches.ruleset_name");
        d.name = "x".into();
        d.include = vec![" ".into()];
        assert_eq!(payload(&d, vec![]).unwrap_err().code, "branches.ruleset_target");

        d.include = vec!["~ALL".into()];
        d.status_checks = Some(ChecksRule { strict: true, contexts: vec!["".into()] });
        assert!(payload(&d, vec![]).unwrap()["rules"].as_array().unwrap().is_empty());
    }
}
