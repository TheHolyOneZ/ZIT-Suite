import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { RefreshCw, Users } from "lucide-react";
import { commands, unwrap, type Repo } from "@/core/ipc";
import { errorMessage } from "@/core/errors";
import { formatDate, formatNumber } from "@/core/i18n/format";
import { RepoPicker } from "@/app/RepoPicker";
import { Button, EmptyState, Panel, Plotter } from "@/ui";
import { ChartCard, Columns, Spark } from "./charts";
import { useInsights } from "./store";


export function PeopleView({ repos }: { repos: Repo[] }) {
  const { t } = useTranslation("insights");
  const picked = useInsights((s) => s.peopleRepo);
  const set = useInsights((s) => s.set);

  const repo =
    picked ??
    [...repos].sort((a, b) => (b.pushed_at ?? "").localeCompare(a.pushed_at ?? ""))[0]?.full_name ??
    null;
  const q = useQuery({
    queryKey: ["insights", "people", repo],
    queryFn: () => unwrap(commands.insightsContributors(repo!)),
    enabled: !!repo,
    staleTime: 10 * 60_000,
  });
  const list = useMemo(() => q.data?.contributors ?? [], [q.data]);
  const total = list.reduce((n, c) => n + c.commits, 0) || 1;
  const starts = q.data?.week_starts;
  const weeks = useMemo(
    () =>
      (starts ?? []).map((w, i) => ({
        key: formatDate(new Date(w * 1000).toISOString()),
        count: list.reduce((n, c) => n + (c.weekly[i] ?? 0), 0),
      })),
    [list, starts],
  );
  const span = (a: number, b: number) => {
    const [x, y] = [
      formatDate(new Date(a * 1000).toISOString()),
      formatDate(new Date(b * 1000).toISOString()),
    ];
    return x === y ? x : `${x} – ${y}`;
  };

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[340px]">
          <RepoPicker value={repo} onChange={(peopleRepo) => set({ peopleRepo })} />
        </div>
        <Button
          size="sm"
          icon={RefreshCw}
          loading={q.isFetching}
          disabled={!repo}
          onClick={() => void q.refetch()}
        >
          {t("people.reload")}
        </Button>
        <span className="text-[11.5px] text-faint">{t("people.hint")}</span>
      </div>
      {!repo ? (
        <EmptyState icon={<Users size={20} />} title={t("people.pick")} />
      ) : q.isLoading ? (
        <Plotter />
      ) : q.error ? (
        <EmptyState title={errorMessage(q.error)} />
      ) : q.data?.pending ? (
        <EmptyState
          icon={<Users size={20} />}
          title={t("people.pending")}
          body={t("people.pendingBody")}
          action={<Button onClick={() => void q.refetch()}>{t("people.reload")}</Button>}
        />
      ) : !list.length ? (
        <EmptyState icon={<Users size={20} />} title={t("people.none")} />
      ) : (
        <>
          <ChartCard kicker={t("people.kicker")} title={t("people.weekly")}>
            <Columns data={weeks} />
          </ChartCard>
          <Panel className="overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_120px_96px_90px_90px_190px] gap-3 border-b border-line px-3 py-1.5">
              {(["who", "commits", "trend", "added", "removed", "active"] as const).map((c, i) => (
                <span
                  key={c}
                  className={i === 0 || i === 2 ? "annot !text-[9.5px]" : "annot text-right !text-[9.5px]"}
                >
                  {t(`people.col.${c}`)}
                </span>
              ))}
            </div>
            {list.map((c) => (
              <div
                key={c.login}
                className="grid grid-cols-[minmax(0,1fr)_120px_96px_90px_90px_190px] items-center gap-3 border-b border-line px-3 py-1.5 text-[12px] last:border-b-0 hover:bg-surface-2"
              >
                <button
                  className="flex min-w-0 cursor-default items-center gap-2 text-left hover:text-accent"
                  onClick={() => c.login !== "ghost" && void openUrl(`https://github.com/${c.login}`)}
                >
                  {c.avatar_url && <img src={c.avatar_url} alt="" className="size-5 rounded-full" />}
                  <span className="num truncate">{c.login}</span>
                </button>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${(c.commits / total) * 100}%` }}
                    />
                  </span>
                  <span className="num w-10 text-right text-dim">{formatNumber(c.commits)}</span>
                </span>
                <Spark values={c.weekly} />
                <span className="num text-right text-ok">+{formatNumber(c.additions)}</span>
                <span className="num text-right text-danger">−{formatNumber(c.deletions)}</span>
                <span className="num text-right text-[11px] text-faint">
                  {c.first_week != null && c.last_week != null ? span(c.first_week, c.last_week) : "—"}
                </span>
              </div>
            ))}
          </Panel>
        </>
      )}
    </div>
  );
}
