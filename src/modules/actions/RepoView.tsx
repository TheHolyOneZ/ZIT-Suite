import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Ban,
  ExternalLink,
  FilePlus2,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
} from "lucide-react";
import { commands, unwrap, type Run, type Workflow } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { useRepoList } from "@/core/data/repos";
import { formatNumber } from "@/core/i18n/format";
import { sheets } from "@/core/sheets/store";
import { toast } from "@/core/store/toasts";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Mark,
  Meter,
  Plotter,
  RelTime,
  Segmented,
  Select,
} from "@/ui";
import { runLook } from "@/modules/home/ActionsTab";
import { refreshGh, useRuns, useWorkflows } from "@/modules/home/ghapi";
import { durationMs, formatDuration, runStats } from "@/modules/home/ghmodel";
import { RunDialog } from "@/modules/home/RunDialog";
import { WorkflowEditor, type WorkflowEdit } from "@/modules/home/WorkflowEditor";
import { useBranchList } from "@/modules/files/api";
import { filterRuns, type RunBucket } from "./model";
import { useActionsUi } from "./store";
import { githubStore } from "./workflowStore";

export const openRun = (repo: string, r: Run) =>
  sheets.push("actions", "run", { repo, run: r.id, title: `#${r.run_number}` });


export function RepoView({ repo }: { repo: string }) {
  const { t } = useTranslation(["actions", "home", "common"]);
  const ui = useActionsUi();
  const workflows = useWorkflows(repo);
  const runs = useRuns(repo);
  const branches = useBranchList(repo);
  const meta = useRepoList().data?.find((r) => r.full_name === repo);
  const defaultBranch = meta?.default_branch ?? "main";
  const canWrite = meta?.permissions?.push ?? true;
  const [runWf, setRunWf] = useState<Workflow | null>(null);
  const [editing, setEditing] = useState<WorkflowEdit | null>(null);
  const all = useMemo(() => runs.data ?? [], [runs.data]);
  const wfs = workflows.data ?? [];
  const shown = useMemo(() => filterRuns(all, ui.filter, ui.workflow), [all, ui.filter, ui.workflow]);
  const stats = runStats(ui.workflow == null ? all : all.filter((r) => r.workflow_id === ui.workflow));
  const runBranches = useMemo(
    () => [...new Set(all.map((r) => r.head_branch).filter((b): b is string => !!b))].sort(),
    [all],
  );

  if (workflows.isLoading || runs.isLoading) return <Plotter />;
  if (workflows.error) return <EmptyState title={errorMessage(workflows.error)} />;

  return (

    <div className="@container h-full min-h-0">
      <div className="grid h-full min-h-0 grid-cols-1 @[760px]:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">

        <div className="hidden min-h-0 flex-col border-r border-line bg-surface @[760px]:flex">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <span className="annot flex-1">{t("home:actionsTab.workflows", { count: wfs.length })}</span>
            {canWrite && (
              <Button
                size="sm"
                variant="secondary"
                icon={FilePlus2}
                onClick={() => setEditing({ mode: "new" })}
              >
                {t("wf.new")}
              </Button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <button
              className={cn(
                "flex w-full cursor-default items-center gap-2 border-b border-line px-3 py-2 text-left text-[12.5px] hover:bg-surface-2",
                ui.workflow == null && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
              )}
              onClick={() => ui.set({ workflow: null })}
            >
              <span className="flex-1">{t("runs.allWorkflows")}</span>
              <span className="num text-[11px] text-faint">{formatNumber(all.length)}</span>
            </button>
            {wfs.length === 0 && (
              <div className="px-3 py-4 text-[12.5px] text-dim">
                {t("home:actionsTab.none")}{" "}
                {canWrite && (
                  <button
                    className="cursor-default text-accent hover:underline"
                    onClick={() => setEditing({ mode: "new" })}
                  >
                    {t("home:actionsTab.addFirst")}
                  </button>
                )}
              </div>
            )}
            {wfs.map((w) => (
              <WorkflowLine
                key={w.id}
                repo={repo}
                w={w}
                runs={all.filter((r) => r.workflow_id === w.id)}
                canWrite={canWrite}
                selected={ui.workflow === w.id}
                onSelect={() => ui.set({ workflow: ui.workflow === w.id ? null : w.id })}
                onRun={() => setRunWf(w)}
                onEdit={() => setEditing({ mode: "edit", path: w.path, repo })}
              />
            ))}
          </div>
        </div>


        <div className="flex min-h-0 flex-col">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-line px-4 py-3">
            <Stat label={t("home:actionsTab.runsLabel")} value={formatNumber(stats.total)} />
            <div>
              <div className="annot !text-[9.5px]">{t("home:actionsTab.successRate")}</div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "num text-[17px]",
                    stats.successRate != null && stats.successRate < 0.8 && "text-warn",
                  )}
                >
                  {stats.successRate == null ? "—" : `${Math.round(stats.successRate * 100)}%`}
                </span>
                {stats.successRate != null && (
                  <Meter
                    value={stats.successRate * 100}
                    tone={stats.successRate < 0.8 ? "warn" : "ok"}
                    className="w-[70px]"
                  />
                )}
              </div>
            </div>
            <Stat label={t("home:actionsTab.avgDuration")} value={formatDuration(stats.avgMs)} />
            <Stat
              label={t("home:actionsTab.runningNow")}
              value={formatNumber(stats.running)}
              accent={stats.running > 0}
            />
            <span className="ml-auto">
              <IconButton
                icon={RefreshCw}
                label={t("refresh")}
                onClick={() => void refreshGh(repo, "actions").catch(toastError)}
              />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
            <Segmented<RunBucket | "all">
              size="sm"
              value={ui.filter.bucket}
              onChange={(bucket) => ui.setFilter({ bucket })}
              options={[
                { value: "all", label: t("runs.all") },
                { value: "failed", label: t("runs.failed") },
                { value: "running", label: t("runs.running") },
                { value: "ok", label: t("runs.ok") },
              ]}
            />
            <Select
              value={ui.filter.branch ?? ""}
              onChange={(e) => ui.setFilter({ branch: e.target.value || null })}
              className="!h-7 !w-[160px]"
            >
              <option value="">{t("runs.anyBranch")}</option>
              {runBranches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
            <div className="w-[220px]">
              <Input
                icon={Search}
                value={ui.filter.q}
                onChange={(e) => ui.setFilter({ q: e.target.value })}
                placeholder={t("runs.find")}
                className="!h-7 text-[12px]"
              />
            </div>
            <span className="num ml-auto text-[11px] text-faint">
              {t("runs.count", { count: shown.length })}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {shown.length === 0 && (
              <div className="px-4 py-6 text-center text-[12.5px] text-faint">
                {all.length ? t("runs.noMatch") : t("home:actionsTab.noRuns")}
              </div>
            )}
            {shown.map((r) => (
              <RunLine
                key={r.id}
                repo={repo}
                r={r}
                workflow={wfs.find((w) => w.id === r.workflow_id)?.name}
                canWrite={canWrite}
              />
            ))}
          </div>
        </div>

        <RunDialog
          repo={repo}
          wf={runWf}
          branches={branches.data ?? []}
          current={defaultBranch}
          onClose={() => setRunWf(null)}
        />
        {editing && (
          <WorkflowEditor
            store={githubStore(repo, defaultBranch, t as never)}
            req={editing}
            taken={wfs.map((w) => w.path.split("/").pop()!)}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);

              for (const ms of [1500, 6000])
                setTimeout(() => void refreshGh(repo, "actions").catch(() => undefined), ms);
            }}
          />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="annot !text-[9.5px]">{label}</div>
      <div className={cn("num text-[17px]", accent && "text-accent")}>{value}</div>
    </div>
  );
}

function WorkflowLine({
  repo,
  w,
  runs,
  canWrite,
  selected,
  onSelect,
  onRun,
  onEdit,
}: {
  repo: string;
  w: Workflow;
  runs: Run[];
  canWrite: boolean;
  selected: boolean;
  onSelect: () => void;
  onRun: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation(["actions", "home"]);
  const s = runStats(runs);
  const enabled = w.state === "active";
  const last = runs.slice(0, 10).reverse();
  const toggle = async () => {
    try {
      await unwrap(commands.actionsSetEnabled(repo, w.id, !enabled));
      toast({
        kind: "success",
        title: enabled
          ? t("home:actionsTab.disabled", { name: w.name })
          : t("home:actionsTab.enabled", { name: w.name }),
      });
      await refreshGh(repo, "actions");
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div
      className={cn(
        "group border-b border-line px-3 py-2 hover:bg-surface-2",
        selected && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
      )}
    >
      <button className="block w-full min-w-0 cursor-default text-left" onClick={onSelect}>
        <span className={cn("flex items-center gap-2", !enabled && "opacity-60")}>
          <span className="truncate text-[13px]">{w.name}</span>
          {!enabled && <Badge tone="idle">{t("home:actionsTab.off")}</Badge>}
          <span className="num ml-auto text-[11px] text-faint">
            {s.successRate == null ? "" : `${Math.round(s.successRate * 100)}%`}
          </span>
        </span>
        <span className="num block truncate text-[11px] text-faint">{w.path}</span>
      </button>
      <div className="mt-1 flex items-center gap-1">
        <span className="flex min-w-0 flex-1 items-center gap-0.5" title={t("home:actionsTab.history")}>
          {last.length === 0 ? (
            <span className="text-[11px] text-faint">{t("home:actionsTab.neverRan")}</span>
          ) : (
            last.map((r) => {
              const l = runLook(r);
              return (
                <Mark
                  key={r.id}
                  glyph={l.glyph}
                  tone={l.tone}
                  size={10}
                  title={`#${r.run_number} · ${t(`home:actionsTab.state.${l.state as "success"}`)}`}
                />
              );
            })
          )}
        </span>
        {canWrite && (
          <span className="flex opacity-60 group-hover:opacity-100">
            <IconButton
              icon={Play}
              label={t("home:actionsTab.run")}
              size={13}
              className="size-7"
              disabled={!enabled}
              onClick={onRun}
            />
            <IconButton
              icon={Pencil}
              label={t("home:wf.edit")}
              size={13}
              className="size-7"
              onClick={onEdit}
            />
            <IconButton
              icon={enabled ? Pause : RotateCcw}
              label={enabled ? t("home:actionsTab.disable") : t("home:actionsTab.enable")}
              size={13}
              className="size-7"
              onClick={() => void toggle()}
            />
          </span>
        )}
        <IconButton
          icon={ExternalLink}
          label={t("openOnGitHub")}
          size={13}
          className="size-7 opacity-60 group-hover:opacity-100"
          onClick={() => void openUrl(w.html_url)}
        />
      </div>
    </div>
  );
}

function RunLine({
  repo,
  r,
  workflow,
  canWrite,
}: {
  repo: string;
  r: Run;
  workflow?: string;
  canWrite: boolean;
}) {
  const { t } = useTranslation(["actions", "home"]);
  const look = runLook(r);
  const failed = r.conclusion === "failure" || r.conclusion === "timed_out";
  const act = async (what: "cancel" | "rerun" | "failed") => {
    try {
      if (what === "cancel") await unwrap(commands.actionsCancel(repo, r.id));
      else await unwrap(commands.actionsRerun(repo, r.id, what === "failed"));
      toast({ kind: "success", title: t(`home:actionsTab.done.${what}`) });
      setTimeout(() => void refreshGh(repo, "actions").catch(() => undefined), 2000);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openRun(repo, r)}
      onKeyDown={(e) => e.key === "Enter" && openRun(repo, r)}
      className="group grid cursor-default grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-4 py-2 hover:bg-surface-2 @[560px]:grid-cols-[18px_minmax(0,1fr)_110px_auto]"
    >
      <Mark
        glyph={look.glyph}
        tone={look.tone}
        title={t(`home:actionsTab.state.${look.state as "success"}`)}
      />
      <div className="min-w-0">
        <div className="truncate text-[12.5px]">{r.display_title ?? r.name}</div>
        <div className="flex flex-wrap gap-x-2 text-[11px] text-faint">
          <span>{workflow ?? r.name}</span>
          <span className="num">#{r.run_number}</span>
          {(r.run_attempt ?? 1) > 1 && <span className="num">{t("runs.attempt", { n: r.run_attempt })}</span>}
          {r.head_branch && <span className="num">{r.head_branch}</span>}
          <span>{t(`home:actionsTab.event.${r.event as "push"}`, { defaultValue: r.event })}</span>
          {r.actor && <span>@{r.actor.login}</span>}
        </div>
      </div>
      <span className="text-right text-[11.5px] text-faint">
        <span className="num block">
          {r.status === "completed"
            ? formatDuration(durationMs(r))
            : t(`home:actionsTab.state.${look.state as "running"}`)}
        </span>
        <RelTime at={r.created_at} />
      </span>
      <span className="hidden @[560px]:flex" onClick={(e) => e.stopPropagation()}>
        {canWrite && r.status !== "completed" && (
          <IconButton
            icon={Ban}
            label={t("home:actionsTab.cancel")}
            size={13}
            className="size-7 hover:text-danger"
            onClick={() => void act("cancel")}
          />
        )}
        {canWrite && failed && (
          <IconButton
            icon={RotateCcw}
            label={t("home:actionsTab.rerunFailed")}
            size={13}
            className="size-7"
            onClick={() => void act("failed")}
          />
        )}
        {canWrite && r.status === "completed" && (
          <IconButton
            icon={RefreshCw}
            label={t("home:actionsTab.rerun")}
            size={13}
            className="size-7 opacity-0 group-hover:opacity-100"
            onClick={() => void act("rerun")}
          />
        )}
        <IconButton
          icon={ExternalLink}
          label={t("openOnGitHub")}
          size={13}
          className="size-7 opacity-0 group-hover:opacity-100"
          onClick={() => void openUrl(r.html_url)}
        />
      </span>
    </div>
  );
}
