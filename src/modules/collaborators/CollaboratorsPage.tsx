import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { Download, Grid3x3, RefreshCw, Rows3, ScanSearch, UserPlus, Users } from "lucide-react";
import { commands, unwrap } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { formatNumber, formatRelative } from "@/core/i18n/format";
import { toast } from "@/core/store/toasts";
import { sheets, useIntent } from "@/core/sheets/store";
import { Button, Checkbox, EmptyState, FacetColumn, FacetGrid, FilterBar, Meter, PageHeader, Plotter, Popover, Section, Segmented, Select, useNow, type FilterChip } from "@/ui";
import { accessCsv, ROLES } from "./model";
import { rescanAccess, useAccessIndex, useFilteredPeople } from "./api";
import { GrantDialog } from "./GrantDialog";
import { MatrixView } from "./MatrixView";
import { PeopleView } from "./PeopleView";
import { ReposView } from "./ReposView";
import { DEFAULT_ACCESS_FILTER, useAccessPrefs, useAccessUi } from "./store";
import type { Role } from "@/core/ipc";

export function CollaboratorsPage() {
  const { t } = useTranslation(["collaborators", "common"]);
  const { index, scan } = useAccessIndex();
  useNow();
  const view = useAccessPrefs((s) => s.view);
  const prefs = useAccessPrefs();
  const ui = useAccessUi();
  const people = useFilteredPeople(index.people);

  useIntent("collaborators", (i) => sheets.push("collaborators", "repo", { repo: String(i.repo), title: String(i.repo).split("/")[1] }));
  const pending = useMemo(() => index.people.reduce((a, p) => a + p.pending, 0), [index.people]);

  const chips: FilterChip[] = [];
  if (ui.filter.minRole) chips.push({ id: "role", facet: t("facets.minRole"), value: t(`roles.${ui.filter.minRole}`), onRemove: () => ui.setFilter({ minRole: null }) });
  if (ui.filter.kind !== "any") chips.push({ id: "kind", facet: t("facets.kind"), value: t(`kinds.${ui.filter.kind}`), onRemove: () => ui.setFilter({ kind: "any" }) });
  if (ui.filter.pendingOnly) chips.push({ id: "pending", facet: t("facets.status"), value: t("invited"), onRemove: () => ui.setFilter({ pendingOnly: false }) });

  const exportCsv = async () => {
    const path = await save({ defaultPath: "repository-access.csv", filters: [{ name: "CSV", extensions: ["csv"] }] });
    if (!path) return;
    try {
      await unwrap(commands.exportTextFile(path, accessCsv(index)));
      toast({ kind: "success", title: t("exported") });
    } catch (e) {
      toastError(e);
    }
  };

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
              <span className="num">{t("meta.people", { count: index.people.length })}</span>
              {pending > 0 && (
                <>
                  <span className="text-faint">·</span>
                  <span className="num text-warn">{t("meta.pending", { count: pending })}</span>
                </>
              )}
              <span className="text-faint">·</span>
              <span className="num">{t("meta.scanned", { when: formatRelative(new Date(scan.dataUpdatedAt).toISOString()) })}</span>
            </>
          ) : (
            <span>{t("subtitle")}</span>
          )
        }
        actions={
          <>
            <Popover
              placement="bottom-end"
              className="w-[260px] p-3"
              trigger={(p) => (
                <Button {...p} icon={ScanSearch}>
                  {t("scope.button", { count: scan.targets.length })}
                </Button>
              )}
            >
              <div className="space-y-2">
                <div className="annot">{t("scope.title")}</div>
                <p className="text-[11.5px] text-faint">{t("scope.hint")}</p>
                <Checkbox checked={prefs.includeArchived} onChange={(v) => prefs.set({ includeArchived: v })} label={t("scope.archived")} />
                <Checkbox checked={prefs.includeForks} onChange={(v) => prefs.set({ includeForks: v })} label={t("scope.forks")} />
              </div>
            </Popover>
            <Button icon={RefreshCw} loading={scan.isFetching} onClick={() => void rescanAccess()}>
              {t("rescan")}
            </Button>
            <Button icon={Download} disabled={!scan.data} onClick={exportCsv}>
              CSV
            </Button>
            <Button variant="primary" icon={UserPlus} onClick={() => ui.set({ grant: { users: [], repos: [], mode: "add" } })}>
              {t("grant.button")}
            </Button>
          </>
        }
      />
      <FilterBar
        search={ui.filter.search}
        onSearch={(search) => ui.setFilter({ search })}
        placeholder={t("searchPlaceholder")}
        chips={chips}
        onReset={() => ui.setFilter(DEFAULT_ACCESS_FILTER)}
        facetsWidth={520}
        facets={
          <FacetGrid>
            <FacetColumn>
              <Section title={t("facets.minRole")}>
                <Select value={ui.filter.minRole ?? ""} onChange={(e) => ui.setFilter({ minRole: (e.target.value || null) as Role | null })} className="h-7 text-[12px]">
                  <option value="">{t("facets.anyRole")}</option>
                  {[...ROLES].reverse().map((r) => (
                    <option key={r} value={r}>
                      {t("facets.atLeast", { role: t(`roles.${r}`) })}
                    </option>
                  ))}
                </Select>
              </Section>
            </FacetColumn>
            <FacetColumn>
              <Section title={t("facets.kind")}>
                <Segmented
                  size="sm"
                  className="w-full"
                  value={ui.filter.kind}
                  onChange={(kind) => ui.setFilter({ kind })}
                  options={(["any", "users", "bots"] as const).map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
                />
              </Section>
              <Section title={t("facets.status")}>
                <Checkbox checked={ui.filter.pendingOnly} onChange={(pendingOnly) => ui.setFilter({ pendingOnly })} label={t("facets.pendingOnly")} />
              </Section>
            </FacetColumn>
            <span />
          </FacetGrid>
        }
        right={
          <Segmented
            value={view}
            onChange={(v) => prefs.set({ view: v })}
            options={[
              { value: "people", label: t("views.people"), icon: Users },
              { value: "repos", label: t("views.repos"), icon: Rows3 },
              { value: "matrix", label: t("views.matrix"), icon: Grid3x3 },
            ]}
          />
        }
      />
      {scan.isFetching && (
        <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
          <span className="annot shrink-0">{t("scanning")}</span>
          <Meter value={scan.progress ? (scan.progress.done / Math.max(1, scan.progress.total)) * 100 : 3} className="flex-1" />
          <span className="num text-[11px] text-faint">{scan.progress ? `${formatNumber(scan.progress.done)}/${formatNumber(scan.progress.total)}` : "…"}</span>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {scan.isError ? (
          <EmptyState title={errorMessage(scan.error)} action={<Button onClick={() => scan.refetch()}>{t("common:actions.retry")}</Button>} />
        ) : !scan.data ? (
          scan.targets.length === 0 ? <EmptyState icon={<Users size={20} />} title={t("noTargets")} /> : <Plotter />
        ) : view === "people" ? (
          <PeopleView people={people} />
        ) : view === "repos" ? (
          <ReposView repos={index.repos} />
        ) : (
          <MatrixView people={people} />
        )}
      </div>
      <GrantDialog />
    </div>
  );
}
