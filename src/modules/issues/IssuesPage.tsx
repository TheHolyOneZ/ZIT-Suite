import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Ticket, CirclePlus, Download, Flag, RefreshCw, RotateCcw, Tags, TerminalSquare } from "lucide-react";
import { errorMessage, toastError } from "@/core/errors";
import { formatNumber } from "@/core/i18n/format";
import { useHotkeys } from "@/core/keyboard";

import { useActiveAccount } from "@/core/store/session";
import { cn } from "@/core/cn";
import {
  Button,
  EmptyState,
  FilterBar,
  IconButton,
  MenuItem,
  PageHeader,
  Plotter,
  Popover,
  Segmented,
  ViewsMenu,
} from "@/ui";
import { putIssue, SEARCH_CAP, useEffectiveQuery, useIssueSearch } from "./api";
import { BulkBar } from "./BulkBar";
import { CreateIssueDialog } from "./CreateIssueDialog";
import { exportIssues } from "./exportIssues";
import { IssueFacets, useIssueChips, VIEW_ICONS } from "./IssueFacets";
import { openIssue } from "./IssueSheet";
import { IssueList } from "./IssueList";
import { LabelsManager } from "./LabelsManager";
import { MilestonesManager } from "./MilestonesManager";
import {
  BUILTIN_VIEWS,
  DEFAULT_ISSUE_FILTER,
  issueKey,
  parseQuery,
  viewFilter,
  type BuiltinView,
} from "./query";
import { useIssuesPrefs, useIssuesUi, type IssuesTab } from "./store";
import { useIntent, useTopSheet } from "@/core/sheets/store";
import { useSession } from "@/core/store/session";
import { commands, unwrap, type IssuePatch } from "@/core/ipc";

export function IssuesPage() {
  const { t } = useTranslation("issues");
  const tab = useIssuesUi((s) => s.tab);
  const set = useIssuesUi((s) => s.set);
  const setPrefs = useIssuesPrefs((s) => s.set);


  useIntent("issues", (intent) => {
    const repo = String(intent.repo);
    const t = intent.tab === "labels" || intent.tab === "milestones" ? intent.tab : "issues";
    if (t === "issues")
      set({
        tab: t,
        filter: { ...DEFAULT_ISSUE_FILTER, scope: { kind: "repo", repo } },
        rawQuery: null,
        activeView: null,
        cursor: 0,
        selected: new Set(),
      });
    else {
      setPrefs({ managerRepo: repo });
      set({ tab: t });
    }
  });

  return (
    <div className="relative flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={<span>{t(`tabs.${tab}Hint`)}</span>}
        actions={
          <>
            <Segmented
              value={tab}
              onChange={(v: IssuesTab) => set({ tab: v })}
              options={[
                { value: "issues", label: t("tabs.issues"), icon: Ticket },
                { value: "labels", label: t("tabs.labels"), icon: Tags },
                { value: "milestones", label: t("tabs.milestones"), icon: Flag },
              ]}
            />
            <Button variant="primary" icon={CirclePlus} onClick={() => set({ createOpen: true })}>
              {t("create.button")}
            </Button>
          </>
        }
      />
      {tab === "issues" ? <IssuesTabView /> : tab === "labels" ? <LabelsManager /> : <MilestonesManager />}
      <CreateIssueDialog />
    </div>
  );
}

const blankPatch: IssuePatch = {
  title: null,
  body: null,
  state: null,
  state_reason: null,
  labels: null,
  assignees: null,
  milestone: null,
  clear_milestone: false,
};

function IssuesTabView() {
  const { t } = useTranslation(["issues", "common"]);
  const qc = useQueryClient();
  const ui = useIssuesUi();
  const search = useIssueSearch();
  const chips = useIssueChips();
  const org = useSession((s) => s.org);
  const savedViews = useIssuesPrefs((s) => s.views);
  const saveView = useIssuesPrefs((s) => s.saveView);
  const deleteView = useIssuesPrefs((s) => s.deleteView);
  const { issues } = search;
  const showRepo = ui.filter.scope.kind !== "repo" || ui.rawQuery !== null;
  const top = useTopSheet("issues", "issue");
  const current = top ? issues.find((i) => i.repo === top.repo && i.number === top.number) : undefined;

  const cursorIssue = issues[ui.cursor];
  const target = current ?? cursorIssue;
  const quick = async (patch: Partial<IssuePatch>) => {
    if (!target) return;
    try {
      putIssue(await unwrap(commands.issuesUpdate(target.repo, target.number, { ...blankPatch, ...patch })));
    } catch (e) {
      toastError(e);
    }
  };
  const openPicker = (kind: "labels" | "assignees" | "milestone") => {
    if (!top && cursorIssue) openIssue(cursorIssue);
    setTimeout(() => ui.set({ picker: { kind, n: Date.now() } }));
  };

  useHotkeys({
    j: () => ui.set({ cursor: Math.min(issues.length - 1, ui.cursor + 1) }),
    arrowdown: () => ui.set({ cursor: Math.min(issues.length - 1, ui.cursor + 1) }),
    k: () => ui.set({ cursor: Math.max(0, ui.cursor - 1) }),
    arrowup: () => ui.set({ cursor: Math.max(0, ui.cursor - 1) }),
    x: () => cursorIssue && ui.toggleSelect(issueKey(cursorIssue.repo, cursorIssue.number)),
    space: () => cursorIssue && ui.toggleSelect(issueKey(cursorIssue.repo, cursorIssue.number)),
    enter: () => cursorIssue && (ui.set({ picker: null }), openIssue(cursorIssue)),
    c: () => ui.set({ focusComposer: ui.focusComposer + 1 }),
    e: () => target?.state === "open" && quick({ state: "closed", state_reason: "completed" }),
    o: () => target?.state === "closed" && quick({ state: "open" }),
    l: () => openPicker("labels"),
    a: () => openPicker("assignees"),
    m: () => openPicker("milestone"),
    "/": () => ui.set({ focusQuery: ui.focusQuery + 1 }),
    n: () => ui.set({ createOpen: true }),
    r: () => void qc.invalidateQueries({ queryKey: ["issues", "search"] }),
    "mod+a": () => ui.setSelected(issues.map((i) => issueKey(i.repo, i.number))),

    ...(ui.picker
      ? { escape: () => ui.set({ picker: null }) }
      : ui.selected.size
        ? { escape: () => ui.setSelected([]) }
        : {}),
  });

  return (
    <>
      <QueryBar
        total={search.total}
        loaded={issues.length}
        fetching={search.isFetching}
        incomplete={search.incomplete}
        onExport={(f) => exportIssues(issues, f)}
      />
      {search.isFetching && !search.isFetchingNextPage && (
        <Plotter className="absolute top-0 right-0 left-0" />
      )}
      <FilterBar
        chips={chips}
        facets={<IssueFacets />}
        onReset={() => ui.set({ filter: DEFAULT_ISSUE_FILTER, rawQuery: null, activeView: "myOpen" })}
        views={
          <ViewsMenu
            builtin={(Object.keys(BUILTIN_VIEWS) as BuiltinView[]).map((v) => {
              const Icon = VIEW_ICONS[v];
              return { id: v, label: t(`views.${v}`), icon: <Icon size={12} /> };
            })}
            saved={savedViews.map((v) => ({ id: v.id, label: v.name }))}
            activeId={ui.activeView}
            onPick={(id) => {
              const builtin = id in BUILTIN_VIEWS;
              const f = builtin ? viewFilter(id as BuiltinView) : savedViews.find((v) => v.id === id)!.filter;
              const scoped =
                builtin && id === "myOpen" && org ? { ...f, scope: { kind: "org" as const, org } } : f;
              ui.set({ filter: scoped, rawQuery: null, activeView: id, cursor: 0, selected: new Set() });
            }}
            onSave={(name) => saveView(name, ui.filter)}
            onDelete={deleteView}
          />
        }
      />
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
        ) : issues.length === 0 ? (
          <EmptyState icon={<Ticket size={20} />} title={t("list.empty")} body={t("list.emptyHint")} />
        ) : (
          <IssueList
            issues={issues}
            hasMore={!!search.hasNextPage}
            loadingMore={search.isFetchingNextPage}
            onLoadMore={() => void search.fetchNextPage()}
            showRepo={showRepo}
          />
        )}
        <BulkBar issues={issues} />
      </div>
    </>
  );
}


function QueryBar({
  total,
  loaded,
  fetching,
  incomplete,
  onExport,
}: {
  total: number;
  loaded: number;
  fetching: boolean;
  incomplete: boolean;
  onExport: (f: "csv" | "json") => Promise<boolean>;
}) {
  const { t } = useTranslation("issues");
  const query = useEffectiveQuery();
  const login = useActiveAccount()?.login ?? "";
  const raw = useIssuesUi((s) => s.rawQuery);
  const focus = useIssuesUi((s) => s.focusQuery);
  const set = useIssuesUi((s) => s.set);
  const qc = useQueryClient();
  const [draft, setDraft] = useState(query);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(query), [query]);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  const capped = useMemo(() => total > SEARCH_CAP, [total]);

  return (
    <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
      <form
        className={cn(
          "flex h-8 flex-1 items-center gap-2 rounded-[var(--radius)] border bg-surface-2 px-2.5",
          raw !== null ? "border-accent" : "border-line-strong focus-within:border-accent",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          const raw = draft.trim();

          set({
            rawQuery: raw || null,
            ...(raw ? { filter: parseQuery(raw, login) } : {}),
            activeView: null,
            cursor: 0,
            selected: new Set(),
          });
          ref.current?.blur();
        }}
      >
        <TerminalSquare size={14} className="shrink-0 text-faint" />
        <input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && (setDraft(query), e.currentTarget.blur())}
          spellCheck={false}
          className="num min-w-0 flex-1 bg-transparent text-[12px] text-text outline-none"
          aria-label={t("query.label")}
        />
        {raw !== null && (
          <button
            type="button"
            onClick={() => set({ rawQuery: null })}
            title={t("query.reset")}
            className="text-faint hover:text-text cursor-default"
          >
            <RotateCcw size={12} />
          </button>
        )}
        <kbd className="num text-[10px] text-faint">/</kbd>
      </form>
      <span
        className="num shrink-0 text-[11.5px] text-dim"
        title={incomplete ? t("query.incomplete") : undefined}
      >
        {t("query.results", { count: total, shown: formatNumber(loaded), total: formatNumber(total) })}
        {capped && <span className="text-warn"> · {t("query.capped")}</span>}
      </span>
      <IconButton
        icon={RefreshCw}
        label={t("query.refresh")}
        className={fetching ? "animate-spin" : undefined}
        onClick={() => qc.invalidateQueries({ queryKey: ["issues", "search"] })}
      />
      <Popover
        placement="bottom-end"
        trigger={(p) => <IconButton {...p} icon={Download} label={t("export.title")} />}
      >
        {(c) => (
          <>
            <MenuItem onClick={() => (c(), onExport("csv").catch((e) => toastError(e)))}>
              {t("export.csvAll", { count: loaded })}
            </MenuItem>
            <MenuItem onClick={() => (c(), onExport("json").catch((e) => toastError(e)))}>
              {t("export.jsonAll", { count: loaded })}
            </MenuItem>
          </>
        )}
      </Popover>
    </div>
  );
}
