import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { GitPullRequest, GitPullRequestCreate, RefreshCw } from "lucide-react";
import { errorMessage } from "@/core/errors";
import { formatNumber } from "@/core/i18n/format";
import { useHotkeys } from "@/core/keyboard";
import { useIntent, useTopSheet } from "@/core/sheets/store";
import { useActiveAccount, useSession } from "@/core/store/session";
import { Button, EmptyState, FilterBar, IconButton, PageHeader, Plotter, QueryInput, ViewsMenu } from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { useEffectivePullQuery, usePullSearch } from "./api";
import { CreatePullDialog } from "./CreatePullDialog";
import { PullBulkBar } from "./PullBulkBar";
import { PULL_VIEW_ICONS, PullFacets, usePullChips } from "./PullFacets";
import { PullList } from "./PullList";
import { openPull } from "./PullSheet";
import {
  DEFAULT_PULL_FILTER,
  PULL_VIEWS,
  parsePullQuery,
  pullKey,
  pullViewFilter,
  type PullView,
} from "./query";
import { usePullsPrefs, usePullsUi } from "./store";

export function PullsPage() {
  const { t } = useTranslation(["pulls", "common"]);
  const qc = useQueryClient();
  const ui = usePullsUi();
  const search = usePullSearch();
  const { pulls } = search;
  const chips = usePullChips();
  const query = useEffectivePullQuery();
  const login = useActiveAccount()?.login ?? "";
  const org = useSession((s) => s.org);
  const views = usePullsPrefs((s) => s.views);
  const saveView = usePullsPrefs((s) => s.saveView);
  const deleteView = usePullsPrefs((s) => s.deleteView);
  const mergeMethod = usePullsPrefs((s) => s.mergeMethod);
  const top = useTopSheet("pulls", "pull");
  const cursorPull = pulls[ui.cursor];

  useIntent("pulls", (intent) => {
    ui.set({
      filter: { ...DEFAULT_PULL_FILTER, scope: { kind: "repo", repo: String(intent.repo) } },
      rawQuery: null,
      activeView: null,
      cursor: 0,
      selected: new Set(),
    });
  });

  useHotkeys({
    j: () => ui.set({ cursor: Math.min(pulls.length - 1, ui.cursor + 1) }),
    arrowdown: () => ui.set({ cursor: Math.min(pulls.length - 1, ui.cursor + 1) }),
    k: () => ui.set({ cursor: Math.max(0, ui.cursor - 1) }),
    arrowup: () => ui.set({ cursor: Math.max(0, ui.cursor - 1) }),
    x: () => cursorPull && ui.toggleSelect(pullKey(cursorPull.repo, cursorPull.number)),
    space: () => cursorPull && ui.toggleSelect(pullKey(cursorPull.repo, cursorPull.number)),
    enter: () => cursorPull && openPull(cursorPull),
    "/": () => ui.set({ focusQuery: ui.focusQuery + 1 }),
    n: () => ui.set({ createOpen: true }),
    r: () => void qc.invalidateQueries({ queryKey: ["pulls", "search"] }),

    "shift+m": () => {
      const p = top ? pulls.find((x) => x.repo === top.repo && x.number === top.number) : cursorPull;
      if (p)
        useQueue
          .getState()
          .requestRun([
            { repo: p.repo, action: { kind: "pr_merge", number: p.number, method: mergeMethod } },
          ]);
    },
    "mod+a": () => ui.setSelected(pulls.map((p) => pullKey(p.repo, p.number))),
    ...(ui.selected.size ? { escape: () => ui.setSelected([]) } : {}),
  });

  return (
    <div className="relative flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={<span>{t("subtitle")}</span>}
        actions={
          <Button variant="primary" icon={GitPullRequestCreate} onClick={() => ui.set({ createOpen: true })}>
            {t("create.button")}
          </Button>
        }
      />
      <QueryInput
        value={query}
        raw={ui.rawQuery !== null}
        label={t("query.label")}
        focusSignal={ui.focusQuery}
        onSubmit={(q) =>
          ui.set({
            rawQuery: q || null,
            ...(q ? { filter: parsePullQuery(q, login) } : {}),
            activeView: null,
            cursor: 0,
            selected: new Set(),
          })
        }
        onReset={() => ui.set({ rawQuery: null })}
        right={
          <>
            <span className="num shrink-0 text-[11.5px] text-dim">
              {t("query.results", {
                count: search.total,
                shown: formatNumber(pulls.length),
                total: formatNumber(search.total),
              })}
            </span>
            <IconButton
              icon={RefreshCw}
              label={t("query.refresh")}
              className={search.isFetching ? "animate-spin" : undefined}
              onClick={() => qc.invalidateQueries({ queryKey: ["pulls", "search"] })}
            />
          </>
        }
      />
      <FilterBar
        chips={chips}
        facets={<PullFacets />}
        onReset={() => ui.set({ filter: DEFAULT_PULL_FILTER, rawQuery: null, activeView: "myRepos" })}
        views={
          <ViewsMenu
            builtin={(Object.keys(PULL_VIEWS) as PullView[]).map((v) => {
              const Icon = PULL_VIEW_ICONS[v];
              return { id: v, label: t(`views.${v}`), icon: <Icon size={12} /> };
            })}
            saved={views.map((v) => ({ id: v.id, label: v.name }))}
            activeId={ui.activeView}
            onPick={(id) => {
              const builtin = id in PULL_VIEWS;
              const f = builtin ? pullViewFilter(id as PullView) : views.find((v) => v.id === id)!.filter;
              const scoped =
                f.scope.kind === "mine" && org ? { ...f, scope: { kind: "org" as const, org } } : f;
              ui.set({ filter: scoped, rawQuery: null, activeView: id, cursor: 0, selected: new Set() });
            }}
            onSave={(name) => saveView(name, ui.filter)}
            onDelete={deleteView}
          />
        }
      />
      {search.isFetching && !search.isFetchingNextPage && <Plotter />}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {search.isLoading ? (
          <div className="p-6">
            <Plotter />
          </div>
        ) : search.isError ? (
          <EmptyState
            title={errorMessage(search.error)}
            action={<Button onClick={() => search.refetch()}>{t("common:actions.retry")}</Button>}
          />
        ) : pulls.length === 0 ? (
          <EmptyState
            icon={<GitPullRequest size={20} />}
            title={t("list.empty")}
            body={t("list.emptyHint")}
          />
        ) : (
          <PullList
            pulls={pulls}
            hasMore={!!search.hasNextPage}
            loadingMore={search.isFetchingNextPage}
            onLoadMore={() => void search.fetchNextPage()}
          />
        )}
        <PullBulkBar pulls={pulls} />
      </div>
      <CreatePullDialog />
    </div>
  );
}
