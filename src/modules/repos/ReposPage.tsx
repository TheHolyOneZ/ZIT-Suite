import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderGit2, FolderPlus, LayoutGrid, RefreshCw, Rows3, Sparkles } from "lucide-react";
import { cn } from "@/core/cn";
import { errorMessage } from "@/core/errors";
import { formatNumber, formatRelative } from "@/core/i18n/format";
import { useHotkeys } from "@/core/keyboard";
import { useSession } from "@/core/store/session";
import { useActiveAccount } from "@/core/store/session";
import { Button, EmptyState, FilterBar, PageHeader, Plotter, Segmented, Mark, ViewsMenu, useNow } from "@/ui";
import { requestQueue } from "@/modules/queue/store";
import { refreshRepos, useVisibleRows } from "./api";
import { CleanupDialog } from "./CleanupDialog";
import { CreateRepoDialog } from "./CreateRepoDialog";
import { ExportDialog } from "./ExportDialog";
import { HEALTH_ORDER, healthGlyph, healthTone, type HealthStatus } from "./health";
import { RepoFacets, useRepoChips } from "./RepoFacets";
import { openRepo } from "./RepoSheet";
import { RepoGrid } from "./RepoGrid";
import { RepoTable } from "./RepoTable";
import { SelectionBar } from "./SelectionBar";
import { useReposPrefs, useReposUi } from "./store";

export function ReposPage() {
  useNow();
  const { t } = useTranslation(["repos", "common"]);
  const { rows, visible, query } = useVisibleRows();
  const [creating, setCreating] = useState(false);
  const view = useReposPrefs((s) => s.view);
  const setPrefs = useReposPrefs((s) => s.set);
  const ui = useReposUi();
  const org = useSession((s) => s.org);
  const account = useActiveAccount();
  const presets = useReposPrefs((s) => s.presets);
  const savePreset = useReposPrefs((s) => s.savePreset);
  const deletePreset = useReposPrefs((s) => s.deletePreset);
  const chips = useRepoChips();
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ui.searchFocus) searchRef.current?.focus();
  }, [ui.searchFocus]);
  const activePreset = useMemo(
    () =>
      presets.find(
        (p) => JSON.stringify({ ...p.filter, search: "" }) === JSON.stringify({ ...ui.filter, search: "" }),
      )?.id ?? null,
    [presets, ui.filter],
  );


  useEffect(() => {
    if (!query.isSuccess || ui.selected.size === 0) return;
    const names = new Set(rows.map((r) => r.repo.full_name));
    const kept = [...ui.selected].filter((n) => names.has(n));
    if (kept.length !== ui.selected.size) ui.setSelected(kept);
  }, [rows, query.isSuccess, ui]);

  const targets = () =>
    ui.selected.size ? [...ui.selected] : visible[ui.cursor] ? [visible[ui.cursor].repo.full_name] : [];
  const refresh = () => refreshRepos();

  useHotkeys({
    j: () => ui.set({ cursor: Math.min(visible.length - 1, ui.cursor + 1) }),
    arrowdown: () => ui.set({ cursor: Math.min(visible.length - 1, ui.cursor + 1) }),
    k: () => ui.set({ cursor: Math.max(0, ui.cursor - 1) }),
    arrowup: () => ui.set({ cursor: Math.max(0, ui.cursor - 1) }),
    space: () => visible[ui.cursor] && ui.toggleSelect(visible[ui.cursor].repo.full_name),
    enter: () =>
      visible[ui.cursor] && openRepo(visible[ui.cursor].repo.full_name, visible[ui.cursor].repo.name),
    d: () => requestQueue(targets(), { kind: "delete" }),
    a: () => requestQueue(targets(), { kind: "archive" }),
    r: () => void refresh(),
    f: () => ui.set({ searchFocus: ui.searchFocus + 1 }),
    "mod+a": () => ui.setSelected(visible.map((r) => r.repo.full_name)),

    ...(ui.selected.size ? { escape: () => ui.setSelected([]) } : {}),
  });

  return (
    <div className="relative flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={
          <>
            <span className="num">
              {t("meta.count", { shown: formatNumber(visible.length), total: formatNumber(rows.length) })}
            </span>
            <span className="text-faint">·</span>
            <span>{org ?? account?.login}</span>
            {query.dataUpdatedAt > 0 && (
              <>
                <span className="text-faint">·</span>
                <span className="num">
                  {t("meta.synced", { when: formatRelative(new Date(query.dataUpdatedAt).toISOString()) })}
                </span>
              </>
            )}
          </>
        }
        actions={
          <>
            <Button variant="primary" icon={FolderPlus} onClick={() => setCreating(true)}>
              {t("create.open")}
            </Button>
            <Button icon={Sparkles} onClick={() => ui.set({ cleanupOpen: true })}>
              {t("actions.cleanup")}
            </Button>
            <Button icon={RefreshCw} loading={query.isFetching} onClick={refresh}>
              {t("actions.refresh")}
            </Button>
            <Segmented
              value={view}
              onChange={(v) => setPrefs({ view: v })}
              options={[
                { value: "table", label: "", icon: Rows3, title: t("view.table") },
                { value: "grid", label: "", icon: LayoutGrid, title: t("view.grid") },
              ]}
            />
          </>
        }
      />

      <FilterBar
        ref={searchRef}
        search={ui.filter.search}
        onSearch={(search) => ui.setFilter({ search })}
        placeholder={t("panel.search")}
        chips={chips}
        facets={<RepoFacets />}
        onReset={ui.resetFilter}
        views={
          <ViewsMenu
            builtin={[{ id: "all", label: t("views.all") }]}
            saved={presets.map((p) => ({ id: p.id, label: p.name }))}
            activeId={activePreset ?? (chips.length === 0 ? "all" : null)}
            onPick={(id) =>
              id === "all"
                ? ui.resetFilter()
                : ui.set({
                    filter: { ...presets.find((p) => p.id === id)!.filter, search: ui.filter.search },
                    cursor: 0,
                  })
            }
            onSave={(name) => savePreset(name, ui.filter)}
            onDelete={deletePreset}
          />
        }
      />
      <HealthStrip />
      {query.isFetching && <Plotter className="absolute top-0 right-0 left-0" />}

      {query.isLoading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <div className="w-48">
            <Plotter />
          </div>
          <span className="annot">{t("states.loading")}</span>
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={<FolderGit2 size={20} />}
          title={errorMessage(query.error)}
          action={<Button onClick={refresh}>{t("common:actions.retry")}</Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<FolderGit2 size={20} />}
          title={rows.length ? t("states.noMatch") : t("states.empty")}
          action={rows.length ? <Button onClick={ui.resetFilter}>{t("panel.resetAll")}</Button> : undefined}
        />
      ) : view === "table" ? (
        <RepoTable rows={visible} />
      ) : (
        <RepoGrid rows={visible} />
      )}

      <SelectionBar />
      <CleanupDialog />
      {creating && <CreateRepoDialog onClose={() => setCreating(false)} />}
      <ExportDialog />
    </div>
  );
}


function HealthStrip() {
  const { t } = useTranslation(["repos", "common"]);
  const { rows } = useVisibleRows();
  const filter = useReposUi((s) => s.filter);
  const setFilter = useReposUi((s) => s.setFilter);
  const counts = useMemo(() => {
    const c = Object.fromEntries(HEALTH_ORDER.map((h) => [h, 0])) as Record<HealthStatus, number>;
    for (const r of rows) c[r.health.status]++;
    return c;
  }, [rows]);
  const total = Math.max(1, rows.length);

  return (
    <div className="grid shrink-0 grid-cols-5 border-b border-line bg-surface">
      {HEALTH_ORDER.map((h, i) => {
        const on = filter.health.includes(h);
        return (
          <button
            key={h}
            onClick={() =>
              setFilter({ health: on ? filter.health.filter((x) => x !== h) : [...filter.health, h] })
            }
            className={cn(
              "group relative px-5 pt-3 pb-3.5 text-left transition-colors cursor-default",
              i > 0 && "border-l border-line",
              on ? "bg-surface-2" : "hover:bg-surface-2",
            )}
          >
            <div className="flex items-center gap-2">
              <Mark glyph={healthGlyph[h]} tone={healthTone[h]} size={11} />
              <span className="annot">{t(`health.${h}`)}</span>
              <span className="num ml-auto text-[10.5px] text-faint">
                {formatNumber(counts[h] / total, { style: "percent" })}
              </span>
            </div>
            <div className="num mt-1 text-[22px] leading-none font-semibold">{formatNumber(counts[h])}</div>
            <span
              className="absolute bottom-0 left-0 h-[2px] transition-all"
              style={{
                width: `${(counts[h] / total) * 100}%`,
                background: `var(--${healthTone[h]})`,
                opacity: on ? 1 : 0.65,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
