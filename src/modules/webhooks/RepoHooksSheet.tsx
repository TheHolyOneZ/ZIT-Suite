import { useTranslation } from "react-i18next";
import { ExternalLink, Plus, Webhook } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { errorMessage } from "@/core/errors";
import { cn } from "@/core/cn";
import { sheets, useTopSheet, type SheetParams } from "@/core/sheets/store";
import { Button, EmptyState, IconButton, Plotter } from "@/ui";
import { useRepoHooks } from "./api";
import { EventList, StateMark } from "./HookMarks";
import { hookState, splitUrl } from "./model";
import { useHooksUi } from "./store";


export function RepoHooksSheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["webhooks", "common"]);
  const repo = String(params.repo);
  const { data, isLoading, error } = useRepoHooks(repo);
  const setUi = useHooksUi((s) => s.set);
  const open = useTopSheet("webhooks", "hook");
  if (isLoading) return <Plotter />;
  if (error || !data) return <EmptyState title={errorMessage(error)} />;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-line-strong bg-surface px-6 pt-5 pb-4">
        <div className="min-w-[200px] flex-1">
          <div className="annot">{t("repo.kicker")}</div>
          <h2 className="num truncate text-[19px] font-semibold">{repo}</h2>
          <div className="mt-1 text-[12px] text-dim">{t("repo.count", { count: data.hooks.length })}</div>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            icon={ExternalLink}
            label="GitHub"
            onClick={() => openUrl(`https://github.com/${repo}/settings/hooks`)}
          />
          <Button variant="primary" icon={Plus} onClick={() => setUi({ create: { repos: [repo] } })}>
            {t("repo.add")}
          </Button>
        </div>
      </header>
      {data.error ? (
        <EmptyState title={errorMessage(data.error)} />
      ) : data.hooks.length === 0 ? (
        <EmptyState icon={<Webhook size={20} />} title={t("repo.none")} />
      ) : (
        data.hooks.map((h) => {
          const { host, path } = splitUrl(h.url);
          return (
            <button
              key={h.id}
              onClick={() => sheets.push("webhooks", "hook", { repo, id: h.id, title: host })}
              className={cn(
                "grid w-full cursor-default grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)] items-center gap-3 border-b border-line px-4 py-2.5 text-left hover:bg-surface-2",
                Number(open?.id) === h.id && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <StateMark state={hookState(h)} />
                <span className="min-w-0">
                  <span className="num block truncate text-[12.5px]">{host}</span>
                  <span className="num block truncate text-[11px] text-faint">{path || "/"}</span>
                </span>
              </span>
              <EventList events={h.events} />
              <span className="num truncate text-[11.5px] text-dim">
                {h.last_response.code == null
                  ? t("hook.never")
                  : `${h.last_response.code} ${h.last_response.message ?? ""}`}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
