mod dry_run;
mod engine;

pub use dry_run::{dry_run, DryRunResult};
pub use engine::Queue;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

use crate::error::{AppError, AppResult};
use crate::github::branches::{self, Protection};
use crate::github::releases;
use crate::github::issues::{self, IssuePatch};
use crate::github::labels::{self, Label};
use crate::github::collaborators::{self, Role};
use crate::github::hooks::{self, HookInput, HookPatch};
use crate::github::secrets::{self, EnvConfig, Scope};
use crate::github::security::{self, AlertKind, Feature};
use crate::github::pulls::{self, MergeMethod};
use crate::github::{repos, GitHubClient};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CloseReason {
    Completed,
    NotPlanned,
}


#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum QueueAction {
    Delete,
    Archive,
    Unarchive,
    SetPrivate,
    SetPublic,
    IssueClose { number: u32, reason: CloseReason },
    IssueReopen { number: u32 },
    IssueAddLabels { number: u32, labels: Vec<String> },
    IssueRemoveLabel { number: u32, label: String },
    IssueAssign { number: u32, assignees: Vec<String> },
    IssueUnassign { number: u32, assignees: Vec<String> },
    IssueSetMilestone { number: u32, milestone: Option<u32> },
    IssueLock { number: u32 },
    IssueUnlock { number: u32 },

    LabelUpsert { name: String, color: String, description: Option<String> },
    LabelDelete { name: String },
    PrMerge { number: u32, method: MergeMethod },
    PrClose { number: u32 },
    PrReopen { number: u32 },
    PrRequestReviewers { number: u32, reviewers: Vec<String> },
    PrUpdateBranch { number: u32 },

    CollabSet { user: String, role: Role },
    CollabRemove { user: String },
    InviteCancel { id: u64, user: String },

    HookCreate { config: HookInput },

    HookUpdate { url: String, patch: HookPatch },

    HookDelete { url: String },

    SecretSet { scope: Scope, name: String, value: String },
    SecretDelete { scope: Scope, name: String },

    VarSet { scope: Scope, name: String, value: String },
    VarDelete { scope: Scope, name: String },

    EnvUpsert { name: String, config: EnvConfig },

    EnvDelete { name: String },

    SecurityFeature { feature: Feature, enabled: bool },

    AlertSet { alert: AlertKind, number: u32, open: bool, reason: Option<String>, comment: Option<String>, title: String },

    BranchCreate { name: String, from: Option<String> },
    BranchDelete { name: String },

    BranchProtect { branch: Option<String>, rules: Protection },
    BranchUnprotect { branch: Option<String> },

    RepoRename { new_name: String },

    RepoTransfer { new_owner: String, new_name: Option<String> },

    RepoDescription { description: String },

    RepoTopics { add: Vec<String>, remove: Vec<String> },


    ReleaseNext { bump: String, draft: bool, prerelease: bool },
}


pub const REDACTED: &str = "\u{2022}redacted\u{2022}";

impl QueueAction {

    pub fn is_repo_level(&self) -> bool {
        matches!(self, Self::Delete | Self::Archive | Self::Unarchive | Self::SetPrivate | Self::SetPublic) || self.is_access() || self.is_hook() || self.is_secrets()
            || matches!(self, Self::SecurityFeature { .. } | Self::BranchProtect { .. } | Self::BranchUnprotect { .. } | Self::RepoRename { .. } | Self::RepoTransfer { .. } | Self::RepoDescription { .. } | Self::RepoTopics { .. })
    }

    pub fn is_branch(&self) -> bool {
        matches!(self, Self::BranchCreate { .. } | Self::BranchDelete { .. } | Self::BranchProtect { .. } | Self::BranchUnprotect { .. })
    }

    pub fn is_secrets(&self) -> bool {
        matches!(
            self,
            Self::SecretSet { .. } | Self::SecretDelete { .. } | Self::VarSet { .. } | Self::VarDelete { .. } | Self::EnvUpsert { .. } | Self::EnvDelete { .. }
        )
    }

    pub fn is_hook(&self) -> bool {
        matches!(self, Self::HookCreate { .. } | Self::HookUpdate { .. } | Self::HookDelete { .. })
    }


    pub fn redacted(&self) -> QueueAction {
        let hide = |s: &Option<String>| s.as_ref().map(|x| if x.is_empty() { String::new() } else { REDACTED.to_string() });
        match self {
            Self::HookCreate { config } => Self::HookCreate { config: HookInput { secret: hide(&config.secret), ..config.clone() } },
            Self::HookUpdate { url, patch } => Self::HookUpdate { url: url.clone(), patch: HookPatch { secret: hide(&patch.secret), ..patch.clone() } },
            Self::SecretSet { scope, name, .. } => Self::SecretSet { scope: scope.clone(), name: name.clone(), value: REDACTED.into() },
            other => other.clone(),
        }
    }


    fn lost_secret(&self) -> bool {
        match self {
            Self::HookCreate { config } => config.secret.as_deref() == Some(REDACTED),
            Self::HookUpdate { patch, .. } => patch.secret.as_deref() == Some(REDACTED),
            Self::SecretSet { value, .. } => value == REDACTED,
            _ => false,
        }
    }

    pub fn is_access(&self) -> bool {
        matches!(self, Self::CollabSet { .. } | Self::CollabRemove { .. } | Self::InviteCancel { .. })
    }

    pub fn pr_number(&self) -> Option<u32> {
        use QueueAction::*;
        match self {
            PrMerge { number, .. } | PrClose { number } | PrReopen { number } | PrRequestReviewers { number, .. } | PrUpdateBranch { number } => Some(*number),
            _ => None,
        }
    }

    pub fn issue_number(&self) -> Option<u32> {
        use QueueAction::*;
        match self {
            IssueClose { number, .. }
            | IssueReopen { number }
            | IssueAddLabels { number, .. }
            | IssueRemoveLabel { number, .. }
            | IssueAssign { number, .. }
            | IssueUnassign { number, .. }
            | IssueSetMilestone { number, .. }
            | IssueLock { number }
            | IssueUnlock { number } => Some(*number),
            _ => None,
        }
    }


    pub async fn execute(&self, c: &GitHubClient, repo: &str) -> AppResult<()> {
        use QueueAction::*;
        if self.lost_secret() {
            return Err(AppError::new("hooks.secret_lost"));
        }
        match self {
            Delete => repos::delete(c, repo).await,
            Archive => repos::set_archived(c, repo, true).await,
            Unarchive => repos::set_archived(c, repo, false).await,
            SetPrivate => repos::set_private(c, repo, true).await,
            SetPublic => repos::set_private(c, repo, false).await,
            IssueClose { number, reason } => {
                let reason = match reason {
                    CloseReason::Completed => "completed",
                    CloseReason::NotPlanned => "not_planned",
                };
                let patch = IssuePatch { state: Some("closed".into()), state_reason: Some(reason.into()), ..Default::default() };
                issues::update(c, repo, *number, &patch).await.map(drop)
            }
            IssueReopen { number } => {
                let patch = IssuePatch { state: Some("open".into()), ..Default::default() };
                issues::update(c, repo, *number, &patch).await.map(drop)
            }
            IssueAddLabels { number, labels } => issues::add_labels(c, repo, *number, labels).await,
            IssueRemoveLabel { number, label } => issues::remove_label(c, repo, *number, label).await,
            IssueAssign { number, assignees } => issues::add_assignees(c, repo, *number, assignees).await,
            IssueUnassign { number, assignees } => issues::remove_assignees(c, repo, *number, assignees).await,
            IssueSetMilestone { number, milestone } => {
                let patch = IssuePatch { milestone: *milestone, clear_milestone: milestone.is_none(), ..Default::default() };
                issues::update(c, repo, *number, &patch).await.map(drop)
            }
            IssueLock { number } => issues::set_locked(c, repo, *number, true).await,
            IssueUnlock { number } => issues::set_locked(c, repo, *number, false).await,
            LabelUpsert { name, color, description } => {
                let label = Label { name: name.clone(), color: color.clone(), description: description.clone() };
                match labels::get(c, repo, name).await {
                    Ok(_) => labels::update(c, repo, name, &label).await,
                    Err(e) if e.code == "github.not_found" => labels::create(c, repo, &label).await,
                    Err(e) => Err(e),
                }
            }
            LabelDelete { name } => labels::delete(c, repo, name).await,
            PrMerge { number, method } => pulls::merge(c, repo, *number, *method).await,
            PrClose { number } => pulls::set_state(c, repo, *number, false).await,
            PrReopen { number } => pulls::set_state(c, repo, *number, true).await,
            PrRequestReviewers { number, reviewers } => pulls::request_reviewers(c, repo, *number, reviewers, false).await,
            PrUpdateBranch { number } => pulls::update_branch(c, repo, *number).await,
            CollabSet { user, role } => collaborators::set(c, repo, user, *role).await,
            CollabRemove { user } => collaborators::remove(c, repo, user).await,
            InviteCancel { id, .. } => collaborators::cancel_invitation(c, repo, *id).await,
            HookCreate { config } => hooks::create(c, repo, config).await.map(drop),
            HookUpdate { url, patch } => {
                let matching: Vec<_> = hooks::list(c, repo, true).await?.into_iter().filter(|h| hooks::same_url(&h.url, url)).collect();
                if matching.is_empty() {
                    return Err(AppError::new("hooks.not_found").detail(url.clone()));
                }
                for h in matching {
                    let p = hooks::effective_patch(&h, patch);
                    if !p.is_empty() {
                        hooks::patch(c, repo, h.id, &p).await?;
                    }
                }
                Ok(())
            }
            SecretSet { scope, name, value } => secrets::set_secret(c, repo, scope, name, value).await,
            SecretDelete { scope, name } => secrets::delete_secret(c, repo, scope, name).await,
            VarSet { scope, name, value } => secrets::set_variable(c, repo, scope, name, value).await,
            VarDelete { scope, name } => secrets::delete_variable(c, repo, scope, name).await,
            EnvUpsert { name, config } => secrets::upsert_environment(c, repo, name, config).await,
            EnvDelete { name } => secrets::delete_environment(c, repo, name).await,
            SecurityFeature { feature, enabled } => security::set_feature(c, repo, *feature, *enabled).await,
            AlertSet { alert, number, open, reason, comment, .. } => {
                security::set_alert(c, repo, *alert, *number, *open, reason.as_deref(), comment.as_deref()).await
            }
            RepoRename { new_name } => repos::rename(c, repo, new_name).await,
            RepoDescription { description } => repos::set_description(c, repo, description).await,
            RepoTopics { add, remove } => repos::edit_topics(c, repo, add, remove).await,
            ReleaseNext { bump, draft, prerelease } => {
                let branch = repos::get(c, repo).await?.default_branch.ok_or_else(|| AppError::new("releases.empty_repo"))?;
                releases::release_next(c, repo, &branch, bump, *draft, *prerelease).await
            }
            RepoTransfer { new_owner, new_name } => repos::transfer(c, repo, new_owner, new_name.as_deref()).await,
            BranchCreate { name, from } => branches::create(c, repo, name, from.as_deref()).await,
            BranchDelete { name } => branches::delete(c, repo, name).await,
            BranchProtect { branch, rules } => branches::protect(c, repo, &target_branch(c, repo, branch.as_deref()).await?, rules).await,
            BranchUnprotect { branch } => branches::unprotect(c, repo, &target_branch(c, repo, branch.as_deref()).await?).await,
            HookDelete { url } => {
                for h in hooks::list(c, repo, true).await?.into_iter().filter(|h| hooks::same_url(&h.url, url)) {
                    hooks::delete(c, repo, h.id).await?;
                }
                Ok(())
            }
        }
    }
}


pub async fn target_branch(c: &GitHubClient, repo: &str, branch: Option<&str>) -> AppResult<String> {
    match branch {
        Some(b) => Ok(b.to_string()),
        None => repos::get(c, repo).await?.default_branch.ok_or_else(|| AppError::new("branches.empty_repo")),
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ItemStatus {
    Pending,
    Running,
    Done,
    Failed,
    Skipped,
    Cancelled,
}

impl ItemStatus {
    pub fn is_finished(self) -> bool {
        !matches!(self, Self::Pending | Self::Running)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct NewQueueItem {
    pub repo: String,
    pub action: QueueAction,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct QueueItem {
    pub id: String,
    pub account_id: String,
    pub repo: String,
    pub action: QueueAction,
    pub status: ItemStatus,
    pub error: Option<AppError>,
    pub created_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum QueuePhase {
    #[default]
    Idle,
    Grace,
    Running,
    Paused,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct QueueSnapshot {
    pub items: Vec<QueueItem>,
    pub phase: QueuePhase,
    pub grace_remaining: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct QueueFinished {
    pub done: u32,
    pub failed: u32,
}
