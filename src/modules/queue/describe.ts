import type { QueueAction } from "@/core/ipc";
import { tDynamic } from "@/core/i18n";


export function shortUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}


export function describeAction(a: QueueAction): { label: string; detail: string | null } {
  const label = tDynamic(`queue:actions.${a.kind}`);
  switch (a.kind) {
    case "issue_close":
      return { label, detail: `#${a.number} · ${tDynamic(`queue:reasons.${a.reason}`)}` };
    case "issue_add_labels":
      return { label, detail: `#${a.number} · ${a.labels.join(", ")}` };
    case "issue_remove_label":
      return { label, detail: `#${a.number} · ${a.label}` };
    case "issue_assign":
    case "issue_unassign":
      return { label, detail: `#${a.number} · ${a.assignees.map((x) => `@${x}`).join(", ")}` };
    case "issue_set_milestone":
      return {
        label,
        detail: `#${a.number} · ${a.milestone == null ? tDynamic("queue:reasons.none") : `M${a.milestone}`}`,
      };
    case "issue_reopen":
    case "issue_lock":
    case "issue_unlock":
      return { label, detail: `#${a.number}` };
    case "pr_merge":
      return { label, detail: `#${a.number} · ${tDynamic(`queue:methods.${a.method}`)}` };
    case "pr_request_reviewers":
      return { label, detail: `#${a.number} · ${a.reviewers.map((x) => `@${x}`).join(", ")}` };
    case "pr_close":
    case "pr_reopen":
    case "pr_update_branch":
      return { label, detail: `#${a.number}` };
    case "collab_set":
      return { label, detail: `@${a.user} · ${tDynamic(`queue:roles.${a.role}`)}` };
    case "collab_remove":
    case "invite_cancel":
      return { label, detail: `@${a.user}` };
    case "hook_create":
      return { label, detail: shortUrl(a.config.url) };
    case "hook_update": {
      const what = Object.entries(a.patch)
        .filter(([, v]) => v != null)
        .map(([k, v]) =>
          k === "active"
            ? tDynamic(v ? "queue:hookFields.resume" : "queue:hookFields.pause")
            : tDynamic(`queue:hookFields.${k}`),
        );
      return { label, detail: `${shortUrl(a.url)} · ${what.join(", ")}` };
    }
    case "hook_delete":
      return { label, detail: shortUrl(a.url) };
    case "secret_set":
    case "secret_delete":
    case "var_delete":
      return { label, detail: a.scope.kind === "env" ? `${a.scope.env} › ${a.name}` : a.name };
    case "var_set": {
      const where = a.scope.kind === "env" ? `${a.scope.env} › ${a.name}` : a.name;
      return { label, detail: `${where} = ${a.value.length > 40 ? `${a.value.slice(0, 40)}…` : a.value}` };
    }
    case "env_upsert":
    case "env_delete":
      return { label, detail: a.name };
    case "label_upsert":
    case "label_delete":
      return { label, detail: a.name };
    case "security_feature":
      return {
        label: tDynamic(a.enabled ? "queue:actions.security_on" : "queue:actions.security_off"),
        detail: tDynamic(`security:feature.${a.feature}.name`),
      };
    case "alert_set": {
      const verb = a.open
        ? "queue:actions.alert_reopen"
        : a.alert === "secret"
          ? "queue:actions.alert_resolve"
          : "queue:actions.alert_dismiss";
      return {
        label: tDynamic(verb),
        detail: `#${a.number} · ${a.title}${a.reason ? ` · ${a.reason}` : ""}`,
      };
    }
    case "repo_description":
      return {
        label,
        detail: a.description
          ? `“${a.description.length > 50 ? `${a.description.slice(0, 50)}…` : a.description}”`
          : "—",
      };
    case "repo_topics":
      return { label, detail: [...a.add.map((x) => `+${x}`), ...a.remove.map((x) => `−${x}`)].join(" ") };
    case "repo_rename":
      return { label, detail: `→ ${a.new_name}` };
    case "repo_transfer":
      return { label, detail: `→ ${a.new_owner}${a.new_name ? `/${a.new_name}` : ""}` };
    case "branch_create":
      return { label, detail: a.from ? `${a.name} ← ${a.from}` : a.name };
    case "branch_delete":
      return { label, detail: a.name };
    case "release_next":
      return {
        label,
        detail: [
          tDynamic(`queue:bump.${a.bump}`),
          a.draft && tDynamic("queue:bump.draft"),
          a.prerelease && tDynamic("queue:bump.prerelease"),
        ]
          .filter(Boolean)
          .join(" · "),
      };
    case "branch_protect":
    case "branch_unprotect":
      return { label, detail: a.branch ?? tDynamic("queue:defaultBranch") };
    default:
      return { label, detail: null };
  }
}
