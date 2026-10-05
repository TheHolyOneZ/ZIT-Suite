import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FilePen,
  Flag,
  KeyRound,
  ShieldCheck,
  Tags,
  Ticket,
  Trash2,
  Users,
  Webhook,
  Workflow,
  GitBranch,
  Rocket,
} from "lucide-react";
import { formatDate, formatNumber, formatRelative, formatSizeKb } from "@/core/i18n/format";
import { getModule } from "@/core/modules/registry";
import { sheets, type SheetParams } from "@/core/sheets/store";
import { toast } from "@/core/store/toasts";
import { Badge, Button, EmptyState, Mark, Meter, Panel, Plotter, useNow } from "@/ui";
import { requestQueue } from "@/modules/queue/store";
import { useLanguages, useRepoRows } from "./api";
import { healthGlyph, healthTone } from "./health";
import { languageColor } from "./languageColors";
import { TagMenu } from "./TagMenu";


export function RepoSheet({ params }: { params: SheetParams }) {
  useNow();
  const { t } = useTranslation(["repos", "common"]);
  const fullName = String(params.fullName);
  const { rows, query } = useRepoRows();
  const row = rows.find((r) => r.repo.full_name === fullName);
  const langs = useLanguages(row ? fullName : null);

  if (!row) return query.isLoading ? <Plotter /> : <EmptyState title={t("detail.gone")} />;
  const { repo, health } = row;
  const admin = repo.permissions?.admin ?? false;
  const totalBytes = (langs.data ?? []).reduce((a, l) => a + l.bytes, 0);
  const issuesEnabled = !!getModule("issues");
  const accessEnabled = !!getModule("collaborators") && admin;
  const hooksEnabled = !!getModule("webhooks") && admin;
  const secretsEnabled = !!getModule("secrets") && admin;
  const securityEnabled = !!getModule("security") && admin;
  const filesEnabled = !!getModule("files");
  const actionsEnabled = !!getModule("actions");
  const branchesEnabled = !!getModule("branches");
  const releasesEnabled = !!getModule("releases");

  const stats: [string, string][] = [
    [t("detail.stars"), formatNumber(repo.stargazers_count)],
    [t("detail.forks"), formatNumber(repo.forks_count)],
    [t("detail.watchers"), formatNumber(repo.watchers_count)],
    [t("detail.issues"), formatNumber(repo.open_issues_count)],
    [t("detail.size"), formatSizeKb(repo.size)],
    [t("detail.branch"), repo.default_branch ?? "—"],
  ];

  return (
    <div className="flex h-full flex-col overflow-y-auto">

      <header className="grid grid-cols-[1fr_auto] gap-6 border-b border-line-strong bg-surface px-7 pt-6 pb-5">
        <div className="min-w-0">
          <div className="annot flex items-center gap-2">
            <Mark glyph={healthGlyph[health.status]} tone={healthTone[health.status]} size={12} />
            {repo.owner.login} / {t(`health.${health.status}`)} · {health.score}/100
          </div>
          <h1
            className="mt-1 truncate text-[26px] leading-tight font-semibold tracking-[-0.02em]"
            data-selectable
          >
            {repo.name}
          </h1>
          <p className="mt-1.5 max-w-3xl text-[13px] text-dim" data-selectable>
            {repo.description || <span className="text-faint italic">{t("detail.noDescription")}</span>}
          </p>
          <div className="mt-3 flex flex-wrap gap-1">
            <Badge tone={repo.private ? "warn" : "ok"} mono>
              {repo.private ? t("visibility.private") : t("visibility.public")}
            </Badge>
            {repo.archived && (
              <Badge tone="info" mono>
                {t("health.archived")}
              </Badge>
            )}
            {repo.fork && <Badge mono>{t("badges.fork")}</Badge>}
            {repo.is_template && <Badge mono>{t("badges.template")}</Badge>}
            {!admin && (
              <Badge tone="idle" mono>
                {t("badges.noAdmin")}
              </Badge>
            )}
            {repo.license && <Badge mono>{repo.license.spdx_id ?? repo.license.name}</Badge>}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Button size="sm" icon={ExternalLink} onClick={() => openUrl(repo.html_url)}>
            {t("detail.openGithub")}
          </Button>
          <Button
            size="sm"
            icon={Copy}
            onClick={async () => {
              await navigator.clipboard.writeText(`https://github.com/${repo.full_name}.git`);
              toast({ kind: "success", title: t("detail.cloneCopied") });
            }}
          >
            {t("detail.copyClone")}
          </Button>
          <TagMenu repos={[repo.full_name]} />
        </div>
      </header>

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)_320px] gap-6 p-7">
        <div className="space-y-6">

          <div className="grid grid-cols-3 border-t border-l border-line bg-surface 2xl:grid-cols-6">
            {stats.map(([k, v]) => (
              <div key={k} className="border-r border-b border-line px-3 py-3">
                <div className="annot !text-[9.5px]">{k}</div>
                <div className="num mt-1 truncate text-[16px]">{v}</div>
              </div>
            ))}
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <span className="annot">{t("detail.health")}</span>
              <span className="num text-[12px] text-dim">
                {t("detail.lastPush", { when: formatRelative(repo.pushed_at ?? repo.updated_at) })}
              </span>
            </div>
            <Meter value={health.score} tone={healthTone[health.status]} className="h-2.5" />
          </section>

          <section>
            <div className="annot mb-2">{t("detail.languages")}</div>
            {langs.isLoading ? (
              <Plotter />
            ) : totalBytes === 0 ? (
              <div className="text-[12px] text-faint">—</div>
            ) : (
              <>
                <div className="flex h-2.5 overflow-hidden rounded-[1px]">
                  {langs.data!.map((l) => (
                    <span
                      key={l.name}
                      style={{ width: `${(l.bytes / totalBytes) * 100}%`, background: languageColor(l.name) }}
                    />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-x-6 gap-y-1.5">
                  {langs.data!.slice(0, 12).map((l) => (
                    <div key={l.name} className="flex items-center gap-2 text-[12px]">
                      <span className="size-2 rounded-[1px]" style={{ background: languageColor(l.name) }} />
                      <span className="flex-1 truncate text-dim">{l.name}</span>
                      <span className="num text-[11px] text-faint">
                        {formatNumber(l.bytes / totalBytes, { style: "percent", maximumFractionDigits: 1 })}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {(repo.topics?.length ?? 0) > 0 && (
            <section>
              <div className="annot mb-2">{t("detail.topics")}</div>
              <div className="flex flex-wrap gap-1">
                {repo.topics!.map((tp) => (
                  <Badge key={tp} tone="accent">
                    {tp}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          <section className="num grid grid-cols-3 gap-4 text-[12px]">
            {(
              [
                [t("detail.created"), repo.created_at],
                [t("detail.updated"), repo.updated_at],
                [t("detail.pushed"), repo.pushed_at],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <div className="annot !text-[9.5px]">{k}</div>
                <div className="mt-0.5 text-dim">{formatDate(v)}</div>
              </div>
            ))}
          </section>
        </div>

        <aside className="space-y-4">
          {(issuesEnabled ||
            accessEnabled ||
            hooksEnabled ||
            secretsEnabled ||
            securityEnabled ||
            filesEnabled ||
            actionsEnabled ||
            branchesEnabled ||
            releasesEnabled) && (
            <Panel ticks className="p-3">
              <div className="annot mb-2">{t("detail.jumpTo")}</div>
              <div className="space-y-1">
                {(
                  [
                    ...(issuesEnabled
                      ? ([
                          [Ticket, t("detail.jumpIssues"), "issues", "issues"],
                          [Tags, t("detail.jumpLabels"), "issues", "labels"],
                          [Flag, t("detail.jumpMilestones"), "issues", "milestones"],
                        ] as const)
                      : []),
                    ...(accessEnabled
                      ? ([[Users, t("detail.jumpAccess"), "collaborators", "access"]] as const)
                      : []),
                    ...(hooksEnabled
                      ? ([[Webhook, t("detail.jumpHooks"), "webhooks", "hooks"]] as const)
                      : []),
                    ...(secretsEnabled
                      ? ([[KeyRound, t("detail.jumpSecrets"), "secrets", "secrets"]] as const)
                      : []),
                    ...(securityEnabled
                      ? ([[ShieldCheck, t("detail.jumpSecurity"), "security", "security"]] as const)
                      : []),
                    ...(filesEnabled ? ([[FilePen, t("detail.jumpFiles"), "files", "files"]] as const) : []),
                    ...(branchesEnabled
                      ? ([[GitBranch, t("detail.jumpBranches"), "branches", "branches"]] as const)
                      : []),
                    ...(actionsEnabled
                      ? ([[Workflow, t("detail.jumpActions"), "actions", "actions"]] as const)
                      : []),
                    ...(releasesEnabled
                      ? ([[Rocket, t("detail.jumpReleases"), "releases", "releases"]] as const)
                      : []),
                  ] as const
                ).map(([Icon, label, module, tab]) => (
                  <button
                    key={tab}
                    onClick={() => sheets.openWith(module, { repo: repo.full_name, tab })}
                    className="flex h-8 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[12.5px] text-dim hover:bg-surface-2 hover:text-text cursor-default"
                  >
                    <Icon size={14} />
                    <span className="flex-1">{label}</span>
                    <ArrowUpRight size={12} className="text-faint" />
                  </button>
                ))}
              </div>
            </Panel>
          )}

          <Panel ticks className="p-3">
            <div className="annot mb-2">{t("detail.operations")}</div>
            <p className="mb-3 text-[11.5px] text-faint">{t("detail.operationsHint")}</p>
            <div className="grid gap-2">
              {repo.archived ? (
                <Button
                  icon={ArchiveRestore}
                  disabled={!admin}
                  onClick={() => requestQueue([repo.full_name], { kind: "unarchive" })}
                >
                  {t("actions.unarchive")}
                </Button>
              ) : (
                <Button
                  icon={Archive}
                  disabled={!admin}
                  onClick={() => requestQueue([repo.full_name], { kind: "archive" })}
                >
                  {t("actions.archive")}
                </Button>
              )}
              <Button
                icon={repo.private ? Eye : EyeOff}
                disabled={!admin || repo.archived}
                onClick={() =>
                  requestQueue([repo.full_name], { kind: repo.private ? "set_public" : "set_private" })
                }
              >
                {repo.private ? t("actions.makePublic") : t("actions.makePrivate")}
              </Button>
              <Button
                variant="danger"
                icon={Trash2}
                disabled={!admin}
                onClick={() => requestQueue([repo.full_name], { kind: "delete" })}
              >
                {t("actions.delete")}
              </Button>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

export const openRepo = (fullName: string, name: string) => sheets.push("repos", "repo", { fullName, name });
