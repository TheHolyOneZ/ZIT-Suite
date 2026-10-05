use std::collections::HashMap;
use std::future::Future;

use serde::{Deserialize, Serialize};
use specta::Type;
use tokio::task::JoinSet;

use super::{NewQueueItem, QueueAction};
use crate::error::AppError;
use crate::github::branches::{self, Protection};
use crate::github::releases;
use crate::github::issues::{self, Issue};
use crate::github::labels::{self, Label};
use crate::github::collaborators::{self, Role};
use crate::github::hooks::{self, Hook};
use crate::github::secrets::{self, Environment, Scope, Variable};
use crate::github::security::{self, Alert, Feature, FeatureState, Posture};
use crate::github::pulls::{self, Pull};
use crate::github::{repos, GitHubClient};

const CONCURRENCY: usize = 8;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DryRunOutcome {
    Ready,
    Noop,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DryRunResult {
    pub repo: String,
    pub action: QueueAction,
    pub outcome: DryRunOutcome,

    pub reason: Option<String>,
}

type Verdict = (DryRunOutcome, Option<&'static str>);


async fn concurrent<T, R, F, Fut>(inputs: Vec<T>, f: F) -> Vec<R>
where
    T: Send + 'static,
    R: Send + 'static,
    F: Fn(T) -> Fut,
    Fut: Future<Output = R> + Send + 'static,
{
    let n = inputs.len();
    let mut out: Vec<Option<R>> = (0..n).map(|_| None).collect();
    let mut set = JoinSet::new();
    let mut iter = inputs.into_iter().enumerate();
    loop {
        while set.len() < CONCURRENCY {
            let Some((i, t)) = iter.next() else { break };
            let fut = f(t);
            set.spawn(async move { (i, fut.await) });
        }
        match set.join_next().await {
            Some(Ok((i, r))) => out[i] = Some(r),
            Some(Err(e)) => log::error!("dry-run task failed: {e}"),
            None => break,
        }
    }
    out.into_iter().flatten().collect()
}

pub fn evaluate_repo(action: &QueueAction, repo: &repos::Repo, scopes: Option<&[String]>) -> Verdict {
    use DryRunOutcome::*;
    let perms = repo.permissions.clone().unwrap_or_default();
    if action.is_repo_level() {
        if !perms.admin {
            return (Blocked, Some("no_admin"));
        }
        if action.is_access() {
            let owner = repo.owner.login.to_lowercase();
            return match action {
                QueueAction::CollabSet { user, .. } | QueueAction::CollabRemove { user } if user.to_lowercase() == owner => {
                    (Blocked, Some("is_owner"))
                }
                _ => (Ready, None),
            };
        }
        return match action {
            QueueAction::Delete => {
                let missing = scopes.is_some_and(|s| !s.iter().any(|x| x == "delete_repo"));
                if missing { (Blocked, Some("missing_delete_scope")) } else { (Ready, None) }
            }
            QueueAction::Archive if repo.archived => (Noop, Some("already_archived")),
            QueueAction::Unarchive if !repo.archived => (Noop, Some("not_archived")),
            QueueAction::SetPrivate | QueueAction::SetPublic if repo.archived => (Blocked, Some("archived_readonly")),
            QueueAction::SetPrivate if repo.private => (Noop, Some("already_private")),
            QueueAction::SetPublic if !repo.private => (Noop, Some("already_public")),
            _ => (Ready, None),
        };
    }

    if repo.archived {
        return (Blocked, Some("archived_readonly"));
    }
    if !perms.push {
        return (Blocked, Some("no_push"));
    }
    (Ready, None)
}

pub fn evaluate_issue(action: &QueueAction, issue: &Issue) -> Verdict {
    use DryRunOutcome::*;
    use QueueAction::*;
    let open = issue.state == "open";
    let has_label = |l: &str| issue.labels.iter().any(|x| x.name.eq_ignore_ascii_case(l));
    let has_assignee = |a: &str| issue.assignees.iter().any(|x| x.login.eq_ignore_ascii_case(a));
    match action {
        IssueClose { .. } if !open => (Noop, Some("already_closed")),
        IssueReopen { .. } if open => (Noop, Some("already_open")),
        IssueAddLabels { labels, .. } if labels.iter().all(|l| has_label(l)) => (Noop, Some("labels_present")),
        IssueRemoveLabel { label, .. } if !has_label(label) => (Noop, Some("label_absent")),
        IssueAssign { assignees, .. } if assignees.iter().all(|a| has_assignee(a)) => (Noop, Some("already_assigned")),
        IssueUnassign { assignees, .. } if !assignees.iter().any(|a| has_assignee(a)) => (Noop, Some("not_assigned")),
        IssueSetMilestone { milestone, .. } if issue.milestone.as_ref().map(|m| m.number) == *milestone => {
            (Noop, Some("same_milestone"))
        }
        IssueLock { .. } if issue.locked => (Noop, Some("already_locked")),
        IssueUnlock { .. } if !issue.locked => (Noop, Some("not_locked")),
        _ => (Ready, None),
    }
}

pub fn evaluate_pull(action: &QueueAction, pr: &Pull) -> Verdict {
    use DryRunOutcome::*;
    use QueueAction::*;
    let open = pr.state == "open";
    match action {
        _ if pr.merged => (Noop, Some("already_merged")),
        PrMerge { .. } if !open => (Blocked, Some("pr_closed")),
        PrMerge { .. } if pr.draft => (Blocked, Some("pr_draft")),
        PrMerge { .. } if pr.mergeable == Some(false) || pr.mergeable_state == "dirty" => (Blocked, Some("pr_conflicts")),
        PrMerge { .. } if pr.mergeable_state == "blocked" => (Blocked, Some("pr_blocked")),
        PrClose { .. } if !open => (Noop, Some("already_closed")),
        PrReopen { .. } if open => (Noop, Some("already_open")),
        PrUpdateBranch { .. } if pr.mergeable_state != "behind" => (Noop, Some("up_to_date")),
        PrRequestReviewers { reviewers, .. } if reviewers.iter().all(|r| pr.requested_reviewers.iter().any(|x| x.login.eq_ignore_ascii_case(r))) => {
            (Noop, Some("already_requested"))
        }
        _ => (Ready, None),
    }
}


async fn evaluate_collab_set(c: &GitHubClient, repo: &str, user: &str, role: Role) -> Result<Verdict, AppError> {
    let current = if collaborators::is_collaborator(c, repo, user).await? { collaborators::permission_of(c, repo, user).await? } else { None };
    if current == Some(role) {
        return Ok((DryRunOutcome::Noop, Some("same_role")));
    }
    if current.is_none() {
        let pending = collaborators::invitations(c, repo, true).await?;
        if pending.iter().any(|i| i.login.eq_ignore_ascii_case(user) && !i.expired) {
            return Ok((DryRunOutcome::Noop, Some("already_invited")));
        }
        return Ok((DryRunOutcome::Ready, Some("will_invite")));
    }
    Ok((DryRunOutcome::Ready, Some("will_change_role")))
}


pub fn evaluate_hooks(action: &QueueAction, existing: &[Hook]) -> Verdict {
    use DryRunOutcome::*;
    fn with_url<'a>(existing: &'a [Hook], url: &'a str) -> impl Iterator<Item = &'a Hook> {
        existing.iter().filter(move |h| hooks::same_url(&h.url, url))
    }
    let matching = |url| with_url(existing, url);
    match action {
        QueueAction::HookCreate { config } if matching(&config.url).next().is_some() => (Noop, Some("hook_exists")),
        QueueAction::HookCreate { .. } => (Ready, Some("will_create")),
        QueueAction::HookUpdate { url, .. } | QueueAction::HookDelete { url } if matching(url).next().is_none() => (Noop, Some("hook_absent")),
        QueueAction::HookUpdate { url, patch } if matching(url).all(|h| hooks::effective_patch(h, patch).is_empty()) => (Noop, Some("hook_same")),
        QueueAction::HookUpdate { .. } => (Ready, Some("will_update")),
        _ => (Ready, None),
    }
}


pub enum SecretsState {
    Secrets(Vec<String>),
    Variables(Vec<Variable>),
    Env(Option<Environment>),

    ScopeMissing,
}

pub fn evaluate_secrets(action: &QueueAction, state: &SecretsState) -> Verdict {
    use DryRunOutcome::*;
    use QueueAction::*;
    let has = |names: &[String], n: &str| names.iter().any(|x| x.eq_ignore_ascii_case(n));
    match (action, state) {
        (SecretSet { name, .. } | VarSet { name, .. }, _) if !secrets::valid_name(name) => (Blocked, Some("bad_name")),
        (SecretSet { .. } | VarSet { .. }, SecretsState::ScopeMissing) => (Blocked, Some("env_missing")),
        (SecretDelete { .. } | VarDelete { .. }, SecretsState::ScopeMissing) => (Noop, Some("env_missing")),
        (SecretSet { name, .. }, SecretsState::Secrets(names)) => (Ready, Some(if has(names, name) { "will_update" } else { "will_create" })),
        (SecretDelete { name, .. }, SecretsState::Secrets(names)) if !has(names, name) => (Noop, Some("secret_absent")),
        (VarSet { name, value, .. }, SecretsState::Variables(vars)) => match vars.iter().find(|v| v.name.eq_ignore_ascii_case(name)) {
            Some(v) if v.value == *value => (Noop, Some("var_same")),
            Some(_) => (Ready, Some("will_update")),
            None => (Ready, Some("will_create")),
        },
        (VarDelete { name, .. }, SecretsState::Variables(vars)) if !vars.iter().any(|v| v.name.eq_ignore_ascii_case(name)) => (Noop, Some("var_absent")),
        (EnvUpsert { config, .. }, _) if config.reviewers.len() > 6 => (Blocked, Some("too_many_reviewers")),
        (EnvUpsert { .. }, SecretsState::Env(None)) => (Ready, Some("will_create")),
        (EnvUpsert { config, .. }, SecretsState::Env(Some(e))) if secrets::same_config(config, &secrets::config_of(e)) => (Noop, Some("env_same")),
        (EnvUpsert { .. }, SecretsState::Env(Some(_))) => (Ready, Some("will_update")),
        (EnvDelete { .. }, SecretsState::Env(None)) => (Noop, Some("env_absent")),
        _ => (Ready, None),
    }
}

async fn secrets_state(c: &GitHubClient, repo: &str, action: &QueueAction) -> Result<SecretsState, AppError> {
    use QueueAction::*;
    let missing_env = |scope: &Scope, e: &AppError| matches!(scope, Scope::Env { .. }) && e.code == "github.not_found";
    Ok(match action {
        SecretSet { scope, .. } | SecretDelete { scope, .. } => match secrets::list_secrets(c, repo, scope, true).await {
            Ok(list) => SecretsState::Secrets(list.into_iter().map(|s| s.name).collect()),
            Err(e) if missing_env(scope, &e) => SecretsState::ScopeMissing,
            Err(e) => return Err(e),
        },
        VarSet { scope, .. } | VarDelete { scope, .. } => match secrets::list_variables(c, repo, scope, true).await {
            Ok(list) => SecretsState::Variables(list),
            Err(e) if missing_env(scope, &e) => SecretsState::ScopeMissing,
            Err(e) => return Err(e),
        },
        EnvUpsert { name, .. } | EnvDelete { name } => SecretsState::Env(secrets::get_environment(c, repo, name).await?),
        _ => SecretsState::Secrets(vec![]),
    })
}


pub fn evaluate_feature(feature: Feature, enabled: bool, p: &Posture) -> Verdict {
    use DryRunOutcome::*;
    use FeatureState::*;
    match (p.get(feature), enabled) {
        (Unavailable, _) => (Blocked, Some("feature_unavailable")),
        (On, true) | (Off, false) => (Noop, Some("feature_same")),
        _ => match (feature, enabled) {
            (Feature::SecurityUpdates, true) if p.dependabot_alerts == Off => (Ready, Some("also_alerts_on")),
            (Feature::DependabotAlerts, false) if p.security_updates == On => (Ready, Some("also_updates_off")),
            (Feature::PushProtection, true) if p.secret_scanning == Off => (Ready, Some("also_scanning_on")),
            (Feature::SecretScanning, false) if p.push_protection == On => (Ready, Some("also_push_off")),
            _ => (Ready, None),
        },
    }
}


pub fn evaluate_alert(open: bool, reason: Option<&str>, alert: &Alert) -> Verdict {
    use DryRunOutcome::*;
    if !open && !reason.is_some_and(|r| alert.kind.reasons().contains(&r)) {
        return (Blocked, Some("bad_reason"));
    }
    match (open, alert.state.as_str()) {
        (true, "open") => (Noop, Some("alert_open")),
        (true, "fixed") => (Blocked, Some("alert_fixed")),
        (false, "open") => (Ready, None),
        (false, "fixed") => (Noop, Some("alert_fixed")),
        (false, _) => (Noop, Some("alert_closed")),
        _ => (Ready, None),
    }
}

pub fn evaluate_label(action: &QueueAction, existing: Option<&Label>) -> Verdict {
    use DryRunOutcome::*;
    match (action, existing) {
        (QueueAction::LabelUpsert { .. }, None) => (Ready, Some("will_create")),
        (QueueAction::LabelUpsert { name, color, description }, Some(cur)) => {
            let want = Label { name: name.clone(), color: color.clone(), description: description.clone() };
            if labels::same(&want, cur) { (Noop, Some("label_same")) } else { (Ready, Some("will_update")) }
        }
        (QueueAction::LabelDelete { .. }, None) => (Noop, Some("label_absent")),
        _ => (Ready, None),
    }
}


#[derive(Debug, Clone, Default)]
pub struct BranchFacts {
    pub default: Option<String>,
    pub target: String,
    pub exists: bool,

    pub protected: bool,
    pub from_exists: bool,

    pub protection: Option<Protection>,
    pub unavailable: bool,
}

pub fn evaluate_branch(action: &QueueAction, f: &BranchFacts) -> Verdict {
    use DryRunOutcome::*;
    use QueueAction::*;
    let is_default = f.default.as_deref() == Some(f.target.as_str());
    match action {
        BranchCreate { name, .. } if !branches::valid_name(name) => (Blocked, Some("bad_branch_name")),
        _ if f.default.is_none() => (Blocked, Some("empty_repo")),
        BranchCreate { .. } if f.exists => (Noop, Some("branch_exists")),
        BranchCreate { .. } if !f.from_exists => (Blocked, Some("source_missing")),
        BranchCreate { .. } => (Ready, Some("will_create")),
        BranchDelete { .. } if !f.exists => (Noop, Some("branch_absent")),
        BranchDelete { .. } if is_default => (Blocked, Some("branch_default")),
        BranchDelete { .. } if f.protected => (Blocked, Some("branch_protected")),
        BranchProtect { .. } if !f.exists => (Blocked, Some("branch_absent")),
        BranchUnprotect { .. } if !f.exists => (Noop, Some("branch_absent")),
        BranchProtect { .. } | BranchUnprotect { .. } if f.unavailable => (Blocked, Some("protection_unavailable")),
        BranchProtect { rules, .. } if f.protection.as_ref() == Some(rules) => (Noop, Some("protection_same")),
        BranchProtect { .. } => (Ready, Some(if f.protection.is_some() { "will_update" } else { "will_create" })),
        BranchUnprotect { .. } if f.protection.is_none() => (Noop, Some("not_protected")),
        _ => (Ready, None),
    }
}

async fn branch_exists(c: &GitHubClient, repo: &str, name: &str) -> Result<Option<bool>, AppError> {
    match c.get_json::<serde_json::Value>(&format!("/repos/{repo}/branches/{}", crate::github::client::enc(name))).await {
        Ok(v) => Ok(Some(v["protected"].as_bool().unwrap_or(false))),
        Err(e) if e.code == "github.not_found" => Ok(None),
        Err(e) => Err(e),
    }
}

async fn branch_facts(c: &GitHubClient, repo: &repos::Repo, action: &QueueAction) -> Result<BranchFacts, AppError> {
    use QueueAction::*;
    let default = repo.default_branch.clone();
    let target = match action {
        BranchCreate { name, .. } | BranchDelete { name } => name.clone(),
        BranchProtect { branch, .. } | BranchUnprotect { branch } => branch.clone().or_else(|| default.clone()).unwrap_or_default(),
        _ => String::new(),
    };
    let mut f = BranchFacts { default: default.clone(), target: target.clone(), ..Default::default() };
    if default.is_none() || target.is_empty() || (matches!(action, BranchCreate { .. }) && !branches::valid_name(&target)) {
        return Ok(f);
    }
    let found = branch_exists(c, &repo.full_name, &target).await?;
    f.exists = found.is_some();
    f.protected = found.unwrap_or(false);
    if let BranchCreate { from, .. } = action {
        let from = from.clone().or(default).unwrap_or_default();
        f.from_exists = branch_exists(c, &repo.full_name, &from).await?.is_some();
    }
    if matches!(action, BranchProtect { .. } | BranchUnprotect { .. }) && f.exists {
        match branches::protection(c, &repo.full_name, &target).await {
            Ok(p) => f.protection = p,
            Err(e) if e.code == "branches.protection_unavailable" => f.unavailable = true,
            Err(e) => return Err(e),
        }
    }
    Ok(f)
}


#[derive(Debug, Clone, Default)]
pub struct MoveFacts {

    pub taken: bool,

    pub owner_exists: bool,
    pub owner_is_org: bool,
    pub can_create_in_org: bool,
}


pub fn evaluate_release(p: &releases::ReleasePlan) -> Verdict {
    if p.commits == 0 {
        (DryRunOutcome::Noop, Some("nothing_new"))
    } else if !releases::valid_tag(&p.tag) {
        (DryRunOutcome::Blocked, Some("bad_tag"))
    } else {
        (DryRunOutcome::Ready, Some("will_release"))
    }
}

pub fn evaluate_meta(action: &QueueAction, repo: &repos::Repo) -> Verdict {
    use DryRunOutcome::*;
    match action {
        QueueAction::RepoDescription { .. } if repo.archived => (Blocked, Some("archived_readonly")),
        QueueAction::RepoDescription { description } if repo.description.as_deref().unwrap_or("").trim() == description.trim() => (Noop, Some("same_description")),
        QueueAction::RepoDescription { .. } => (Ready, Some("will_update")),
        QueueAction::RepoTopics { .. } if repo.archived => (Blocked, Some("archived_readonly")),
        QueueAction::RepoTopics { add, remove } => {
            let cur = repo.topics.clone().unwrap_or_default();
            match repos::merged_topics(&cur, add, remove) {
                Err(_) => (Blocked, Some("too_many_topics")),
                Ok(next) if next == cur => (Noop, Some("same_topics")),
                Ok(_) => (Ready, Some("will_update")),
            }
        }
        _ => (Ready, None),
    }
}

pub fn evaluate_move(action: &QueueAction, repo: &repos::Repo, f: &MoveFacts) -> Verdict {
    use DryRunOutcome::*;
    let owner = repo.owner.login.as_str();
    match action {
        QueueAction::RepoRename { new_name } if !repos::valid_repo_name(new_name) => (Blocked, Some("bad_repo_name")),
        QueueAction::RepoRename { new_name } if new_name == &repo.name => (Noop, Some("same_name")),
        QueueAction::RepoRename { .. } if repo.archived => (Blocked, Some("archived_readonly")),
        QueueAction::RepoRename { .. } if f.taken => (Blocked, Some("name_taken")),
        QueueAction::RepoRename { .. } => (Ready, Some("will_rename")),
        QueueAction::RepoTransfer { new_name: Some(n), .. } if !n.is_empty() && !repos::valid_repo_name(n) => (Blocked, Some("bad_repo_name")),
        QueueAction::RepoTransfer { new_owner, .. } if new_owner.eq_ignore_ascii_case(owner) => (Noop, Some("same_owner")),
        QueueAction::RepoTransfer { .. } if !f.owner_exists => (Blocked, Some("owner_missing")),
        QueueAction::RepoTransfer { .. } if f.owner_is_org && !f.can_create_in_org => (Blocked, Some("not_org_member")),
        QueueAction::RepoTransfer { .. } if f.taken => (Blocked, Some("name_taken")),
        QueueAction::RepoTransfer { .. } if f.owner_is_org => (Ready, Some("will_transfer_org")),
        QueueAction::RepoTransfer { .. } => (Ready, Some("will_transfer_user")),
        _ => (Ready, None),
    }
}

async fn move_facts(c: &GitHubClient, repo: &repos::Repo, action: &QueueAction) -> Result<MoveFacts, AppError> {
    let mut f = MoveFacts::default();
    let (owner, name) = match action {
        QueueAction::RepoRename { new_name } => (repo.owner.login.clone(), new_name.clone()),
        QueueAction::RepoTransfer { new_owner, new_name } => (new_owner.clone(), new_name.clone().filter(|n| !n.is_empty()).unwrap_or_else(|| repo.name.clone())),
        _ => return Ok(f),
    };
    if let QueueAction::RepoTransfer { new_owner, .. } = action {
        match c.get_json::<serde_json::Value>(&format!("/users/{}", crate::github::client::enc(new_owner))).await {
            Ok(u) => {
                f.owner_exists = true;
                f.owner_is_org = u["type"].as_str() == Some("Organization");
            }
            Err(e) if e.code == "github.not_found" => return Ok(f),
            Err(e) => return Err(e),
        }
        if f.owner_is_org {

            f.can_create_in_org = match c.get_json::<serde_json::Value>(&format!("/user/memberships/orgs/{}", crate::github::client::enc(new_owner))).await {
                Ok(m) => m["state"].as_str() == Some("active"),
                Err(e) if matches!(e.code.as_str(), "github.not_found" | "github.forbidden") => false,
                Err(e) => return Err(e),
            };
        }
    }
    if repos::valid_repo_name(&name) {
        match repos::get(c, &format!("{owner}/{name}")).await {

            Ok(other) => f.taken = other.id != repo.id,
            Err(e) if e.code == "github.not_found" => {}
            Err(e) => return Err(e),
        }
    }
    Ok(f)
}

fn blocked(item: NewQueueItem, e: AppError) -> DryRunResult {
    let reason = if e.code == "github.not_found" { "not_found".to_string() } else { e.code };
    DryRunResult { repo: item.repo, action: item.action, outcome: DryRunOutcome::Blocked, reason: Some(reason) }
}

pub async fn dry_run(c: &GitHubClient, scopes: Option<Vec<String>>, items: Vec<NewQueueItem>) -> Vec<DryRunResult> {

    let mut names: Vec<String> = items.iter().map(|i| i.repo.clone()).collect();
    names.sort();
    names.dedup();
    let fetched = concurrent(names.clone(), |name| {
        let c = c.clone();
        async move { repos::get(&c, &name).await }
    })
    .await;
    let repo_map: HashMap<String, Result<repos::Repo, AppError>> = names.into_iter().zip(fetched).collect();


    concurrent(items, |item| {
        let c = c.clone();
        let scopes = scopes.clone();
        let repo = repo_map.get(&item.repo).cloned();
        async move {
            let repo = match repo {
                Some(Ok(r)) => r,
                Some(Err(e)) => return blocked(item, e),
                None => return blocked(item, AppError::new("github.not_found")),
            };
            let (mut outcome, mut reason) = evaluate_repo(&item.action, &repo, scopes.as_deref());
            if outcome == DryRunOutcome::Ready {
                if matches!(item.action, QueueAction::RepoDescription { .. } | QueueAction::RepoTopics { .. }) {
                    (outcome, reason) = evaluate_meta(&item.action, &repo);
                } else if matches!(item.action, QueueAction::RepoRename { .. } | QueueAction::RepoTransfer { .. }) {
                    match move_facts(&c, &repo, &item.action).await {
                        Ok(f) => (outcome, reason) = evaluate_move(&item.action, &repo, &f),
                        Err(e) => return blocked(item, e),
                    }
                } else if let QueueAction::ReleaseNext { bump, .. } = &item.action {
                    let Some(branch) = repo.default_branch.clone() else { return blocked(item, AppError::new("releases.empty_repo")) };
                    match releases::plan_next(&c, &item.repo, &branch, bump).await {
                        Ok(p) => (outcome, reason) = evaluate_release(&p),
                        Err(e) => return blocked(item, e),
                    }
                } else if item.action.is_branch() {
                    match branch_facts(&c, &repo, &item.action).await {
                        Ok(f) => (outcome, reason) = evaluate_branch(&item.action, &f),
                        Err(e) => return blocked(item, e),
                    }
                } else if let QueueAction::CollabSet { user, role } = &item.action {
                    match evaluate_collab_set(&c, &item.repo, user, *role).await {
                        Ok(v) => (outcome, reason) = v,
                        Err(e) => return blocked(item, e),
                    }
                } else if let QueueAction::CollabRemove { user } = &item.action {
                    match collaborators::is_collaborator(&c, &item.repo, user).await {
                        Ok(true) => {}
                        Ok(false) => (outcome, reason) = (DryRunOutcome::Noop, Some("not_collaborator")),
                        Err(e) => return blocked(item, e),
                    }
                } else if item.action.is_secrets() {
                    match secrets_state(&c, &item.repo, &item.action).await {
                        Ok(state) => (outcome, reason) = evaluate_secrets(&item.action, &state),
                        Err(e) => return blocked(item, e),
                    }
                } else if let QueueAction::SecurityFeature { feature, enabled } = &item.action {
                    match security::posture(&c, &item.repo).await {
                        Ok(p) => (outcome, reason) = evaluate_feature(*feature, *enabled, &p),
                        Err(e) => return blocked(item, e),
                    }
                } else if let QueueAction::AlertSet { alert, number, open, reason: why, .. } = &item.action {
                    match security::get_alert(&c, &item.repo, *alert, *number).await {
                        Ok(a) => (outcome, reason) = evaluate_alert(*open, why.as_deref(), &a),
                        Err(e) => return blocked(item, e),
                    }
                } else if item.action.is_hook() {
                    match hooks::list(&c, &item.repo, true).await {
                        Ok(existing) => (outcome, reason) = evaluate_hooks(&item.action, &existing),
                        Err(e) => return blocked(item, e),
                    }
                } else if let Some(number) = item.action.pr_number() {
                    match pulls::get(&c, &item.repo, number).await {
                        Ok(pr) => (outcome, reason) = evaluate_pull(&item.action, &pr),
                        Err(e) => return blocked(item, e),
                    }
                } else if let Some(number) = item.action.issue_number() {
                    match issues::get(&c, &item.repo, number).await {
                        Ok(issue) => (outcome, reason) = evaluate_issue(&item.action, &issue),
                        Err(e) => return blocked(item, e),
                    }
                } else if let QueueAction::LabelUpsert { name, .. } | QueueAction::LabelDelete { name } = &item.action {
                    match labels::get(&c, &item.repo, name).await {
                        Ok(l) => (outcome, reason) = evaluate_label(&item.action, Some(&l)),
                        Err(e) if e.code == "github.not_found" => (outcome, reason) = evaluate_label(&item.action, None),
                        Err(e) => return blocked(item, e),
                    }
                }
            }
            DryRunResult { repo: item.repo, action: item.action, outcome, reason: reason.map(Into::into) }
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn meta_verdicts() {
        use DryRunOutcome::*;
        let mut r = repo(true, true, false, false);
        r.description = Some("Hello".into());
        r.topics = Some(vec!["rust".into()]);
        assert_eq!(evaluate_meta(&QueueAction::RepoDescription { description: " Hello ".into() }, &r).0, Noop);
        assert_eq!(evaluate_meta(&QueueAction::RepoDescription { description: "New".into() }, &r).0, Ready);
        assert_eq!(evaluate_meta(&QueueAction::RepoTopics { add: vec!["Rust".into()], remove: vec![] }, &r).0, Noop);
        assert_eq!(evaluate_meta(&QueueAction::RepoTopics { add: vec!["cli".into()], remove: vec![] }, &r).0, Ready);
        let many = (0..25).map(|i| format!("t{i}")).collect();
        assert_eq!(evaluate_meta(&QueueAction::RepoTopics { add: many, remove: vec![] }, &r).1, Some("too_many_topics"));
    }

    #[test]
    fn move_verdicts() {
        use DryRunOutcome::*;
        let r = repo(true, true, false, false);
        let ok = MoveFacts { owner_exists: true, ..Default::default() };
        let rename = |n: &str| QueueAction::RepoRename { new_name: n.into() };
        assert_eq!(evaluate_move(&rename("new-name"), &r, &ok), (Ready, Some("will_rename")));
        assert_eq!(evaluate_move(&rename("r"), &r, &ok).0, Noop);
        assert_eq!(evaluate_move(&rename("bad name"), &r, &ok).1, Some("bad_repo_name"));
        assert_eq!(evaluate_move(&rename("x"), &r, &MoveFacts { taken: true, ..ok.clone() }).1, Some("name_taken"));
        assert_eq!(evaluate_move(&rename("x"), &repo(true, true, true, false), &ok).1, Some("archived_readonly"));
        let tr = |o: &str| QueueAction::RepoTransfer { new_owner: o.into(), new_name: None };
        assert_eq!(evaluate_move(&tr("O"), &r, &ok).0, Noop, "same owner (case-insensitive)");
        assert_eq!(evaluate_move(&tr("someone"), &r, &MoveFacts::default()).1, Some("owner_missing"));
        assert_eq!(evaluate_move(&tr("org"), &r, &MoveFacts { owner_exists: true, owner_is_org: true, ..Default::default() }).1, Some("not_org_member"));
        assert_eq!(evaluate_move(&tr("org"), &r, &MoveFacts { owner_exists: true, owner_is_org: true, can_create_in_org: true, ..Default::default() }).1, Some("will_transfer_org"));
        assert_eq!(evaluate_move(&tr("friend"), &r, &ok).1, Some("will_transfer_user"));
    }

    #[test]
    fn branch_verdicts() {
        use DryRunOutcome::*;
        let f = |exists, protected| BranchFacts { default: Some("main".into()), target: "dev".into(), exists, protected, from_exists: true, ..Default::default() };
        let del = QueueAction::BranchDelete { name: "dev".into() };
        assert_eq!(evaluate_branch(&del, &f(true, false)).0, Ready);
        assert_eq!(evaluate_branch(&del, &f(false, false)), (Noop, Some("branch_absent")));
        assert_eq!(evaluate_branch(&del, &f(true, true)), (Blocked, Some("branch_protected")));
        let main = BranchFacts { target: "main".into(), ..f(true, false) };
        assert_eq!(evaluate_branch(&QueueAction::BranchDelete { name: "main".into() }, &main), (Blocked, Some("branch_default")));
        let create = QueueAction::BranchCreate { name: "dev".into(), from: None };
        assert_eq!(evaluate_branch(&create, &f(true, false)), (Noop, Some("branch_exists")));
        assert_eq!(evaluate_branch(&QueueAction::BranchCreate { name: "a b".into(), from: None }, &f(false, false)).1, Some("bad_branch_name"));
        let rules = Protection { require_pr: true, approvals: 1, ..Default::default() };
        let protect = QueueAction::BranchProtect { branch: None, rules: rules.clone() };
        assert_eq!(evaluate_branch(&protect, &BranchFacts { protection: Some(rules), ..f(true, true) }), (Noop, Some("protection_same")));
        assert_eq!(evaluate_branch(&protect, &BranchFacts { unavailable: true, ..f(true, false) }).1, Some("protection_unavailable"));
        assert_eq!(evaluate_branch(&QueueAction::BranchUnprotect { branch: None }, &f(true, false)), (Noop, Some("not_protected")));
        assert_eq!(evaluate_branch(&del, &BranchFacts { default: None, ..f(true, false) }).1, Some("empty_repo"));
    }
    use crate::github::issues::SimpleUser;
    use crate::github::repos::{Repo, RepoOwner, RepoPermissions};

    fn repo(admin: bool, push: bool, archived: bool, private: bool) -> Repo {
        Repo {
            id: 1,
            name: "r".into(),
            full_name: "o/r".into(),
            owner: RepoOwner { login: "o".into(), avatar_url: String::new() },
            private,
            fork: false,
            archived,
            is_template: false,
            description: None,
            html_url: String::new(),
            homepage: None,
            language: None,
            topics: None,
            stargazers_count: 0,
            forks_count: 0,
            watchers_count: 0,
            open_issues_count: 0,
            size: 0,
            default_branch: None,
            created_at: String::new(),
            updated_at: String::new(),
            pushed_at: None,
            visibility: None,
            permissions: Some(RepoPermissions { admin, push, pull: true }),
            license: None,
        }
    }

    fn issue(open: bool, labels: &[&str], assignees: &[&str]) -> Issue {
        Issue {
            repo: "o/r".into(),
            number: 1,
            title: "t".into(),
            body: None,
            state: if open { "open" } else { "closed" }.into(),
            state_reason: None,
            html_url: String::new(),
            user: SimpleUser { login: "u".into(), avatar_url: String::new() },
            labels: labels.iter().map(|l| Label { name: l.to_string(), color: "fff".into(), description: None }).collect(),
            assignees: assignees.iter().map(|a| SimpleUser { login: a.to_string(), avatar_url: String::new() }).collect(),
            milestone: None,
            comments: 0,
            locked: false,
            author_association: String::new(),
            reactions: 0,
            created_at: String::new(),
            updated_at: String::new(),
            closed_at: None,
            is_pull_request: false,
        }
    }

    #[test]
    fn repo_actions_need_admin() {
        assert_eq!(evaluate_repo(&QueueAction::Archive, &repo(false, true, false, false), None).0, DryRunOutcome::Blocked);
        assert_eq!(evaluate_repo(&QueueAction::Archive, &repo(true, true, true, false), None).0, DryRunOutcome::Noop);
        assert_eq!(evaluate_repo(&QueueAction::SetPublic, &repo(true, true, true, true), None).1, Some("archived_readonly"));
        let scopes = vec!["repo".to_string()];
        assert_eq!(evaluate_repo(&QueueAction::Delete, &repo(true, true, false, false), Some(&scopes)).0, DryRunOutcome::Blocked);
    }

    #[test]
    fn access_actions_need_admin_and_protect_owner() {
        let set = QueueAction::CollabSet { user: "O".into(), role: Role::Write };
        assert_eq!(evaluate_repo(&set, &repo(false, true, false, false), None).1, Some("no_admin"));
        assert_eq!(evaluate_repo(&set, &repo(true, true, false, false), None).1, Some("is_owner"));
        let other = QueueAction::CollabRemove { user: "someone".into() };
        assert_eq!(evaluate_repo(&other, &repo(true, true, false, false), None).0, DryRunOutcome::Ready);
    }

    #[test]
    fn issue_actions_need_push_and_writable_repo() {
        let a = QueueAction::IssueReopen { number: 1 };
        assert_eq!(evaluate_repo(&a, &repo(false, false, false, false), None).1, Some("no_push"));
        assert_eq!(evaluate_repo(&a, &repo(true, true, true, false), None).1, Some("archived_readonly"));
        assert_eq!(evaluate_repo(&a, &repo(false, true, false, false), None).0, DryRunOutcome::Ready);
    }

    #[test]
    fn issue_state_noops() {
        let close = QueueAction::IssueClose { number: 1, reason: super::super::CloseReason::Completed };
        assert_eq!(evaluate_issue(&close, &issue(false, &[], &[])).1, Some("already_closed"));
        assert_eq!(evaluate_issue(&close, &issue(true, &[], &[])).0, DryRunOutcome::Ready);
        let add = QueueAction::IssueAddLabels { number: 1, labels: vec!["Bug".into()] };
        assert_eq!(evaluate_issue(&add, &issue(true, &["bug"], &[])).1, Some("labels_present"));
        let un = QueueAction::IssueUnassign { number: 1, assignees: vec!["x".into()] };
        assert_eq!(evaluate_issue(&un, &issue(true, &[], &["y"])).1, Some("not_assigned"));
    }

    #[test]
    fn pull_merge_checks() {
        let base = serde_json::json!({
            "number": 1, "node_id": "n", "title": "t", "body": null, "state": "open", "draft": false, "merged": false,
            "mergeable": true, "mergeable_state": "clean", "html_url": "", "user": null,
            "head": { "ref": "f", "sha": "1", "label": "o:f" }, "base": { "ref": "main", "sha": "2", "label": "o:main", "repo": { "full_name": "o/r" } },
            "auto_merge": null, "created_at": "", "updated_at": "", "closed_at": null, "merged_at": null, "merged_by": null
        });
        let pr = |patch: serde_json::Value| {
            let mut v = base.clone();
            for (k, val) in patch.as_object().unwrap() {
                v[k] = val.clone();
            }
            crate::github::pulls::tests_support::from_value(v)
        };
        let merge = QueueAction::PrMerge { number: 1, method: crate::github::pulls::MergeMethod::Squash };
        assert_eq!(evaluate_pull(&merge, &pr(serde_json::json!({}))).0, DryRunOutcome::Ready);
        assert_eq!(evaluate_pull(&merge, &pr(serde_json::json!({ "draft": true }))).1, Some("pr_draft"));
        assert_eq!(evaluate_pull(&merge, &pr(serde_json::json!({ "mergeable": false }))).1, Some("pr_conflicts"));
        assert_eq!(evaluate_pull(&merge, &pr(serde_json::json!({ "merged": true }))).1, Some("already_merged"));
        let upd = QueueAction::PrUpdateBranch { number: 1 };
        assert_eq!(evaluate_pull(&upd, &pr(serde_json::json!({}))).1, Some("up_to_date"));
        assert_eq!(evaluate_pull(&upd, &pr(serde_json::json!({ "mergeable_state": "behind" }))).0, DryRunOutcome::Ready);
    }

    #[test]
    fn hook_actions_keyed_by_url() {
        use crate::github::hooks::{parse_hook, HookInput, HookPatch};
        let existing = vec![parse_hook(&serde_json::json!({
            "id": 1, "active": true, "events": ["push"], "config": { "url": "https://ci.example.com/hook", "content_type": "json" }
        }))];
        let input = |url: &str| HookInput { url: url.into(), content_type: "json".into(), secret: None, insecure_ssl: false, events: vec!["push".into()], active: true };
        assert_eq!(evaluate_hooks(&QueueAction::HookCreate { config: input("https://ci.example.com/hook/") }, &existing).1, Some("hook_exists"));
        assert_eq!(evaluate_hooks(&QueueAction::HookCreate { config: input("https://other.example.com") }, &existing).1, Some("will_create"));
        let same = QueueAction::HookUpdate { url: "https://ci.example.com/hook".into(), patch: HookPatch { active: Some(true), ..Default::default() } };
        assert_eq!(evaluate_hooks(&same, &existing).1, Some("hook_same"));
        let off = QueueAction::HookUpdate { url: "https://ci.example.com/hook".into(), patch: HookPatch { active: Some(false), ..Default::default() } };
        assert_eq!(evaluate_hooks(&off, &existing).1, Some("will_update"));
        assert_eq!(evaluate_hooks(&QueueAction::HookDelete { url: "https://nope".into() }, &existing).1, Some("hook_absent"));
        assert_eq!(evaluate_hooks(&QueueAction::HookDelete { url: "https://ci.example.com/hook".into() }, &existing).0, DryRunOutcome::Ready);
    }

    #[test]
    fn secrets_actions() {
        use crate::github::secrets::{parse_environment, EnvConfig};
        let repo_scope = Scope::Repo;
        let set = |name: &str| QueueAction::SecretSet { scope: repo_scope.clone(), name: name.into(), value: "v".into() };
        let names = SecretsState::Secrets(vec!["NPM_TOKEN".into()]);
        assert_eq!(evaluate_secrets(&set("npm_token"), &names).1, Some("will_update"));
        assert_eq!(evaluate_secrets(&set("NEW_ONE"), &names).1, Some("will_create"));
        assert_eq!(evaluate_secrets(&set("GITHUB_X"), &names).1, Some("bad_name"));
        assert_eq!(evaluate_secrets(&set("A"), &SecretsState::ScopeMissing).1, Some("env_missing"));
        let del = QueueAction::SecretDelete { scope: repo_scope.clone(), name: "GONE".into() };
        assert_eq!(evaluate_secrets(&del, &names).1, Some("secret_absent"));

        let vars = SecretsState::Variables(vec![Variable { name: "REGION".into(), value: "eu".into(), created_at: String::new(), updated_at: String::new() }]);
        let var = |v: &str| QueueAction::VarSet { scope: repo_scope.clone(), name: "region".into(), value: v.into() };
        assert_eq!(evaluate_secrets(&var("eu"), &vars).1, Some("var_same"));
        assert_eq!(evaluate_secrets(&var("us"), &vars).1, Some("will_update"));

        let prod = parse_environment(&serde_json::json!({ "name": "production", "protection_rules": [{ "type": "wait_timer", "wait_timer": 10 }] }));
        let up = |wait: u32| QueueAction::EnvUpsert { name: "production".into(), config: EnvConfig { wait_timer: wait, can_admins_bypass: true, ..Default::default() } };
        assert_eq!(evaluate_secrets(&up(10), &SecretsState::Env(Some(prod.clone()))).1, Some("env_same"));
        assert_eq!(evaluate_secrets(&up(0), &SecretsState::Env(Some(prod))).1, Some("will_update"));
        assert_eq!(evaluate_secrets(&up(0), &SecretsState::Env(None)).1, Some("will_create"));
        assert_eq!(evaluate_secrets(&QueueAction::EnvDelete { name: "x".into() }, &SecretsState::Env(None)).1, Some("env_absent"));


        let json = serde_json::to_string(&QueueAction::SecretSet { scope: repo_scope, name: "K".into(), value: "s3cret".into() }.redacted()).unwrap();
        assert!(!json.contains("s3cret"));
    }

    #[test]
    fn hook_secrets_never_leave_memory() {
        use crate::github::hooks::{HookInput, HookPatch};
        let create = QueueAction::HookCreate { config: HookInput { url: "u".into(), content_type: "json".into(), secret: Some("s3cret".into()), insecure_ssl: false, events: vec![], active: true } };
        let json = serde_json::to_string(&create.redacted()).unwrap();
        assert!(!json.contains("s3cret"));
        assert!(create.redacted().lost_secret() && !create.lost_secret(), "a restored item must not run without its secret");
        let removal = QueueAction::HookUpdate { url: "u".into(), patch: HookPatch { secret: Some(String::new()), ..Default::default() } };
        assert_eq!(removal.redacted(), removal, "removing a secret is not sensitive");
    }

    #[test]
    fn label_upsert_create_update_noop() {
        let up = QueueAction::LabelUpsert { name: "bug".into(), color: "ff0000".into(), description: None };
        assert_eq!(evaluate_label(&up, None).1, Some("will_create"));
        let same = Label { name: "Bug".into(), color: "FF0000".into(), description: None };
        assert_eq!(evaluate_label(&up, Some(&same)).0, DryRunOutcome::Noop);
        let other = Label { color: "00ff00".into(), ..same };
        assert_eq!(evaluate_label(&up, Some(&other)).1, Some("will_update"));
        assert_eq!(evaluate_label(&QueueAction::LabelDelete { name: "x".into() }, None).0, DryRunOutcome::Noop);
    }

    #[test]
    fn security_features_and_alerts() {
        use crate::github::security::{AlertKind, Feature, FeatureState::*, Posture};
        let p = Posture { dependabot_alerts: Off, security_updates: Off, secret_scanning: On, push_protection: On, private_reporting: Unavailable, code_scanning: Off };
        assert_eq!(evaluate_feature(Feature::PrivateReporting, true, &p).1, Some("feature_unavailable"));
        assert_eq!(evaluate_feature(Feature::SecretScanning, true, &p).0, DryRunOutcome::Noop);
        assert_eq!(evaluate_feature(Feature::SecurityUpdates, true, &p).1, Some("also_alerts_on"));
        assert_eq!(evaluate_feature(Feature::SecretScanning, false, &p).1, Some("also_push_off"));
        assert_eq!(evaluate_feature(Feature::CodeScanning, true, &p), (DryRunOutcome::Ready, None));

        let mut a = security::Alert::from_dependabot(&serde_json::json!({ "number": 1, "state": "open" }));
        assert_eq!(a.kind, AlertKind::Dependency);
        assert_eq!(evaluate_alert(false, Some("tolerable_risk"), &a), (DryRunOutcome::Ready, None));
        assert_eq!(evaluate_alert(false, Some("revoked"), &a).1, Some("bad_reason"));
        assert_eq!(evaluate_alert(true, None, &a).1, Some("alert_open"));
        a.state = "dismissed".into();
        assert_eq!(evaluate_alert(true, None, &a), (DryRunOutcome::Ready, None));
        assert_eq!(evaluate_alert(false, Some("not_used"), &a).1, Some("alert_closed"));
        a.state = "fixed".into();
        assert_eq!(evaluate_alert(true, None, &a).1, Some("alert_fixed"));
    }
}
