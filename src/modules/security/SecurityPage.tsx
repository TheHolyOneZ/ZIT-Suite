import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import {
  ArrowUpCircle,
  Boxes,
  CalendarSync,
  Download,
  RefreshCw,
  Rows3,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  ToggleRight,
} from "lucide-react";
import type { AlertKind, Feature, Severity } from "@/core/ipc";
import { commands, unwrap } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { formatNumber, formatRelative } from "@/core/i18n/format";
import { sheets, useIntent } from "@/core/sheets/store";
import { toast } from "@/core/store/toasts";
import {
  Button,
  Checkbox,
  EmptyState,
  FilterBar,
  Mark,
  Meter,
  PageHeader,
  Plotter,
  Popover,
  Segmented,
  useNow,
  type FilterChip,
} from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { rescanSecurity, useSecurityIndex } from "./api";
import { DependabotDialog } from "./DependabotDialog";
import { AlertGroupsList, FixesList, ReposList } from "./ListViews";
import { alertsCsv, baselinePlan, FEATURES, SEVERITIES, type SlaPreset } from "./model";
import { KIND_ICON, SeverityMark } from "./parts";
import { useSecurityPrefs, useSecurityUi, type SecurityView } from "./store";

export function SecurityPage() {
  const [depOpen, setDepOpen] = useState(false);
  const { t } = useTranslation(["security", "common"]);
  useNow();
  const { index, scan } = useSecurityIndex();
  const prefs = useSecurityPrefs();
  const ui = useSecurityUi();

  useIntent("security", (i) =>
    sheets.push("security", "repo", { repo: String(i.repo), title: String(i.repo).split("/")[1] }),
  );

  const q = ui.search.toLowerCase();
  const minRank = SEVERITIES.indexOf(ui.minSeverity);
  const groups = useMemo(
    () =>
      index.groups.filter(
        (g) =>
          (ui.kind === "all" || g.kind === ui.kind) &&
          SEVERITIES.indexOf(g.severity) <= minRank &&
          (!ui.onlyFlagged || g.overdue > 0) &&
          (!q ||
            [g.title, g.key, g.package ?? "", ...g.items.map((i) => i.repo)].some((s) =>
              s.toLowerCase().includes(q),
            )),
      ),
    [index, ui.kind, minRank, ui.onlyFlagged, q],
  );
  const fixes = useMemo(
    () =>
      index.fixes.filter(
        (f) =>
          SEVERITIES.indexOf(f.severity) <= minRank &&
          (!q || [f.package, ...f.repos.map((r) => r.repo)].some((s) => s.toLowerCase().includes(q))),
      ),
    [index, minRank, q],
  );
  const repos = useMemo(
    () =>
      index.repos.filter(
        (r) =>
          (!q || r.repo.toLowerCase().includes(q)) && (!ui.onlyFlagged || r.gaps.length > 0 || r.overdue > 0),
      ),
    [index, q, ui.onlyFlagged],
  );
  const plan = baselinePlan(index.repos);
  const open = SEVERITIES.reduce((n, s) => n + index.totals[s], 0);

  const chips: FilterChip[] = [];
  if (ui.minSeverity !== "unknown")
    chips.push({
      id: "sev",
      facet: t("facets.severity"),
      value: t("atLeast", { severity: t(`severity.${ui.minSeverity}`) }),
      onRemove: () => ui.set({ minSeverity: "unknown" }),
    });

  const exportCsv = async () => {
    const path = await save({
      defaultPath: "security-alerts.csv",
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    try {
      await unwrap(commands.exportTextFile(path, alertsCsv(groups)));
      toast({ kind: "success", title: t("exported") });
    } catch (e) {
      toastError(e);
    }
  };
  const toggleBaseline = (f: Feature, on: boolean) =>
    prefs.set({ baseline: on ? [...prefs.baseline, f] : prefs.baseline.filter((x) => x !== f) });

  return (
    <div className="relative flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={
          scan.data ? (
            <>
              <span className="num">{t("meta.repos", { count: scan.data.length })}</span>
              <span className="text-faint">·</span>
              <span className="num">{t("meta.open", { count: open })}</span>
              {index.totals.critical > 0 && (
                <>
                  <span className="text-faint">·</span>
                  <span className="num text-danger">
                    {t("meta.critical", { count: index.totals.critical })}
                  </span>
                </>
              )}
              {index.overdue > 0 && (
                <>
                  <span className="text-faint">·</span>
                  <span className="num text-warn">{t("meta.overdue", { count: index.overdue })}</span>
                </>
              )}
              {index.gaps > 0 && (
                <>
                  <span className="text-faint">·</span>
                  <span className="num text-warn">{t("meta.gaps", { count: index.gaps })}</span>
                </>
              )}
              <span className="text-faint">·</span>
              <span className="num">
                {t("meta.scanned", { when: formatRelative(new Date(scan.dataUpdatedAt).toISOString()) })}
              </span>
            </>
          ) : (
            <span>{t("subtitle")}</span>
          )
        }
        actions={
          <>
            <Popover
              placement="bottom-end"
              className="w-[320px] p-3"
              trigger={(p) => (
                <Button {...p} icon={ScanSearch}>
                  {t("scope.button", { count: scan.targets.length })}
                </Button>
              )}
            >
              <div className="space-y-2">
                <div className="annot">{t("scope.title")}</div>
                <p className="text-[11.5px] text-faint">{t("scope.hint")}</p>
                <Checkbox
                  checked={prefs.includeArchived}
                  onChange={(v) => prefs.set({ includeArchived: v })}
                  label={t("scope.archived")}
                />
                <Checkbox
                  checked={prefs.includeForks}
                  onChange={(v) => prefs.set({ includeForks: v })}
                  label={t("scope.forks")}
                />
                <div className="annot pt-2">{t("scope.sla")}</div>
                <Segmented<SlaPreset>
                  size="sm"
                  className="w-full"
                  value={prefs.sla}
                  onChange={(sla) => prefs.set({ sla })}
                  options={(["strict", "standard", "relaxed"] as const).map((v) => ({
                    value: v,
                    label: t(`sla.${v}`),
                  }))}
                />
                <p className="text-[11px] text-faint">{t(`sla.${prefs.sla}Hint`)}</p>
                <div className="annot pt-2">{t("scope.baseline")}</div>
                <p className="text-[11px] text-faint">{t("scope.baselineHint")}</p>
                {FEATURES.map((f) => (
                  <Checkbox
                    key={f}
                    checked={prefs.baseline.includes(f)}
                    onChange={(v) => toggleBaseline(f, v)}
                    label={t(`feature.${f}.name`)}
                  />
                ))}
              </div>
            </Popover>
            <Button icon={RefreshCw} loading={scan.isFetching} onClick={() => void rescanSecurity()}>
              {t("rescan")}
            </Button>
            <Button icon={Download} disabled={!groups.length} onClick={exportCsv}>
              {t("export")}
            </Button>
            <Button icon={CalendarSync} onClick={() => setDepOpen(true)}>
              {t("dependabot.open")}
            </Button>
            <Button icon={ToggleRight} onClick={() => ui.set({ features: {} })}>
              {t("switchFeatures")}
            </Button>
            <Button
              variant="primary"
              icon={ShieldCheck}
              disabled={!plan.length}
              title={plan.length ? undefined : t("baselineMet")}
              onClick={() =>
                useQueue
                  .getState()
                  .requestRun(
                    plan.map(({ repo, feature }) => ({
                      repo,
                      action: { kind: "security_feature", feature, enabled: true },
                    })),
                  )
              }
            >
              {t("applyBaseline", { count: index.gaps })}
            </Button>
          </>
        }
      />
      <FilterBar
        search={ui.search}
        onSearch={(search) => ui.set({ search })}
        placeholder={t("searchPlaceholder")}
        chips={chips}
        onReset={() => ui.set({ search: "", kind: "all", minSeverity: "unknown", onlyFlagged: false })}
        facets={(close) => (
          <div className="space-y-1 p-1">
            <div className="annot px-2 pb-1">{t("facets.severity")}</div>
            {(["critical", "high", "medium", "low"] as Severity[]).map((s) => (
              <button
                key={s}
                className="flex h-8 w-full cursor-default items-center gap-2 rounded-[3px] px-2 text-left text-[12.5px] hover:bg-surface-2"
                onClick={() => (ui.set({ minSeverity: s }), close())}
              >
                <SeverityMark s={s} />
                {t("atLeast", { severity: t(`severity.${s}`) })}
              </button>
            ))}
          </div>
        )}
        facetsWidth={220}
        right={
          <div className="flex items-center gap-3">
            {prefs.view !== "fixes" && (
              <Checkbox
                checked={ui.onlyFlagged}
                onChange={(onlyFlagged) => ui.set({ onlyFlagged })}
                label={t(`flagged.${prefs.view}`)}
              />
            )}
            {prefs.view === "alerts" && (
              <Segmented<AlertKind | "all">
                size="sm"
                value={ui.kind}
                onChange={(kind) => ui.set({ kind })}
                options={(["all", "dependency", "code", "secret"] as const).map((k) => ({
                  value: k,
                  label: t(k === "all" ? "kind.all" : `kind.${k}`),
                  icon: k === "all" ? undefined : KIND_ICON[k],
                }))}
              />
            )}
            <Segmented<SecurityView>
              value={prefs.view}
              onChange={(view) => prefs.set({ view })}
              options={[
                { value: "alerts", label: t("views.alerts"), icon: ShieldAlert },
                { value: "fixes", label: t("views.fixes"), icon: ArrowUpCircle },
                { value: "repos", label: t("views.repos"), icon: Rows3 },
              ]}
            />
          </div>
        }
      />
      {scan.data && open > 0 && prefs.view !== "repos" && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line bg-surface px-4 py-2">
          {(["critical", "high", "medium", "low"] as const).map((s) => (
            <button
              key={s}
              className="flex cursor-default items-center gap-1.5 text-[12px] text-dim hover:text-text"
              onClick={() => ui.set({ minSeverity: ui.minSeverity === s ? "unknown" : s })}
            >
              <SeverityMark s={s} />
              <span className="num text-[13px] text-text">{index.totals[s]}</span>
              {t(`severity.${s}`)}
            </button>
          ))}
          {index.overdue > 0 && (
            <button
              className="ml-auto flex cursor-default items-center gap-1.5 text-[12px] text-warn"
              onClick={() => ui.set({ onlyFlagged: !ui.onlyFlagged })}
            >
              <Mark glyph="hourglass" tone="warn" size={12} />
              {t("meta.overdue", { count: index.overdue })}
            </button>
          )}
        </div>
      )}
      {scan.isFetching && (
        <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
          <span className="annot shrink-0">{t("scanning")}</span>
          <Meter
            value={scan.progress ? (scan.progress.done / Math.max(1, scan.progress.total)) * 100 : 3}
            className="flex-1"
          />
          <span className="num text-[11px] text-faint">
            {scan.progress ? `${formatNumber(scan.progress.done)}/${formatNumber(scan.progress.total)}` : "…"}
          </span>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {scan.isError ? (
          <EmptyState
            title={errorMessage(scan.error)}
            action={<Button onClick={() => scan.refetch()}>{t("common:actions.retry")}</Button>}
          />
        ) : !scan.data ? (
          scan.targets.length === 0 ? (
            <EmptyState icon={<Boxes size={20} />} title={t("noTargets")} />
          ) : (
            <Plotter />
          )
        ) : prefs.view === "alerts" ? (
          <AlertGroupsList
            groups={groups}
            empty={
              open === 0 ? (
                <EmptyState
                  icon={<Mark glyph="tick" tone="ok" size={18} />}
                  title={t("empty.noAlerts")}
                  body={
                    index.gaps > 0 ? t("empty.noAlertsGaps", { count: index.gaps }) : t("empty.noAlertsBody")
                  }
                  action={
                    index.gaps > 0 ? (
                      <Button onClick={() => prefs.set({ view: "repos" })}>{t("empty.seeRepos")}</Button>
                    ) : undefined
                  }
                />
              ) : (
                <EmptyState title={t("empty.filtered")} />
              )
            }
          />
        ) : prefs.view === "fixes" ? (
          <FixesList
            plans={fixes}
            empty={
              <EmptyState
                icon={<Mark glyph="tick" tone="ok" size={18} />}
                title={t("fix.none")}
                body={t("fix.noneBody")}
              />
            }
          />
        ) : (
          <ReposList rows={repos} />
        )}
      </div>
      {depOpen && <DependabotDialog onClose={() => setDepOpen(false)} />}
    </div>
  );
}
