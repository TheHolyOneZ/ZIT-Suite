import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { save } from "@tauri-apps/plugin-dialog";
import {
  Ban,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { commands, unwrap, type Job, type Run } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { sheets, type SheetParams } from "@/core/sheets/store";
import { toast } from "@/core/store/toasts";
import { Badge, Button, EmptyState, IconButton, Input, Mark, Plotter, RelTime, useConfirmClick } from "@/ui";
import { runLook } from "@/modules/home/ActionsTab";
import { refreshGh, useRuns } from "@/modules/home/ghapi";
import { durationMs, formatDuration } from "@/modules/home/ghmodel";
import { formatBytes } from "@/modules/home/model";
import { useRepoList } from "@/core/data/repos";
import { useArtifacts, useJobLog, useJobs } from "./api";
import { firstErrorBlock, jobMs, parseLog, pickJob, type LogBlock } from "./model";

const look = (x: { status: string; conclusion: string | null }) =>
  runLook({ status: x.status, conclusion: x.conclusion } as Run);


export function RunSheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["actions", "home", "common"]);
  const repo = String(params.repo);
  const id = Number(params.run);
  const runs = useRuns(repo);
  const r = runs.data?.find((x) => x.id === id);
  const canWrite = useRepoList().data?.find((x) => x.full_name === repo)?.permissions?.push ?? true;
  const liveRun = !!r && r.status !== "completed";
  const jobs = useJobs(repo, id, liveRun);
  const artifacts = useArtifacts(repo, id, !liveRun);
  const [jobId, setJobId] = useState<number | null>(null);
  const job = jobs.data?.find((j) => j.id === jobId) ?? pickJob(jobs.data ?? []);

  const act = async (what: "cancel" | "rerun" | "failed") => {
    try {
      if (what === "cancel") await unwrap(commands.actionsCancel(repo, id));
      else await unwrap(commands.actionsRerun(repo, id, what === "failed"));
      toast({ kind: "success", title: t(`home:actionsTab.done.${what}`) });
      for (const ms of [1500, 5000])
        setTimeout(() => void refreshGh(repo, "actions").catch(() => undefined), ms);
    } catch (e) {
      toastError(e);
    }
  };
  const del = useConfirmClick(async () => {
    try {
      await unwrap(commands.actionsDeleteRun(repo, id));
      toast({ kind: "success", title: t("run.deleted", { n: r?.run_number }) });
      sheets.pop();
      await refreshGh(repo, "actions");
    } catch (e) {
      toastError(e);
    }
  });

  if (runs.isLoading) return <Plotter />;
  if (!r) return <EmptyState title={t("run.gone")} />;
  const l = runLook(r);
  const failed = r.conclusion === "failure" || r.conclusion === "timed_out";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line px-5 py-3">
        <div className="flex items-start gap-3">
          <Mark glyph={l.glyph} tone={l.tone} size={16} className="mt-1" />
          <div className="min-w-0 flex-1">
            <div className="annot">
              {repo} · {r.name} · #{r.run_number}
              {(r.run_attempt ?? 1) > 1 && ` · ${t("runs.attempt", { n: r.run_attempt })}`}
            </div>
            <h2 className="truncate text-[17px] font-medium">{r.display_title ?? r.name}</h2>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-faint">
              <span
                className={cn(
                  l.tone === "danger" && "text-danger",
                  l.tone === "ok" && "text-ok",
                  l.tone === "accent" && "text-accent",
                )}
              >
                {t(`home:actionsTab.state.${l.state as "success"}`)}
              </span>
              {r.head_branch && <span className="num">{r.head_branch}</span>}
              <span className="num">{r.head_sha.slice(0, 7)}</span>
              <span>{t(`home:actionsTab.event.${r.event as "push"}`, { defaultValue: r.event })}</span>
              {r.actor && <span>@{r.actor.login}</span>}
              <RelTime at={r.created_at} />
              {r.status === "completed" && (
                <span className="num inline-flex items-center gap-1">
                  <Clock size={11} />
                  {formatDuration(durationMs(r))}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {canWrite && liveRun && (
              <Button size="sm" variant="secondary" icon={Ban} onClick={() => void act("cancel")}>
                {t("home:actionsTab.cancel")}
              </Button>
            )}
            {canWrite && failed && (
              <Button size="sm" variant="primary" icon={RotateCcw} onClick={() => void act("failed")}>
                {t("home:actionsTab.rerunFailed")}
              </Button>
            )}
            {canWrite && !liveRun && (
              <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => void act("rerun")}>
                {t("run.rerunAll")}
              </Button>
            )}
            <IconButton
              icon={ExternalLink}
              label={t("openOnGitHub")}
              onClick={() => void openUrl(r.html_url)}
            />
            {canWrite && !liveRun && (
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                className={cn(
                  "w-[156px] justify-center",
                  del.armed ? "text-danger" : "text-faint hover:text-danger",
                )}
                onClick={del.onClick}
              >
                {del.armed ? t("run.confirmDelete") : t("run.delete")}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        <div className="min-h-0 overflow-y-auto border-r border-line bg-surface">
          <div className="annot border-b border-line px-3 py-2">
            {t("run.jobs", { count: jobs.data?.length ?? 0 })}
          </div>
          {jobs.isLoading && <Plotter />}
          {jobs.error && <div className="px-3 py-2 text-[12px] text-warn">{errorMessage(jobs.error)}</div>}
          {(jobs.data ?? []).map((j) => (
            <JobLine key={j.id} j={j} active={job?.id === j.id} onPick={() => setJobId(j.id)} />
          ))}
          <ArtifactList repo={repo} q={artifacts} />
        </div>
        <div className="min-h-0 min-w-0">
          {job ? (
            <LogPane key={job.id} repo={repo} job={job} />
          ) : (
            !jobs.isLoading && <EmptyState title={t("run.noJobs")} />
          )}
        </div>
      </div>
    </div>
  );
}

function JobLine({ j, active, onPick }: { j: Job; active: boolean; onPick: () => void }) {
  const { t } = useTranslation(["actions", "home"]);
  const [open, setOpen] = useState(active);
  const l = look(j);
  const steps = j.steps ?? [];
  return (
    <div
      className={cn("border-b border-line", active && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]")}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          className="cursor-default text-faint hover:text-text"
          onClick={() => setOpen(!open)}
          aria-label={t("run.steps")}
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <Mark glyph={l.glyph} tone={l.tone} size={11} />
        <button
          className="min-w-0 flex-1 cursor-default truncate text-left text-[12.5px]"
          onClick={onPick}
          title={j.name}
        >
          {j.name}
        </button>
        <span className="num text-[11px] text-faint">
          {j.status === "completed"
            ? formatDuration(jobMs(j))
            : t(`home:actionsTab.state.${l.state as "running"}`)}
        </span>
      </div>
      {open && (
        <div className="pb-1.5 pl-8">
          {steps.map((s) => {
            const sl = look(s);
            return (
              <div key={s.number} className="flex items-center gap-2 py-0.5 pr-2 text-[11.5px]">
                <Mark glyph={sl.glyph} tone={sl.tone} size={9} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    sl.state === "skipped" ? "text-faint" : "text-dim",
                  )}
                  title={s.name}
                >
                  {s.name}
                </span>
                <span className="num text-[10.5px] text-faint">
                  {s.status === "completed" && sl.state !== "skipped" ? formatDuration(jobMs(s)) : ""}
                </span>
              </div>
            );
          })}
          {j.runner_name && (
            <div className="num pt-1 text-[10.5px] text-faint">
              {t("run.runner", { name: j.runner_name })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ArtifactList({ repo, q }: { repo: string; q: ReturnType<typeof useArtifacts> }) {
  const { t } = useTranslation("actions");
  const [busy, setBusy] = useState<number | null>(null);
  const list = q.data ?? [];
  if (!list.length) return null;
  const download = async (id: number, name: string) => {
    const dest = await save({ defaultPath: `${name}.zip`, filters: [{ name: "ZIP", extensions: ["zip"] }] });
    if (!dest) return;
    setBusy(id);
    try {
      const n = await unwrap(commands.actionsDownloadArtifact(repo, id, dest));
      toast({ kind: "success", title: t("artifacts.saved", { name }), body: `${formatBytes(n)} · ${dest}` });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mt-2 border-t border-line-strong">
      <div className="annot px-3 py-2">{t("artifacts.title", { count: list.length })}</div>
      {list.map((a) => (
        <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
          <span className="min-w-0 flex-1">
            <span className={cn("num block truncate", a.expired && "text-faint line-through")}>{a.name}</span>
            <span className="text-[10.5px] text-faint">
              {formatBytes(a.size_in_bytes)}
              {a.expires_at && !a.expired && (
                <>
                  {" · "}
                  {t("artifacts.expires")} <RelTime at={a.expires_at} />
                </>
              )}
              {a.expired && ` · ${t("artifacts.expired")}`}
            </span>
          </span>
          {!a.expired && (
            <IconButton
              icon={Download}
              label={t("artifacts.download")}
              size={13}
              className="size-7"
              disabled={busy != null}
              onClick={() => void download(a.id, a.name)}
            />
          )}
          {busy === a.id && <Badge tone="accent">…</Badge>}
        </div>
      ))}
    </div>
  );
}


function LogPane({ repo, job }: { repo: string; job: Job }) {
  const { t } = useTranslation(["actions", "home"]);
  const finished = job.status === "completed";
  const log = useJobLog(repo, job.id, finished);
  const blocks = useMemo(() => (log.data ? parseLog(log.data.text) : []), [log.data]);
  const [q, setQ] = useState("");
  const [times, setTimes] = useState(false);
  const firstErr = firstErrorBlock(blocks);
  const errors = blocks.reduce((n, b) => n + b.errors, 0);
  const warnings = blocks.reduce((n, b) => n + b.warnings, 0);
  const scroller = useRef<HTMLDivElement>(null);
  const jumpToError = () =>
    scroller.current?.querySelector("[data-error]")?.scrollIntoView({ block: "center" });
  useEffect(() => {
    if (firstErr >= 0) requestAnimationFrame(jumpToError);
  }, [firstErr]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[12.5px]">{job.name}</span>
        {errors > 0 && (
          <button className="cursor-default" onClick={jumpToError}>
            <Badge tone="danger">{t("log.errors", { count: errors })}</Badge>
          </button>
        )}
        {warnings > 0 && <Badge tone="warn">{t("log.warnings", { count: warnings })}</Badge>}
        <label className="flex cursor-default items-center gap-1 text-[11.5px] text-faint">
          <input
            type="checkbox"
            checked={times}
            onChange={(e) => setTimes(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          {t("log.times")}
        </label>
        <div className="w-[200px]">
          <Input
            icon={Search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("log.find")}
            className="!h-7 text-[12px]"
          />
        </div>
        {job.html_url && (
          <IconButton
            icon={ExternalLink}
            label={t("openOnGitHub")}
            size={13}
            className="size-7"
            onClick={() => void openUrl(job.html_url!)}
          />
        )}
      </div>
      <div
        ref={scroller}
        className="num min-h-0 flex-1 overflow-auto bg-bg py-1 text-[11.5px] leading-[18px]"
      >
        {!finished ? (
          <EmptyState
            title={t("log.live")}
            body={t("log.liveBody")}
            action={
              job.html_url ? (
                <Button size="sm" icon={ExternalLink} onClick={() => void openUrl(job.html_url!)}>
                  {t("openOnGitHub")}
                </Button>
              ) : undefined
            }
          />
        ) : log.isLoading ? (
          <Plotter />
        ) : log.error ? (
          <EmptyState title={errorMessage(log.error)} body={t("log.unavailable")} />
        ) : (
          <>
            {log.data && log.data.cut > 0 && (
              <div className="px-3 py-1 text-[11px] text-warn">
                {t("log.cut", { size: formatBytes(log.data.cut) })}
              </div>
            )}
            {blocks.map((b, i) => (
              <Block
                key={i}
                b={b}
                open={!!q || i === firstErr || b.title === null}
                q={q.toLowerCase()}
                times={times}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Block({ b, open, q, times }: { b: LogBlock; open: boolean; q: string; times: boolean }) {
  const [manual, setManual] = useState<boolean | null>(null);
  const expanded = manual ?? open;
  const lines = q ? b.lines.filter((l) => l.text.toLowerCase().includes(q)) : b.lines;
  if (q && !lines.length && !b.title?.toLowerCase().includes(q)) return null;
  return (
    <div>
      {b.title !== null && (
        <button
          className="flex w-full cursor-default items-center gap-1.5 px-3 text-left hover:bg-surface-2"
          onClick={() => setManual(!expanded)}
        >
          {expanded ? (
            <ChevronDown size={11} className="text-faint" />
          ) : (
            <ChevronRight size={11} className="text-faint" />
          )}
          <span className="truncate text-text">{b.title}</span>
          {b.errors > 0 && <span className="text-danger">✕ {b.errors}</span>}
          {b.warnings > 0 && <span className="text-warn">! {b.warnings}</span>}
        </button>
      )}
      {(expanded || b.title === null) &&
        lines.map((l) => (
          <div
            key={l.n}
            data-error={l.kind === "error" ? "" : undefined}
            className={cn(
              "grid grid-cols-[48px_minmax(0,1fr)] pr-3",
              b.title !== null && "pl-4",
              l.kind === "error" && "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger",
              l.kind === "warning" && "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-warn",
              l.kind === "command" && "text-info",
              l.kind === "debug" && "text-faint",
            )}
          >
            <span className="pr-2 text-right text-faint select-none">{l.n}</span>
            <span className="break-all whitespace-pre-wrap">
              {times && l.ts && <span className="mr-2 text-faint">{l.ts.slice(11, 19)}</span>}
              {l.text || " "}
            </span>
          </div>
        ))}
    </div>
  );
}
