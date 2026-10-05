import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowUpCircle, GitPullRequest } from "lucide-react";
import type { SheetParams } from "@/core/sheets/store";
import { sheets } from "@/core/sheets/store";
import { Button, EmptyState, IconButton, Mark, Panel } from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { useSecurityIndex } from "./api";
import { SeverityBadge, SeverityMark } from "./parts";


export function FixSheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["security", "common"]);
  const id = String(params.id);
  const { index } = useSecurityIndex();
  const p = index.fixes.find((x) => x.id === id);
  if (!p) return <EmptyState icon={<Mark glyph="tick" tone="ok" size={18} />} title={t("group.gone")} />;
  const covered = index.groups.filter(
    (g) => g.kind === "dependency" && g.package === p.package && (g.ecosystem ?? "") === p.ecosystem,
  );
  const postureOf = (repo: string) => index.repos.find((r) => r.repo === repo)?.posture;
  const withoutUpdates = p.repos
    .filter((r) => postureOf(r.repo)?.security_updates === "off")
    .map((r) => r.repo);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-line-strong bg-surface px-6 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <span className="annot">{t("fix.kicker")}</span>
          <SeverityBadge s={p.severity} />
        </div>
        <h2 className="num mt-1 text-[19px] font-semibold">
          {p.package} <span className="text-[13px] font-normal text-faint">{p.ecosystem}</span>
        </h2>
        <p className="mt-1 flex items-center gap-1.5 text-[13px]">
          <ArrowUpCircle size={14} className={p.target ? "text-ok" : "text-warn"} />
          {p.target
            ? t("fix.headline", { version: p.target, count: p.alerts - p.unfixable })
            : t("fix.noTarget")}
        </p>
        {p.unfixable > 0 && p.target && (
          <p className="mt-1 text-[12px] text-warn">{t("fix.someUnfixableLong", { count: p.unfixable })}</p>
        )}
        {withoutUpdates.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-dim">
              {t("fix.updatesOff", { count: withoutUpdates.length })}
            </span>
            <Button
              size="sm"
              variant="primary"
              onClick={() =>
                useQueue
                  .getState()
                  .requestRun(
                    withoutUpdates.map((repo) => ({
                      repo,
                      action: { kind: "security_feature", feature: "security_updates", enabled: true },
                    })),
                  )
              }
            >
              {t("fix.turnOnUpdates")}
            </Button>
          </div>
        )}
      </header>
      <div className="space-y-4 p-4">
        <Panel className="overflow-hidden">
          <div className="border-b border-line px-3 py-2">
            <span className="annot">{t("fix.where")}</span>
          </div>
          {p.repos.map((r) => {
            const updates = postureOf(r.repo)?.security_updates === "on";
            return (
              <div
                key={r.repo}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_90px_32px] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-surface-2"
              >
                <button
                  className="num min-w-0 cursor-default truncate text-left text-[12.5px] hover:text-accent"
                  onClick={() =>
                    sheets.push("security", "repo", { repo: r.repo, title: r.repo.split("/")[1] })
                  }
                >
                  {r.repo}
                </button>
                <span className="min-w-0">
                  <span className="num block truncate text-[11.5px] text-dim">
                    {r.manifests.join(", ") || "—"}
                  </span>
                  <span className={updates ? "text-[10.5px] text-ok" : "text-[10.5px] text-faint"}>
                    {updates ? t("fix.botOn") : t("fix.botOff")}
                  </span>
                </span>
                <span className="num text-right text-[12px] text-dim">
                  {t("fix.alerts", { count: r.alerts })}
                </span>
                <IconButton
                  icon={GitPullRequest}
                  label={t("fix.prs")}
                  size={13}
                  className="size-7"
                  onClick={() =>
                    void openUrl(
                      `https://github.com/${r.repo}/pulls?q=${encodeURIComponent(`is:pr author:app/dependabot ${p.package}`)}`,
                    )
                  }
                />
              </div>
            );
          })}
        </Panel>
        <Panel className="overflow-hidden">
          <div className="border-b border-line px-3 py-2">
            <span className="annot">{t("fix.covers", { count: covered.length })}</span>
          </div>
          {covered.map((g) => (
            <button
              key={g.id}
              onClick={() => sheets.push("security", "group", { id: g.id, title: g.package ?? g.title })}
              className="flex w-full cursor-default items-center gap-2.5 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-surface-2"
            >
              <SeverityMark s={g.severity} />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{g.title}</span>
              <span className="num text-[11px] text-ok">{g.patched ? `→ ${g.patched}` : ""}</span>
            </button>
          ))}
        </Panel>
      </div>
    </div>
  );
}
