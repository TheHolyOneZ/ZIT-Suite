import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Activity,
  Archive,
  BarChart3,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Undo2,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import { commands, events, unwrap, type Repo, type Traffic } from "@/core/ipc";
import { errorMessage } from "@/core/errors";
import { cn } from "@/core/cn";
import { formatDate, formatNumber } from "@/core/i18n/format";
import { useModuleSetting } from "@/core/store/moduleSettings";
import { useRepoList } from "@/core/data/repos";
import { useScopeKey } from "@/core/store/session";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  IconButton,
  Mark,
  Meter,
  PageHeader,
  Panel,
  Plotter,
  RelTime,
  Segmented,
  useNow,
  type Tone,
} from "@/ui";
import { requestQueue } from "@/modules/queue/store";
import { openRepo } from "@/modules/repos/RepoSheet";
import { computeHealth, HEALTH_ORDER, healthTone } from "@/modules/repos/health";
import { languageColor } from "@/modules/repos/languageColors";
import { formatBytes } from "@/modules/home/model";
import { Bars, ChartCard, Columns, Spark } from "./charts";
import {
  countBy,
  fixAction,
  nearDuplicates,
  perYear,
  pushesPerMonth,
  runChecks,
  tidyScore,
  type Finding,
  type Severity,
} from "./model";
import { useInsights, type InsightsView } from "./store";
import { toRule, type CustomRule } from "./custom";
import { RuleDialog, useDescribe } from "./RuleDialog";
import { PeopleView } from "./PeopleView";
import { firstDay, series, sumRange, useTrafficLog } from "./traffic";

const SEV: Record<Severity, { tone: Tone; glyph: "warn" | "info" | "block" }> = {
  critical: { tone: "danger", glyph: "block" },
  warning: { tone: "warn", glyph: "warn" },
  info: { tone: "info", glyph: "info" },
};


function useMine() {
  const { data, isLoading, error } = useRepoList();
  const includeArchived = useInsights((s) => s.includeArchived);
  const all = useMemo(() => (data ?? []).filter((r) => r.permissions?.admin), [data]);
  const repos = useMemo(() => all.filter((r) => includeArchived || !r.archived), [all, includeArchived]);
  return { all, repos, isLoading, error };
}

export function InsightsPage() {
  const { t } = useTranslation(["insights", "common"]);
  useNow();
  const s = useInsights();
  const { all, repos, isLoading, error } = useMine();
  return (
    <div className="relative flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={<span>{t("subtitle", { count: repos.length })}</span>}
        actions={
          <div className="flex items-center gap-3">
            <Checkbox
              checked={s.includeArchived}
              onChange={(includeArchived) => s.set({ includeArchived })}
              label={
                <span className="text-[12px]">
                  {t("includeArchived", { count: all.filter((r) => r.archived).length })}
                </span>
              }
            />
            <Segmented<InsightsView>
              value={s.view}
              onChange={(view) => s.set({ view })}
              options={[
                { value: "overview", label: t("views.overview"), icon: BarChart3 },
                { value: "checks", label: t("views.checks"), icon: ShieldAlert },
                { value: "traffic", label: t("views.traffic"), icon: Activity },
                { value: "people", label: t("views.people"), icon: Users },
              ]}
            />
          </div>
        }
      />
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <Plotter />
        ) : error ? (
          <EmptyState title={errorMessage(error)} />
        ) : s.view === "overview" ? (
          <Overview repos={repos} />
        ) : s.view === "checks" ? (
          <Checks repos={repos} />
        ) : s.view === "people" ? (
          <PeopleView repos={repos} />
        ) : (
          <TrafficView repos={repos} />
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-r border-b border-line px-3 py-2.5">
      <div className="annot !text-[9.5px]">{label}</div>
      <div className="num text-[20px] leading-tight">{value}</div>
      {sub && <div className="num text-[11px] text-faint">{sub}</div>}
    </div>
  );
}

function Overview({ repos }: { repos: Repo[] }) {
  const { t } = useTranslation("insights");
  const activeDays = useModuleSetting<number>("repos", "activeDays") ?? 30;
  const dormantDays = useModuleSetting<number>("repos", "dormantDays") ?? 180;
  const health = useMemo(
    () => countBy(repos, (r) => computeHealth(r, { activeDays, dormantDays }).status),
    [repos, activeDays, dormantDays],
  );
  const langs = useMemo(() => countBy(repos, (r) => r.language ?? t("noLanguage"), 10), [repos, t]);
  const topics = useMemo(() => countBy(repos, (r) => r.topics, 10), [repos]);
  const stars = repos.reduce((n, r) => n + r.stargazers_count, 0);
  const forks = repos.reduce((n, r) => n + r.forks_count, 0);
  const size = repos.reduce((n, r) => n + r.size * 1024, 0);
  const topStarred = [...repos]
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 8)
    .filter((r) => r.stargazers_count > 0);
  const biggest = [...repos].sort((a, b) => b.size - a.size).slice(0, 8);
  if (!repos.length) return <EmptyState title={t("empty")} />;
  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] border-t border-l border-line">
        <Kpi
          label={t("kpi.repos")}
          value={formatNumber(repos.length)}
          sub={t("kpi.split", {
            pub: repos.filter((r) => !r.private).length,
            priv: repos.filter((r) => r.private).length,
          })}
        />
        <Kpi label={t("kpi.stars")} value={formatNumber(stars)} />
        <Kpi label={t("kpi.forks")} value={formatNumber(forks)} />
        <Kpi label={t("kpi.size")} value={formatBytes(size)} />
        <Kpi label={t("kpi.languages")} value={formatNumber(countBy(repos, (r) => r.language).length)} />
        <Kpi
          label={t("kpi.issues")}
          value={formatNumber(repos.reduce((n, r) => n + r.open_issues_count, 0))}
        />
        <Kpi label={t("kpi.forksOf")} value={formatNumber(repos.filter((r) => r.fork).length)} />
        <Kpi label={t("kpi.archived")} value={formatNumber(repos.filter((r) => r.archived).length)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard kicker={t("chart.distribution")} title={t("chart.languages")}>
          <Bars
            data={langs.map((l) => ({
              ...l,
              color: l.key === t("noLanguage") ? "var(--line-strong)" : languageColor(l.key),
            }))}
          />
        </ChartCard>
        <ChartCard kicker={t("chart.health")} title={t("chart.lifecycle")}>
          <Bars
            data={HEALTH_ORDER.map((h) => ({
              key: h,
              label: t(`health.${h}`),
              count: health.find((x) => x.key === h)?.count ?? 0,
              color: `var(--${healthTone[h]})`,
            }))}
          />
        </ChartCard>
        <ChartCard kicker={t("chart.history")} title={t("chart.created")}>
          <Columns data={perYear(repos)} />
        </ChartCard>
        <ChartCard kicker={t("chart.activity")} title={t("chart.lastPush")}>
          <Columns data={pushesPerMonth(repos, 24)} color="var(--info)" />
        </ChartCard>
        <ChartCard kicker={t("chart.attention")} title={t("chart.topStarred")}>
          <Bars
            data={topStarred.map((r) => ({ key: r.full_name, label: r.name, count: r.stargazers_count }))}
            onPick={(k) => openRepo(k, k.split("/")[1])}
            empty={t("noStars")}
          />
        </ChartCard>
        <ChartCard kicker={t("chart.weight")} title={t("chart.biggest")}>
          <Bars
            data={biggest.map((r) => ({ key: r.full_name, label: r.name, count: r.size * 1024 }))}
            format={formatBytes}
            color="var(--warn)"
            onPick={(k) => openRepo(k, k.split("/")[1])}
          />
        </ChartCard>
        <ChartCard kicker={t("chart.taxonomy")} title={t("chart.topics")} className="lg:col-span-2">
          <Bars data={topics} color="var(--done)" empty={t("noTopics")} />
        </ChartCard>
      </div>
    </div>
  );
}

function Checks({ repos }: { repos: Repo[] }) {
  const { t } = useTranslation("insights");
  const dismissed = useInsights((s) => s.dismissed);
  const customRules = useInsights((s) => s.customRules);
  const findings = useMemo(
    () => runChecks(repos, dismissed, Date.now(), customRules.map(toRule)),
    [repos, dismissed, customRules],
  );
  const [editing, setEditing] = useState<CustomRule | "new" | null>(null);
  const dupes = useMemo(() => nearDuplicates(repos), [repos]);
  const score = tidyScore(repos, findings);
  const editRule = (id: string) => {
    const r = customRules.find((x) => x.id === id);
    return r ? () => setEditing(r) : undefined;
  };
  const hit = findings.filter((f) => f.repos.length);
  const clean = findings.filter((f) => !f.repos.length);
  return (
    <div className="mx-auto max-w-[1100px] space-y-3 p-4">
      <Panel ticks className="flex flex-wrap items-center gap-4 p-4">
        <div>
          <div className="annot">{t("checks.score")}</div>
          <div
            className={cn(
              "num text-[28px] leading-tight",
              score >= 80 ? "text-ok" : score >= 50 ? "text-warn" : "text-danger",
            )}
          >
            {score}%
          </div>
        </div>
        <Meter
          value={score}
          tone={score >= 80 ? "ok" : score >= 50 ? "warn" : "danger"}
          className="min-w-[160px] flex-1"
        />
        <div className="text-[12px] text-dim">{t("checks.scoreHint", { count: repos.length })}</div>
        <Button size="sm" icon={Plus} onClick={() => setEditing("new")} title={t("custom.newHint")}>
          {t("custom.new")}
        </Button>
      </Panel>
      {editing && (
        <RuleDialog
          rule={editing === "new" ? null : editing}
          repos={repos}
          onClose={() => setEditing(null)}
        />
      )}
      {hit.map((f) => (
        <FindingCard key={f.rule.id} f={f} onEdit={editRule(f.rule.id)} />
      ))}
      {dupes.length > 0 && (
        <Panel className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <Mark glyph="equal" tone="info" />
            <span className="text-[13px] font-medium">{t("rules.nearDuplicates.title")}</span>
            <Badge>{dupes.length}</Badge>
            <span className="ml-2 text-[11.5px] text-faint">{t("rules.nearDuplicates.what")}</span>
          </div>
          {dupes.map((g) => (
            <div
              key={g.join()}
              className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 last:border-b-0"
            >
              {g.map((full, i) => (
                <span key={full} className="flex items-center gap-2">
                  {i > 0 && <span className="text-faint">≈</span>}
                  <button
                    className="num cursor-default text-[12.5px] hover:text-accent"
                    onClick={() => openRepo(full, full.split("/")[1])}
                  >
                    {full.split("/")[1]}
                  </button>
                </span>
              ))}
            </div>
          ))}
        </Panel>
      )}
      {clean.length > 0 && (
        <Panel className="p-3">
          <div className="annot mb-1.5">{t("checks.passing")}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {clean.map((f) => (
              <button
                key={f.rule.id}
                className="flex cursor-default items-center gap-1.5 text-left text-[12px] text-dim enabled:hover:text-accent"
                disabled={!f.rule.name}
                onClick={editRule(f.rule.id)}
              >
                <Mark glyph="tick" tone="ok" size={11} />
                {f.rule.name ?? t(`rules.${f.rule.id as "empty"}.title`)}
              </button>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function FindingCard({ f, onEdit }: { f: Finding; onEdit?: () => void }) {
  const { t } = useTranslation("insights");
  const describe = useDescribe();
  const custom = useInsights((s) => s.customRules.find((x) => x.id === f.rule.id));
  const [open, setOpen] = useState(f.rule.severity === "critical");
  const dismiss = useInsights((s) => s.dismiss);
  const dismissedCount = useInsights((s) => s.dismissed[f.rule.id]?.length ?? 0);
  const restore = useInsights((s) => s.restore);
  const sev = SEV[f.rule.severity];
  const names = f.repos.map((r) => r.full_name);
  const FixIcon = f.rule.fix === "delete" ? Trash2 : f.rule.fix === "archive" ? Archive : EyeOff;
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <button
          className="flex min-w-0 flex-1 cursor-default items-center gap-2 text-left"
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <ChevronDown size={14} className="text-faint" />
          ) : (
            <ChevronRight size={14} className="text-faint" />
          )}
          <Mark glyph={sev.glyph} tone={sev.tone} />
          <span className="text-[13px] font-medium">
            {f.rule.name ?? t(`rules.${f.rule.id as "empty"}.title`)}
          </span>
          {custom && <Badge>{t("custom.badge")}</Badge>}
          <Badge tone={sev.tone}>{f.repos.length}</Badge>
          <span className="hidden truncate text-[11.5px] text-faint md:inline">
            {custom ? describe(custom.conds) : t(`rules.${f.rule.id as "empty"}.what`)}
          </span>
        </button>
        {onEdit && <IconButton icon={Pencil} label={t("custom.edit")} size={13} onClick={onEdit} />}
        {dismissedCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon={Undo2}
            onClick={() => restore(f.rule.id)}
            title={t("checks.restoreHint")}
          >
            {t("checks.restore", { count: dismissedCount })}
          </Button>
        )}
        {f.rule.fix && (
          <Button
            size="sm"
            variant={
              f.rule.fix === "delete" ? "danger" : f.rule.fix === "set_private" ? "secondary" : "primary"
            }
            icon={FixIcon}
            onClick={() => requestQueue(names, fixAction(f.rule.fix!))}
          >
            {t(`fix.${f.rule.fix}`, { count: names.length })}
          </Button>
        )}
      </div>
      {open && (
        <div className="border-t border-line">
          {f.repos.map((r) => (
            <div
              key={r.full_name}
              className="group grid grid-cols-[minmax(0,1fr)_110px_auto] items-center gap-3 border-b border-line px-3 py-1.5 last:border-b-0 hover:bg-surface-2"
            >
              <button
                className="flex min-w-0 cursor-default items-center gap-1.5 text-left"
                onClick={() => openRepo(r.full_name, r.name)}
              >
                <span className="num truncate text-[12.5px] hover:text-accent">{r.name}</span>
                {r.private && <Lock size={10} className="shrink-0 text-faint" />}
                {r.description && <span className="truncate text-[11px] text-faint">{r.description}</span>}
              </button>
              <span className="text-right text-[11px] text-faint">
                {r.pushed_at ? <RelTime at={r.pushed_at} /> : "—"}
              </span>
              <span className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px] opacity-0 group-hover:opacity-100"
                  onClick={() => dismiss(f.rule.id, [r.full_name])}
                >
                  {t("checks.dismiss")}
                </Button>
                <button
                  className="cursor-default text-faint hover:text-accent"
                  onClick={() => void openUrl(r.html_url)}
                  title={t("openOnGitHub")}
                >
                  <ExternalLink size={12} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function TrafficView({ repos }: { repos: Repo[] }) {
  const { t } = useTranslation(["insights", "common"]);
  const scope = useScopeKey();
  const targets = useMemo(
    () =>
      repos
        .filter((r) => !r.archived && r.permissions?.push)
        .map((r) => r.full_name)
        .sort(),
    [repos],
  );
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    const un = events.trafficProgress.listen((e) => setProgress(e.payload));
    return () => void un.then((f) => f());
  }, []);
  const q = useQuery({
    queryKey: ["insights", "traffic", ...scope, targets.length],
    queryFn: async () => {
      const r = await unwrap(commands.insightsTraffic(targets, false));
      useTrafficLog.getState().merge(r);
      return r;
    },
    enabled: started && targets.length > 0,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  });
  const range = useInsights((s) => s.trafficRange);
  const setInsights = useInsights((s) => s.set);
  const log = useTrafficLog((s) => s.log);
  const since = useMemo(() => firstDay(log), [log]);

  const data = useMemo<Row[]>(
    () =>
      (q.data ?? [])
        .map((x) =>
          range === 14
            ? {
                repo: x.repo,
                views: x.views,
                uniques: x.view_uniques,
                clones: x.clones,
                spark: x.views_daily.map((d) => d.count),
                referrers: x.referrers,
                error: !!x.error,
              }
            : (() => {
                const v = sumRange(log[x.repo]?.v, range);
                return {
                  repo: x.repo,
                  views: v.count,
                  uniques: v.uniques,
                  clones: sumRange(log[x.repo]?.c, range).count,
                  spark: weekly(series(log[x.repo]?.v, range)),
                  referrers: x.referrers,
                  error: !!x.error,
                };
              })(),
        )
        .sort((a, b) => b.views - a.views || b.clones - a.clones),
    [q.data, range, log],
  );
  if (!started && !q.data)
    return (
      <EmptyState
        icon={<Eye size={20} />}
        title={t("traffic.title")}
        body={t("traffic.intro", { count: targets.length, requests: targets.length * 2 })}
        action={
          <Button variant="primary" icon={Activity} onClick={() => setStarted(true)}>
            {t("traffic.load")}
          </Button>
        }
      />
    );
  if (q.isFetching && !q.data)
    return (
      <div className="mx-auto mt-20 max-w-[420px] space-y-2 text-center">
        <Plotter />
        <Meter value={progress ? (progress.done / Math.max(1, progress.total)) * 100 : 3} />
        <div className="num text-[11px] text-faint">
          {progress ? `${progress.done}/${progress.total}` : "…"}
        </div>
      </div>
    );
  if (q.error) return <EmptyState title={errorMessage(q.error)} />;
  const views = data.reduce((n, x) => n + x.views, 0);
  const uniq = data.reduce((n, x) => n + x.uniques, 0);
  const clones = data.reduce((n, x) => n + x.clones, 0);
  const seen = data.filter((x) => x.views > 0);
  const referrers = countSources(data);
  const failed = data.filter((x) => x.error).length;
  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<"14" | "90" | "365">
          size="sm"
          value={String(range) as "14"}
          onChange={(v) => setInsights({ trafficRange: Number(v) as 14 | 90 | 365 })}
          options={(["14", "90", "365"] as const).map((d) => ({ value: d, label: t(`traffic.range.${d}`) }))}
        />
        <span className="text-[12px] text-dim">
          {range === 14
            ? t("traffic.window")
            : since
              ? t("traffic.history", { date: formatDate(since) })
              : t("traffic.noHistory")}
        </span>
        {failed > 0 && (
          <span className="text-[11.5px] text-warn">{t("traffic.failed", { count: failed })}</span>
        )}
        <Button
          size="sm"
          icon={RefreshCw}
          className="ml-auto"
          loading={q.isFetching}
          onClick={() => void q.refetch()}
        >
          {t("traffic.reload")}
        </Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] border-t border-l border-line">
        <Kpi
          label={t("traffic.views")}
          value={formatNumber(views)}
          sub={
            range === 14 ? t("traffic.uniques", { count: uniq }) : t("traffic.visitorDays", { count: uniq })
          }
        />
        <Kpi label={t("traffic.clones")} value={formatNumber(clones)} />
        <Kpi label={t("traffic.visited")} value={`${seen.length}/${data.length}`} />
        <Kpi label={t("traffic.topRepo")} value={seen[0]?.repo.split("/")[1] ?? "—"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel className="overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_96px_70px_70px_70px] gap-3 border-b border-line px-3 py-1.5">
            {["repo", "trend", "views", "visitors", "clones"].map((c, i) => (
              <span key={c} className={cn("annot !text-[9.5px]", i > 1 && "text-right")}>
                {t(`traffic.col.${c as "repo"}`)}
              </span>
            ))}
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {(seen.length ? seen : data.slice(0, 20)).map((x) => (
              <TrafficRow key={x.repo} x={x} />
            ))}
            {!seen.length && <div className="px-3 py-3 text-[12px] text-faint">{t("traffic.none")}</div>}
          </div>
        </Panel>
        <ChartCard kicker={t("traffic.from")} title={t("traffic.referrers")}>
          <Bars data={referrers} color="var(--info)" empty={t("traffic.noReferrers")} />
        </ChartCard>
      </div>
    </div>
  );
}

interface Row {
  repo: string;
  views: number;
  uniques: number;
  clones: number;
  spark: number[];
  referrers: Traffic["referrers"];
  error: boolean;
}


const weekly = (days: number[]) => {
  const out: number[] = [];
  for (let i = days.length % 7; i < days.length; i += 7)
    out.push(days.slice(i, i + 7).reduce((a, b) => a + b, 0));
  return out;
};

function TrafficRow({ x }: { x: Row }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_96px_70px_70px_70px] items-center gap-3 border-b border-line px-3 py-1.5 last:border-b-0 hover:bg-surface-2">
      <button
        className="num min-w-0 cursor-default truncate text-left text-[12.5px] hover:text-accent"
        onClick={() => openRepo(x.repo, x.repo.split("/")[1])}
      >
        {x.repo.split("/")[1]}
      </button>
      <Spark values={x.spark} />
      <span className="num text-right text-[12px]">{formatNumber(x.views)}</span>
      <span className="num text-right text-[12px] text-dim">{formatNumber(x.uniques)}</span>
      <span className="num text-right text-[12px] text-dim">{formatNumber(x.clones)}</span>
    </div>
  );
}

function countSources(data: Row[]) {
  const m = new Map<string, number>();
  for (const x of data) for (const s of x.referrers) m.set(s.name, (m.get(s.name) ?? 0) + s.count);
  return [...m.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
