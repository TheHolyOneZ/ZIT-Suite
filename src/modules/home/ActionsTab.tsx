import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowUpRight,
  Ban,
  ExternalLink,
  FilePlus2,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import { commands, unwrap, type Run, type Workflow, type Workspace } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { formatNumber } from "@/core/i18n/format";
import { getModule } from "@/core/modules/registry";
import { sheets } from "@/core/sheets/store";
import { toast } from "@/core/store/toasts";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Mark,
  Meter,
  Panel,
  Plotter,
  RelTime,
  type Glyph,
  type Tone,
} from "@/ui";
import { refreshLocal, useBranches, useStatus, useTree } from "./api";
import { refreshGh, useRuns, useWorkflows } from "./ghapi";
import { durationMs, formatDuration, runStats } from "./ghmodel";
import { RunDialog } from "./RunDialog";
import { folderStore, WorkflowEditor, type WorkflowEdit } from "./WorkflowEditor";

export function runLook(r: Run): { glyph: Glyph; tone: Tone; state: string } {
  if (r.status !== "completed")
    return r.status === "in_progress"
      ? { glyph: "running", tone: "accent", state: "running" }
      : { glyph: "pending", tone: "idle", state: "queued" };
  switch (r.conclusion) {
    case "success":
      return { glyph: "tick", tone: "ok", state: "success" };
    case "failure":
    case "timed_out":
    case "startup_failure":
      return { glyph: "cross", tone: "danger", state: "failure" };
    case "cancelled":
      return { glyph: "slash", tone: "idle", state: "cancelled" };
    case "skipped":
      return { glyph: "skip", tone: "idle", state: "skipped" };
    case "action_required":
      return { glyph: "warn", tone: "warn", state: "action_required" };
    default:
      return { glyph: "equal", tone: "idle", state: "neutral" };
  }
}


export function ActionsTab({ ws, repo, onAdded }: { ws: Workspace; repo: string; onAdded: () => void }) {
  const { t } = useTranslation(["home", "common"]);
  const workflows = useWorkflows(repo);
  const runs = useRuns(repo);
  const local = useTree(ws.id, ".github/workflows").data ?? [];

  const status = useStatus(ws.id);
  const branches = useBranches(ws.id);
  const changedPaths = new Set((status.data?.changes ?? []).map((c) => c.path));
  const [only, setOnly] = useState<number | null>(null);
  const [runWf, setRunWf] = useState<Workflow | null>(null);
  const [editing, setEditing] = useState<WorkflowEdit | null>(null);
  const setAdding = (on: boolean) => setEditing(on ? { mode: "new" } : null);
  const all = useMemo(() => runs.data ?? [], [runs.data]);
  const stats = runStats(all);
  if (workflows.isLoading || runs.isLoading) return <Plotter />;
  if (workflows.error) return <EmptyState title={errorMessage(workflows.error)} />;
  const wfs = workflows.data ?? [];

  const pending = local.filter(
    (e) => !e.dir && /\.ya?ml$/.test(e.name) && !wfs.some((w) => w.path === e.path),
  );
  const shown = only == null ? all : all.filter((r) => r.workflow_id === only);

  return (
    <div className="mx-auto max-w-[1000px] space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <Stat label={t("actionsTab.runsLabel")} value={formatNumber(stats.total)} />
        <div>
          <div className="annot !text-[9.5px]">{t("actionsTab.successRate")}</div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "num text-[17px]",
                stats.successRate != null && stats.successRate < 0.8 ? "text-warn" : undefined,
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
        <Stat label={t("actionsTab.avgDuration")} value={formatDuration(stats.avgMs)} />
        <Stat
          label={t("actionsTab.runningNow")}
          value={formatNumber(stats.running)}
          accent={stats.running > 0}
        />
        {stats.lastFailure && (
          <div className="min-w-0">
            <div className="annot !text-[9.5px]">{t("actionsTab.lastFailure")}</div>
            <button
              className="max-w-[220px] cursor-default truncate text-left text-[12.5px] text-danger hover:underline"
              onClick={() => void openUrl(stats.lastFailure!.html_url)}
            >
              {stats.lastFailure.display_title ?? stats.lastFailure.name} ·{" "}
              <RelTime at={stats.lastFailure.created_at} />
            </button>
          </div>
        )}
        <span className="ml-auto flex gap-2">
          {getModule("actions") && (
            <IconButton
              icon={ArrowUpRight}
              label={t("actionsTab.openTab")}
              onClick={() => sheets.openWith("actions", { repo })}
            />
          )}
          <IconButton
            icon={RefreshCw}
            label={t("actions.check")}
            onClick={() => void refreshGh(repo, "actions").catch(toastError)}
          />
          <Button variant="primary" icon={FilePlus2} onClick={() => setAdding(true)}>
            {t("actionsTab.add")}
          </Button>
        </span>
      </div>

      <Panel className="overflow-hidden">
        <div className="border-b border-line px-3 py-2">
          <span className="annot">{t("actionsTab.workflows", { count: wfs.length })}</span>
        </div>
        {wfs.length === 0 && pending.length === 0 && (
          <div className="px-3 py-4 text-[12.5px] text-dim">
            {t("actionsTab.none")}{" "}
            <button className="cursor-default text-accent hover:underline" onClick={() => setAdding(true)}>
              {t("actionsTab.addFirst")}
            </button>
          </div>
        )}
        {wfs.map((w) => (
          <WorkflowRow
            key={w.id}
            repo={repo}
            w={w}
            runs={all.filter((r) => r.workflow_id === w.id)}
            selected={only === w.id}
            onSelect={() => setOnly(only === w.id ? null : w.id)}
            onRun={() => setRunWf(w)}
            onEdit={() => setEditing({ mode: "edit", path: w.path, repo })}
            changed={local.some((e) => e.path === w.path) && changedPaths.has(w.path)}
          />
        ))}
        {pending.map((e) => (
          <div
            key={e.path}
            className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0"
          >
            <Mark glyph="hourglass" tone="accent" />
            <span className="min-w-0">
              <span className="num block truncate text-[12.5px]">{e.path}</span>
              <span className="text-[11px] text-accent">{t("actionsTab.notUploaded")}</span>
            </span>
            <IconButton
              icon={Pencil}
              label={t("wf.edit")}
              size={13}
              className="size-7"
              onClick={() => setEditing({ mode: "edit", path: e.path, repo })}
            />
          </div>
        ))}
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <span className="annot flex-1">
            {only == null
              ? t("actionsTab.recent")
              : t("actionsTab.recentOf", { name: wfs.find((w) => w.id === only)?.name })}
          </span>
          {only != null && (
            <Button size="sm" variant="ghost" icon={X} onClick={() => setOnly(null)}>
              {t("actionsTab.showAll")}
            </Button>
          )}
        </div>
        {shown.length === 0 && (
          <div className="px-3 py-3 text-[12px] text-faint">{t("actionsTab.noRuns")}</div>
        )}
        {shown.slice(0, 40).map((r) => (
          <RunRow key={r.id} repo={repo} r={r} workflow={wfs.find((w) => w.id === r.workflow_id)?.name} />
        ))}
      </Panel>

      <RunDialog
        repo={repo}
        wf={runWf}
        branches={(branches.data ?? []).map((b) => b.name)}
        current={status.data?.branch ?? "main"}
        readLocal={(path) => unwrap(commands.wsReadWorkflow(ws.id, path))}
        onClose={() => setRunWf(null)}
      />
      {editing && (
        <WorkflowEditor
          store={folderStore(ws.id, repo, t as never)}
          req={editing}
          taken={[...new Set([...wfs.map((w) => w.path.split("/").pop()!), ...local.map((e) => e.name)])]}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refreshLocal(ws.id);
            onAdded();
          }}
        />
      )}
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

function WorkflowRow({
  repo,
  w,
  runs,
  selected,
  onSelect,
  onRun,
  onEdit,
  changed,
}: {
  repo: string;
  w: Workflow;
  runs: Run[];
  selected: boolean;
  onSelect: () => void;
  onRun: () => void;
  onEdit: () => void;
  changed: boolean;
}) {
  const { t } = useTranslation(["home", "common"]);
  const s = runStats(runs);
  const enabled = w.state === "active";
  const last = runs.slice(0, 12).reverse();
  const toggle = async () => {
    try {
      await unwrap(commands.actionsSetEnabled(repo, w.id, !enabled));
      toast({
        kind: "success",
        title: enabled
          ? t("actionsTab.disabled", { name: w.name })
          : t("actionsTab.enabled", { name: w.name }),
      });
      await refreshGh(repo, "actions");
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_70px_70px_auto] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-surface-2",
        selected && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
        !enabled && "opacity-60",
      )}
    >
      <button className="min-w-0 cursor-default text-left" onClick={onSelect}>
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px]">{w.name}</span>
          {!enabled && <Badge tone="idle">{t("actionsTab.off")}</Badge>}
          {changed && <Badge tone="accent">{t("wf.changedLocally")}</Badge>}
        </span>
        <span className="num block truncate text-[11px] text-faint">{w.path}</span>
      </button>

      <span className="flex items-center gap-0.5" title={t("actionsTab.history")}>
        {last.length === 0 ? (
          <span className="text-[11px] text-faint">{t("actionsTab.neverRan")}</span>
        ) : (
          last.map((r) => {
            const l = runLook(r);
            return (
              <Mark
                key={r.id}
                glyph={l.glyph}
                tone={l.tone}
                size={10}
                title={t(`actionsTab.state.${l.state as "success"}`)}
              />
            );
          })
        )}
      </span>
      <span className="num text-right text-[12px] text-dim" title={t("actionsTab.successRate")}>
        {s.successRate == null ? "—" : `${Math.round(s.successRate * 100)}%`}
      </span>
      <span className="num text-right text-[11.5px] text-faint" title={t("actionsTab.avgDuration")}>
        {formatDuration(s.avgMs)}
      </span>
      <span className="flex">
        <IconButton
          icon={Play}
          label={t("actionsTab.run")}
          size={13}
          className="size-7"
          disabled={!enabled}
          onClick={onRun}
        />
        <IconButton icon={Pencil} label={t("wf.edit")} size={13} className="size-7" onClick={onEdit} />
        <IconButton
          icon={enabled ? Pause : RotateCcw}
          label={enabled ? t("actionsTab.disable") : t("actionsTab.enable")}
          size={13}
          className="size-7"
          onClick={() => void toggle()}
        />
        <IconButton
          icon={ExternalLink}
          label={t("actions.openGitHub")}
          size={13}
          className="size-7"
          onClick={() => void openUrl(w.html_url)}
        />
      </span>
    </div>
  );
}

function RunRow({ repo, r, workflow }: { repo: string; r: Run; workflow?: string }) {
  const { t } = useTranslation(["home", "common"]);
  const look = runLook(r);
  const failed = r.conclusion === "failure" || r.conclusion === "timed_out";
  const act = async (what: "cancel" | "rerun" | "failed") => {
    try {
      if (what === "cancel") await unwrap(commands.actionsCancel(repo, r.id));
      else await unwrap(commands.actionsRerun(repo, r.id, what === "failed"));
      toast({ kind: "success", title: t(`actionsTab.done.${what}`) });
      setTimeout(() => void refreshGh(repo, "actions").catch(() => undefined), 2000);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)_110px_auto] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-surface-2">
      <Mark glyph={look.glyph} tone={look.tone} title={t(`actionsTab.state.${look.state as "success"}`)} />
      <div className="min-w-0">
        <div className="truncate text-[12.5px]">{r.display_title ?? r.name}</div>
        <div className="flex flex-wrap gap-x-2 text-[11px] text-faint">
          <span>{workflow ?? r.name}</span>
          <span className="num">#{r.run_number}</span>
          {r.head_branch && <span className="num">{r.head_branch}</span>}
          <span>{t(`actionsTab.event.${r.event as "push"}`, { defaultValue: r.event })}</span>
          {r.actor && <span>@{r.actor.login}</span>}
        </div>
      </div>
      <span className="text-right text-[11.5px] text-faint">
        <span className="num block">
          {r.status === "completed"
            ? formatDuration(durationMs(r))
            : t(`actionsTab.state.${look.state as "running"}`)}
        </span>
        <RelTime at={r.created_at} />
      </span>
      <span className="flex">
        {r.status !== "completed" && (
          <IconButton
            icon={Ban}
            label={t("actionsTab.cancel")}
            size={13}
            className="size-7 hover:text-danger"
            onClick={() => void act("cancel")}
          />
        )}
        {failed && (
          <IconButton
            icon={RotateCcw}
            label={t("actionsTab.rerunFailed")}
            size={13}
            className="size-7"
            onClick={() => void act("failed")}
          />
        )}
        {r.status === "completed" && (
          <IconButton
            icon={RefreshCw}
            label={t("actionsTab.rerun")}
            size={13}
            className="size-7"
            onClick={() => void act("rerun")}
          />
        )}
        <IconButton
          icon={ExternalLink}
          label={t("actions.openGitHub")}
          size={13}
          className="size-7"
          onClick={() => void openUrl(r.html_url)}
        />
      </span>
    </div>
  );
}
