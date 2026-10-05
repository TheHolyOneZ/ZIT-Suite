import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, EyeOff, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/core/cn";
import type { SheetParams } from "@/core/sheets/store";
import { sheets } from "@/core/sheets/store";
import { Badge, Button, EmptyState, IconButton, Markdown, Mark, Panel, RelTime } from "@/ui";
import { useSecurityIndex } from "./api";
import { SLA, isOverdue } from "./model";
import { KindLabel, SeverityBadge } from "./parts";
import { useSecurityPrefs, useSecurityUi } from "./store";


export function GroupSheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["security", "common"]);
  const id = String(params.id);
  const { index } = useSecurityIndex();
  const sla = SLA[useSecurityPrefs((s) => s.sla)];
  const setUi = useSecurityUi((s) => s.set);
  const g = index.groups.find((x) => x.id === id);
  if (!g) return <EmptyState icon={<Mark glyph="tick" tone="ok" size={18} />} title={t("group.gone")} />;
  const first = g.items[0].alert;
  const described = g.items.find((i) => i.alert.description)?.alert.description;
  const dismiss = (items = g.items) =>
    setUi({
      dismiss: {
        kind: g.kind,
        alerts: items.map(({ repo, alert }) => ({
          repo,
          number: alert.number,
          title: alert.title || alert.key,
        })),
      },
    });

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-line-strong bg-surface px-6 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <KindLabel kind={g.kind} />
          <SeverityBadge s={g.severity} />
          {first.cvss != null && <Badge mono>CVSS {first.cvss.toFixed(1)}</Badge>}
        </div>
        <h2 className="mt-1 text-[18px] leading-snug font-semibold">{g.title || g.key}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-dim">
          {g.package && (
            <span className="num">
              {g.package}
              {g.ecosystem && <span className="text-faint"> · {g.ecosystem}</span>}
            </span>
          )}
          {g.kind === "dependency" &&
            (g.patched ? (
              <span className="text-ok">{t("group.fixedIn", { version: g.patched })}</span>
            ) : (
              <span className="text-warn">{t("group.noFix")}</span>
            ))}
          {g.kind === "code" && first.tool && <span>{first.tool}</span>}
          <span>{t("repos", { count: g.repos })}</span>
          {g.overdue > 0 && <span className="text-warn">{t("overdueCount", { count: g.overdue })}</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-[11.5px]">
          {first.ghsa && (
            <button
              className="num cursor-default text-dim hover:text-accent"
              onClick={() => void openUrl(`https://github.com/advisories/${first.ghsa}`)}
            >
              {first.ghsa}
            </button>
          )}
          {first.cve && (
            <button
              className="num cursor-default text-dim hover:text-accent"
              onClick={() => void openUrl(`https://nvd.nist.gov/vuln/detail/${first.cve}`)}
            >
              {first.cve}
            </button>
          )}
          {g.kind !== "dependency" && <span className="num text-faint">{g.key}</span>}
        </div>
        {g.kind === "secret" && (
          <p className="mt-3 flex items-start gap-2 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_7%,transparent)] p-2.5 text-[12px] text-danger">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" />
            {t("group.secretAdvice")}
          </p>
        )}
        {g.kind === "dependency" && (
          <p className="mt-3 flex items-start gap-2 text-[12px] text-dim">
            <Info size={13} className="mt-0.5 shrink-0 text-info" />
            {!g.patched
              ? t("group.depAdviceNoFix")
              : g.items.every(
                    (i) => index.repos.find((r) => r.repo === i.repo)?.posture.security_updates === "on",
                  )
                ? t("group.depAdviceBot", { pkg: g.package })
                : t("group.depAdvice", { pkg: g.package, version: g.patched })}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button icon={EyeOff} onClick={() => dismiss()}>
            {g.kind === "secret"
              ? t("group.resolveAll", { count: g.items.length })
              : t("group.dismissAll", { count: g.items.length })}
          </Button>
          {first.ghsa && (
            <Button
              variant="ghost"
              icon={ExternalLink}
              onClick={() => void openUrl(`https://github.com/advisories/${first.ghsa}`)}
            >
              {t("group.advisory")}
            </Button>
          )}
        </div>
      </header>

      <div className="space-y-4 p-4">
        <Panel className="overflow-hidden">
          <div className="border-b border-line px-3 py-2">
            <span className="annot">{t("group.where")}</span>
          </div>
          {g.items.map(({ repo, alert: a }) => {
            const late = isOverdue(a, sla);
            return (
              <div
                key={`${repo}#${a.number}`}
                className="group grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px_64px] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-surface-2"
              >
                <button
                  className="num min-w-0 cursor-default truncate text-left text-[12.5px] hover:text-accent"
                  onClick={() => sheets.push("security", "repo", { repo, title: repo.split("/")[1] })}
                >
                  {repo}
                </button>
                <span className="min-w-0">
                  <span className="num block truncate text-[11.5px] text-dim" title={a.location ?? undefined}>
                    {a.location ?? "—"}
                  </span>
                  {(a.vulnerable_range || a.validity || a.push_protection_bypassed) && (
                    <span className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-faint">
                      {a.vulnerable_range && <span className="num">{a.vulnerable_range}</span>}
                      {a.validity && (
                        <Badge tone={a.validity === "active" ? "danger" : undefined}>
                          {t(`validity.${a.validity as "active"}`)}
                        </Badge>
                      )}
                      {a.push_protection_bypassed && <Badge tone="warn">{t("bypassed")}</Badge>}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "flex items-center justify-end gap-1 text-right text-[11.5px]",
                    late ? "text-warn" : "text-faint",
                  )}
                >
                  {late && <Mark glyph="hourglass" tone="warn" size={11} title={t("overdue")} />}
                  <RelTime at={a.created_at} />
                </span>
                <span className="flex justify-end">
                  <IconButton
                    icon={ExternalLink}
                    label={t("openOnGitHub")}
                    size={12}
                    className="size-6"
                    onClick={() => void openUrl(a.html_url)}
                  />
                  <IconButton
                    icon={EyeOff}
                    label={g.kind === "secret" ? t("resolve") : t("dismiss")}
                    size={12}
                    className="size-6"
                    onClick={() => dismiss([{ repo, alert: a }])}
                  />
                </span>
              </div>
            );
          })}
        </Panel>
        {described && (
          <Panel className="p-4">
            <div className="annot mb-2">{t("group.details")}</div>
            <Markdown source={described} className="text-[12.5px]" />
          </Panel>
        )}
      </div>
    </div>
  );
}
