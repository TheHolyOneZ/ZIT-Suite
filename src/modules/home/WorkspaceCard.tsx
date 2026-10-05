import { useTranslation } from "react-i18next";
import { Download, RefreshCw, Save, Upload } from "lucide-react";
import type { Workspace } from "@/core/ipc";
import { cn } from "@/core/cn";
import { sheets, useTopSheet } from "@/core/sheets/store";
import { Button, IconButton, Panel, RelTime } from "@/ui";
import { useWorkspaceActions } from "./actions";
import { useStatus, useSync } from "./api";
import { headline, shortPath } from "./model";
import { RepoGone } from "./RepoGone";
import { AheadBehind, AutomationLine, BranchChip, GitTerm, HeadlineText } from "./parts";

export const openWorkspace = (ws: Workspace, tab?: string) =>
  sheets.push("home", "workspace", { id: ws.id, title: ws.name, ...(tab ? { tab } : {}) });


export function WorkspaceCard({ ws }: { ws: Workspace }) {
  const { t } = useTranslation(["home", "common"]);
  const status = useStatus(ws.id).data;
  const sync = useSync(ws.id, !!(ws.push_repo || ws.reference_repo)).data;
  const act = useWorkspaceActions(ws);
  const open = useTopSheet("home", "workspace")?.id === ws.id;
  const h = headline(status, sync, !!ws.push_repo);
  const push = sync?.push;
  const ref = sync?.reference;

  return (

    <Panel
      ticks
      role="button"
      tabIndex={0}
      onClick={() => openWorkspace(ws)}
      onKeyDown={(e) =>
        (e.key === "Enter" || e.key === " ") &&
        e.target === e.currentTarget &&
        (e.preventDefault(), openWorkspace(ws))
      }
      className={cn(
        "flex cursor-default flex-col gap-3 p-4 transition-colors hover:border-dim hover:bg-surface-2/40 focus-visible:border-accent",
        open && "border-accent",
      )}
    >
      <div className="flex items-start gap-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{ws.name}</span>
            <BranchChip name={status?.branch ?? null} />
          </div>
          <div className="num truncate text-[11px] text-faint" title={ws.path}>
            {shortPath(ws.path)}
          </div>
        </div>
      </div>
      <HeadlineText h={h} className="text-[14px]" />
      <RepoGone ws={ws} push={push} reference={ref} compact />
      <div className="space-y-1 border-t border-line pt-2.5 text-[11.5px]">
        <div className="flex items-center gap-2">
          <span className="annot w-[74px] shrink-0">{t("strip.push")}</span>
          {ws.push_repo ? (
            <>
              <span className="num truncate text-dim">{ws.push_repo}</span>
              <span className="ml-auto shrink-0">{push && <AheadBehind c={push} />}</span>
            </>
          ) : (
            <span className="text-faint">{t("strip.notSet")}</span>
          )}
        </div>
        {ref && (
          <div className="flex items-center gap-2">
            <span className="annot w-[74px] shrink-0">{t("strip.reference")}</span>
            <span className="num truncate text-dim">{ref.slug}</span>
            <span className="ml-auto shrink-0">
              {ref.related ? (
                <AheadBehind c={ref} reference />
              ) : (
                <span className="text-warn">{t("strip.unrelated")}</span>
              )}
            </span>
          </div>
        )}
        <AutomationLine ws={ws} className="block truncate pt-0.5 text-[11px]" />
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {status && status.changes.length > 0 && (
          <Button
            size="sm"
            variant="primary"
            icon={Save}
            loading={act.busy === "save"}
            onClick={() => void act.save(status.suggested_message, null, false)}
            title={status.suggested_message}
          >
            {t("actions.save")}
            <GitTerm term="commit" />
          </Button>
        )}
        {push && push.behind > 0 && push.related && (
          <Button
            size="sm"
            icon={Download}
            loading={act.busy === "latest"}
            onClick={() => void act.getLatest("push", push.branch)}
          >
            {t("actions.getLatest")}
          </Button>
        )}
        {ws.push_repo &&
          !push?.missing &&
          ((push?.ahead ?? 0) > 0 || (push && !push.exists && status?.has_commits)) && (
            <Button size="sm" icon={Upload} loading={act.busy === "upload"} onClick={() => void act.upload()}>
              {t("actions.upload")}
              <GitTerm term="push" />
            </Button>
          )}
        <span className="ml-auto flex items-center gap-1 text-[10.5px] text-faint">
          {sync && <RelTime at={sync.checked_at} />}
          {(ws.push_repo || ws.reference_repo) && (
            <IconButton
              icon={RefreshCw}
              label={t("actions.check")}
              size={12}
              className={cn("size-6", act.busy === "check" && "animate-spin")}
              onClick={() => void act.check()}
            />
          )}
        </span>
      </div>
    </Panel>
  );
}
