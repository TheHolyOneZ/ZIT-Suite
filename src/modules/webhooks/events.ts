export const EVENT_GROUPS = {
  code: [
    "push",
    "create",
    "delete",
    "release",
    "fork",
    "commit_comment",
    "merge_group",
    "gollum",
    "page_build",
  ],
  collaboration: [
    "issues",
    "issue_comment",
    "sub_issues",
    "pull_request",
    "pull_request_review",
    "pull_request_review_comment",
    "pull_request_review_thread",
    "label",
    "milestone",
    "discussion",
    "discussion_comment",
  ],
  ci: [
    "check_run",
    "check_suite",
    "status",
    "workflow_run",
    "workflow_job",
    "workflow_dispatch",
    "deployment",
    "deployment_status",
    "deployment_review",
    "deployment_protection_rule",
  ],
  security: [
    "code_scanning_alert",
    "dependabot_alert",
    "secret_scanning_alert",
    "secret_scanning_alert_location",
    "secret_scanning_scan",
    "repository_vulnerability_alert",
    "repository_advisory",
    "security_and_analysis",
    "deploy_key",
  ],
  repository: [
    "repository",
    "repository_ruleset",
    "branch_protection_rule",
    "branch_protection_configuration",
    "repository_import",
    "custom_property_values",
    "member",
    "team_add",
    "public",
    "star",
    "watch",
    "package",
    "registry_package",
    "meta",
  ],
} as const;

export type EventGroup = keyof typeof EVENT_GROUPS;
export const ALL_EVENTS: string[] = Object.values(EVENT_GROUPS).flat();


export type EventMode = "push" | "all" | "custom";

export function eventMode(events: string[]): EventMode {
  if (events.includes("*")) return "all";
  if (events.length === 1 && events[0] === "push") return "push";
  return "custom";
}
