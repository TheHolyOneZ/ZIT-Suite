import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  FileJson,
  FileText,
  Folder,
  HardDrive,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { commands, events, unwrap, type AuditReport } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { formatDate, formatNumber } from "@/core/i18n/format";
import { queryClient } from "@/core/query";
import { toast } from "@/core/store/toasts";
import { RepoPicker } from "@/app/RepoPicker";
import {
  Button,
  Checkbox,
  EmptyState,
  Meter,
  PageHeader,
  Panel,
  Plotter,
  RelTime,
  Segmented,
  Select,
  useConfirmClick,
  useNow,
} from "@/ui";
import { formatBytes } from "@/modules/home/model";
import { colorOf } from "./colors";
import {
  asciiTree,
  buildTree,
  compareSnapshots,
  isNoise,
  jsonTree,
  languageTotals,
  snapshotOf,
  type Node,
  type Snapshot,
  type SnapshotMetric,
  type SortBy,
} from "./model";
import { isLocal, localPath, targetLabel, useAudit } from "./store";
import { useWorkspaces } from "@/modules/home/api";

const auditKey = (repo: string) => ["audit", "report", repo];

export function AuditPage() {
  const { t } = useTranslation(["audit", "common"]);
  useNow();
  const s = useAudit();
  const [progress, setProgress] = useState<{ stage: string; done: number; total: number } | null>(null);
  useEffect(() => {
    const un = events.auditProgress.listen(({ payload: p }) =>
      setProgress({ stage: p.stage, done: p.done, total: p.total }),
    );
    return () => void un.then((f) => f());
  }, []);
  const q = useQuery({
    queryKey: auditKey(s.repo ?? ""),
    queryFn: async () => {
      setProgress(null);
      const target = s.repo!;
      const r = await unwrap(
        isLocal(target) ? commands.auditLocal(localPath(target)) : commands.auditRun(target),
      );
      s.remember(target, snapshotOf(r));
      void queryClient.invalidateQueries({ queryKey: ["audit", "cache"] });
      return r;
    },
    enabled: !!s.repo && s.started,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
  });

  const homes = useWorkspaces().data;
  const recent = s.recent.filter((r) => !isLocal(r) || !!homes?.some((w) => `local:${w.path}` === r));
  const pick = (repo: string) => s.set({ repo, started: !!queryClient.getQueryData(auditKey(repo)) });
  const analyze = (repo: string) => {
    s.set({ repo, started: true });
    if (queryClient.getQueryData(auditKey(repo)))
      void queryClient.refetchQueries({ queryKey: auditKey(repo) });
  };

  return (
    <div className="relative flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={<span>{t("subtitle")}</span>}
        actions={<CacheButton />}
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3">
        <Segmented<"github" | "local">
          size="sm"
          value={s.source}
          onChange={(source) => s.set({ source })}
          options={[
            { value: "github", label: t("source.github") },
            { value: "local", label: t("source.local") },
          ]}
        />
        <div className="w-[340px]">
          {s.source === "github" ? (
            <RepoPicker
              value={s.repo && !isLocal(s.repo) ? s.repo : null}
              onChange={(repo) => pick(repo)}
              placeholder={t("pick")}
            />
          ) : (
            <LocalPicker value={s.repo && isLocal(s.repo) ? s.repo : null} onChange={pick} />
          )}
        </div>
        <Button
          variant="primary"
          icon={q.data && s.started ? RefreshCw : Play}
          loading={q.isFetching}
          disabled={!s.repo}
          onClick={() => s.repo && analyze(s.repo)}
        >
          {q.data && s.started ? t("again") : t("analyze")}
        </Button>
        {recent.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-faint">{t("recent")}</span>
            {recent.map((r) => (
              <button
                key={r}
                title={isLocal(r) ? localPath(r) : r}
                onClick={() => s.set({ repo: r, started: true, source: isLocal(r) ? "local" : "github" })}
                className={cn(
                  "num flex h-6 cursor-default items-center gap-1 rounded-[3px] border px-1.5 text-[11px]",
                  r === s.repo ? "border-accent text-accent" : "border-line text-dim hover:text-accent",
                )}
              >
                {isLocal(r) && <HardDrive size={10} />}
                {targetLabel(r)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {q.isFetching ? (
          <Working progress={progress} />
        ) : q.isError ? (
          <EmptyState
            title={errorMessage(q.error)}
            action={<Button onClick={() => q.refetch()}>{t("common:actions.retry")}</Button>}
          />
        ) : q.data && s.started ? (
          <Report r={q.data} />
        ) : (
          <EmptyState icon={<FileCode size={20} />} title={t("start")} body={t("startBody")} />
        )}
      </div>
    </div>
  );
}

function Working({ progress }: { progress: { stage: string; done: number; total: number } | null }) {
  const { t } = useTranslation("audit");
  const stage = progress?.stage ?? "download";
  const pct = progress?.total
    ? (progress.done / progress.total) * 100
    : stage === "download"
      ? 4
      : stage === "files"
        ? 60
        : 85;
  return (
    <div className="mx-auto mt-20 max-w-[420px] space-y-2 text-center">
      <Plotter />
      <div className="text-[13px]">{t(`stage.${stage as "download"}`)}</div>
      <Meter value={pct} />
      {progress && progress.done > 0 && (
        <div className="num text-[11px] text-faint">
          {progress.total
            ? `${formatNumber(progress.done)} / ${formatNumber(progress.total)}`
            : t("commitsSoFar", { count: progress.done })}
        </div>
      )}
      <p className="text-[11.5px] text-faint">{t("workingHint")}</p>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-[120px] border-r border-b border-line px-3 py-2.5">
      <div className="annot !text-[9.5px]">{label}</div>
      <div className={cn("num text-[20px] leading-tight", tone)}>{value}</div>
      {sub && <div className="num text-[11px] text-faint">{sub}</div>}
    </div>
  );
}

function Report({ r }: { r: AuditReport }) {
  const { t } = useTranslation(["audit", "common"]);
  const s = useAudit();
  const tree = useMemo(() => buildTree(r.files, s.sort, s.skipNoise), [r.files, s.sort, s.skipNoise]);
  const langs = useMemo(() => languageTotals(r.files, s.skipNoise), [r.files, s.skipNoise]);
  const code = tree.lines - tree.blank;
  const binary = r.files.filter((f) => f.binary).length;

  const exportAs = async (kind: "txt" | "json") => {
    const base = r.local ? targetLabel(`local:${r.repo}`) : r.repo.replace("/", "-");
    const path = await save({
      defaultPath: kind === "txt" ? `${base}-tree.txt` : `${base}-structure.json`,
      filters: [{ name: kind.toUpperCase(), extensions: [kind] }],
    });
    if (!path) return;
    try {
      const meta = {
        repo: r.repo,
        branch: r.branch,
        head: r.head,
        generated_at: r.generated_at,
        commits: r.commits,
        additions: r.additions,
        deletions: r.deletions,
        lines: tree.lines,
        code_lines: code,
        files: tree.files,
      };
      await unwrap(
        commands.exportTextFile(
          path,
          kind === "txt" ? asciiTree(tree, `${r.repo} @ ${r.branch}`) : jsonTree(tree, meta),
        ),
      );
      toast({ kind: "success", title: t("exported") });
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {r.local ? (
          <span className="num flex items-center gap-1.5 text-[15px] font-semibold" title={r.repo}>
            <HardDrive size={14} className="text-dim" />
            {targetLabel(`local:${r.repo}`)}
          </span>
        ) : (
          <button
            className="num cursor-default text-[15px] font-semibold hover:text-accent"
            onClick={() => void openUrl(`https://github.com/${r.repo}`)}
          >
            {r.repo}
          </button>
        )}
        <span className="num text-[12px] text-faint">
          @ {r.branch} · {r.head.slice(0, 7)} · {t("measured")} <RelTime at={r.generated_at} />
        </span>
        <span className="flex-1" />
        <Checkbox
          checked={s.skipNoise}
          onChange={(skipNoise) => s.set({ skipNoise })}
          label={
            <span className="text-[12px]" title={t("noiseHint")}>
              {t("skipNoise")}
            </span>
          }
        />
        <Button size="sm" icon={FileText} onClick={() => void exportAs("txt")}>
          {t("exportTree")}
        </Button>
        <Button size="sm" icon={FileJson} onClick={() => void exportAs("json")}>
          {t("exportJson")}
        </Button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] border-t border-l border-line">
        <Stat
          label={t("stat.code")}
          value={formatNumber(code)}
          sub={t("stat.ofLines", { count: tree.lines })}
          tone="text-accent"
        />
        <Stat
          label={t("stat.files")}
          value={formatNumber(tree.files)}
          sub={binary ? t("stat.binary", { count: binary }) : undefined}
        />
        <Stat label={t("stat.size")} value={formatBytes(tree.size)} />
        <Stat
          label={t("stat.commits")}
          value={formatNumber(r.commits)}
          sub={r.first_commit ? t("stat.since", { date: formatDate(r.first_commit) }) : undefined}
        />
        <Stat label={t("stat.added")} value={`+${formatNumber(r.additions)}`} tone="text-ok" />
        <Stat label={t("stat.removed")} value={`−${formatNumber(r.deletions)}`} tone="text-danger" />
        <Stat
          label={t("stat.net")}
          value={formatNumber(r.additions - r.deletions)}
          sub={t("stat.churn", { pct: r.additions ? Math.round((r.deletions / r.additions) * 100) : 0 })}
        />
        <Stat label={t("stat.people")} value={formatNumber(r.contributors.length)} />
      </div>
      {r.history_capped && <p className="text-[11.5px] text-warn">{t("capped")}</p>}

      <Panel className="p-3">
        <div className="annot mb-2">{t("languages")}</div>
        <div className="flex h-3 overflow-hidden rounded-[3px]">
          {langs.map((l) => (
            <span
              key={l.name}
              style={{ width: `${l.share * 100}%`, background: colorOf(l.name) }}
              title={`${l.name} ${Math.round(l.share * 1000) / 10}%`}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {langs.slice(0, 12).map((l) => (
            <span key={l.name} className="flex items-center gap-1.5 text-[11.5px]">
              <span className="size-2.5 rounded-[2px]" style={{ background: colorOf(l.name) }} />
              {l.name}
              <span className="num text-faint">
                {(l.share * 100).toFixed(1)}% · {formatNumber(l.lines)}
              </span>
            </span>
          ))}
        </div>
      </Panel>

      <Compare r={r} />

      {r.monthly.length > 1 && <Activity r={r} />}

      <Panel className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <span className="annot flex-1">{t("tree")}</span>
          <Segmented<SortBy>
            size="sm"
            value={s.sort}
            onChange={(sort) => s.set({ sort })}
            options={(["lines", "size", "name"] as const).map((v) => ({ value: v, label: t(`sort.${v}`) }))}
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_90px_90px_120px] gap-3 border-b border-line px-3 py-1">
          <span className="annot !text-[9.5px]">{t("col.name")}</span>
          <span className="annot text-right !text-[9.5px]">{t("col.size")}</span>
          <span className="annot text-right !text-[9.5px]">{t("col.lines")}</span>
          <span className="annot !text-[9.5px]">{t("col.share")}</span>
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          {tree.children.map((n) => (
            <TreeRow key={n.path} n={n} depth={0} total={tree.lines} open={tree.children.length < 8} />
          ))}
        </div>
      </Panel>

      {r.hot_files.length > 0 && <HotFiles r={r} />}

      <Panel className="overflow-hidden">
        <div className="border-b border-line px-3 py-2">
          <span className="annot">{t("people")}</span>
        </div>
        {r.contributors.slice(0, 30).map((c) => (
          <div
            key={c.email}
            className="grid grid-cols-[minmax(0,1fr)_90px_110px_110px] gap-3 border-b border-line px-3 py-1.5 text-[12px] last:border-b-0"
          >
            <span className="truncate">
              {c.name} <span className="num text-[11px] text-faint">{c.email}</span>
            </span>
            <span className="num text-right text-dim">{t("commitsN", { count: c.commits })}</span>
            <span className="num text-right text-ok">+{formatNumber(c.additions)}</span>
            <span className="num text-right text-danger">−{formatNumber(c.deletions)}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function TreeRow({
  n,
  depth,
  total,
  open: initiallyOpen,
}: {
  n: Node;
  depth: number;
  total: number;
  open?: boolean;
}) {
  const [open, setOpen] = useState(!!initiallyOpen);
  const share = total ? n.lines / total : 0;
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_90px_90px_120px] items-center gap-3 border-b border-line px-3 py-1 hover:bg-surface-2">
        <button
          className="flex min-w-0 cursor-default items-center gap-1.5 text-left"
          style={{ paddingLeft: depth * 16 }}
          onClick={() => n.dir && setOpen(!open)}
        >
          {n.dir ? (
            open ? (
              <ChevronDown size={12} className="shrink-0 text-faint" />
            ) : (
              <ChevronRight size={12} className="shrink-0 text-faint" />
            )
          ) : (
            <span className="w-3 shrink-0" />
          )}
          {n.dir ? (
            <Folder size={13} className="shrink-0 text-info" />
          ) : (
            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: colorOf(n.language) }} />
          )}
          <span className={cn("num truncate text-[12px]", n.binary && "text-faint")}>{n.name}</span>
          {n.dir && <span className="num shrink-0 text-[10.5px] text-faint">{n.files}</span>}
        </button>
        <span className="num text-right text-[11.5px] text-dim">{formatBytes(n.size)}</span>
        <span className="num text-right text-[11.5px]">{n.binary ? "—" : formatNumber(n.lines)}</span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: `${Math.max(share * 100, share > 0 ? 1 : 0)}%` }}
            />
          </span>
          <span className="num w-9 text-right text-[10.5px] text-faint">
            {(share * 100).toFixed(share < 0.1 ? 1 : 0)}%
          </span>
        </span>
      </div>
      {n.dir && open && n.children.map((c) => <TreeRow key={c.path} n={c} depth={depth + 1} total={total} />)}
    </>
  );
}


function Activity({ r }: { r: AuditReport }) {
  const { t } = useTranslation("audit");
  const max = Math.max(1, ...r.monthly.map((m) => Math.max(m.additions, m.deletions)));
  const months = r.monthly.slice(-48);
  return (
    <Panel className="p-3">
      <div className="annot mb-2">{t("activity", { count: months.length })}</div>
      <div className="flex h-[120px] items-stretch gap-[2px]">
        {months.map((m) => (
          <div
            key={m.month}
            className="flex min-w-[3px] flex-1 flex-col"
            title={`${m.month} · ${t("commitsN", { count: m.commits })} · +${m.additions} −${m.deletions}`}
          >
            <div className="flex flex-1 items-end">
              <div
                className="w-full rounded-t-[1px] bg-ok/80"
                style={{ height: `${(m.additions / max) * 100}%`, background: "var(--ok)" }}
              />
            </div>
            <div className="h-px bg-line-strong" />
            <div className="flex flex-1 items-start">
              <div
                className="w-full rounded-b-[1px]"
                style={{ height: `${(m.deletions / max) * 100}%`, background: "var(--danger)" }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="num mt-1 flex justify-between text-[10.5px] text-faint">
        <span>{months[0]?.month}</span>
        <span>{months[months.length - 1]?.month}</span>
      </div>
    </Panel>
  );
}


function LocalPicker({ value, onChange }: { value: string | null; onChange: (t: string) => void }) {
  const { t } = useTranslation("audit");
  const ws = useWorkspaces();
  const list = ws.data ?? [];
  if (!ws.isLoading && !list.length)
    return <span className="text-[12px] text-faint">{t("noWorkspaces")}</span>;
  return (
    <Select value={value ?? ""} onChange={(e) => e.target.value && onChange(e.target.value)}>
      <option value="">{t("pickLocal")}</option>
      {list.map((w) => (
        <option key={w.id} value={`local:${w.path}`}>
          {`${w.name} — ${w.path}`}
        </option>
      ))}
    </Select>
  );
}


function HotFiles({ r }: { r: AuditReport }) {
  const { t } = useTranslation("audit");
  const s = useAudit();
  const list = r.hot_files.filter((f) => !s.skipNoise || !isNoise(f.path)).slice(0, 25);
  const max = Math.max(1, ...list.map((f) => f.commits));
  const alive = new Set(r.files.map((f) => f.path));
  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-line px-3 py-2">
        <span className="annot">{t("hot.title")}</span>
        <span className="ml-2 text-[11px] text-faint">{t("hot.hint")}</span>
      </div>
      {list.map((f) => (
        <div
          key={f.path}
          className="grid grid-cols-[minmax(0,1fr)_170px_90px_90px] items-center gap-3 border-b border-line px-3 py-1 text-[12px] last:border-b-0"
        >
          <span
            className={cn("num truncate", !alive.has(f.path) && "text-faint line-through")}
            title={alive.has(f.path) ? f.path : t("hot.gone")}
          >
            {f.path}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${(f.commits / max) * 100}%` }}
              />
            </span>
            <span className="num w-[72px] text-right text-[11px] whitespace-nowrap text-dim">
              {t("commitsN", { count: f.commits })}
            </span>
          </span>
          <span className="num text-right text-[11.5px] text-ok">+{formatNumber(f.additions)}</span>
          <span className="num text-right text-[11.5px] text-danger">−{formatNumber(f.deletions)}</span>
        </div>
      ))}
    </Panel>
  );
}


function Compare({ r }: { r: AuditReport }) {
  const { t } = useTranslation("audit");
  const s = useAudit();
  const key = r.local ? `local:${r.repo}` : r.repo;
  const all = s.snapshots[key] ?? NO_SNAPSHOTS;
  const now = useMemo(() => snapshotOf(r), [r]);
  const earlier = all.filter((x) => x.at < r.generated_at && x.head !== r.head);
  if (!earlier.length) return null;
  const before = earlier.find((x) => x.at === s.compareAt) ?? earlier[0];
  const c = compareSnapshots(before, now);
  const fmt = (k: SnapshotMetric, n: number) =>
    k === "size" ? formatBytes(Math.abs(n)) : formatNumber(Math.abs(n));
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <span className="annot flex-1">{t("compare.title")}</span>
        <span className="text-[11.5px] text-faint">{t("compare.with")}</span>
        <div className="w-[260px]">
          <Select value={before.at} onChange={(e) => s.set({ compareAt: e.target.value })}>
            {earlier.map((x) => (
              <option key={x.at} value={x.at}>
                {`${formatDate(x.at)} · ${x.head.slice(0, 7)}`}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
        {c.metrics.map((m) => (
          <div key={m.key} className="border-r border-b border-line px-3 py-2">
            <div className="annot !text-[9.5px]">{t(`compare.metric.${m.key}`)}</div>
            <div
              className={cn(
                "num text-[16px]",
                m.delta > 0 ? "text-ok" : m.delta < 0 ? "text-danger" : "text-faint",
              )}
            >
              {m.delta > 0 ? "+" : m.delta < 0 ? "−" : "±"}
              {fmt(m.key, m.delta)}
            </div>
            <div className="num text-[10.5px] text-faint">
              {fmt(m.key, m.before)} → {fmt(m.key, m.now)}
            </div>
          </div>
        ))}
      </div>
      {c.langs.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2">
          {c.langs.slice(0, 12).map((l) => (
            <span key={l.name} className="flex items-center gap-1.5 text-[11.5px]">
              <span className="size-2.5 rounded-[2px]" style={{ background: colorOf(l.name) }} />
              {l.name}
              <span className={cn("num", l.delta > 0 ? "text-ok" : "text-danger")}>
                {l.delta > 0 ? "+" : "−"}
                {formatNumber(Math.abs(l.delta))}
              </span>
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}

const NO_SNAPSHOTS: Snapshot[] = [];

function CacheButton() {
  const { t } = useTranslation("audit");
  const q = useQuery({
    queryKey: ["audit", "cache"],
    queryFn: () => unwrap(commands.auditCache()),
    staleTime: 10_000,
  });
  const clear = useConfirmClick(async () => {
    try {
      await unwrap(commands.auditCacheClear(null));
      toast({ kind: "success", title: t("cleared") });
      void q.refetch();
    } catch (e) {
      toastError(e);
    }
  });
  if (!q.data?.repos.length) return null;
  return (
    <Button
      variant="ghost"
      icon={clear.armed ? Trash2 : HardDrive}
      className={clear.armed ? "text-danger" : undefined}
      onClick={clear.onClick}
      title={t("cacheHint")}
    >
      {clear.armed
        ? t("clearConfirm")
        : t("cache", { size: formatBytes(q.data.bytes), count: q.data.repos.length })}
    </Button>
  );
}
