import { useState } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { Activity, Download, Fingerprint, Plus, RefreshCw, Rows3, ScanSearch, Webhook } from "lucide-react";
import { commands, unwrap } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { formatNumber, formatRelative } from "@/core/i18n/format";
import { toast } from "@/core/store/toasts";
import { sheets, useIntent } from "@/core/sheets/store";
import {
  Button,
  Checkbox,
  EmptyState,
  FacetColumn,
  FacetGrid,
  FilterBar,
  Meter,
  PageHeader,
  Plotter,
  Popover,
  Section,
  Segmented,
  Select,
  useNow,
  type FilterChip,
} from "@/ui";
import { rescanHooks, useFilteredEndpoints, useHookHealth, useHookIndex } from "./api";
import { EndpointsView } from "./EndpointsView";
import { ALL_EVENTS } from "./events";
import { StateMark } from "./HookMarks";
import { HOOK_STATES, hooksCsv } from "./model";
import { ReposView } from "./ReposView";
import { SignatureDialog } from "./SignatureDialog";
import { DEFAULT_HOOKS_FILTER, useHooksPrefs, useHooksUi } from "./store";

export function WebhooksPage() {
  const { t } = useTranslation(["webhooks", "common"]);
  useNow();
  const [sigOpen, setSigOpen] = useState(false);
  const { index, scan } = useHookIndex();
  const health = useHookHealth(index);
  const prefs = useHooksPrefs();
  const ui = useHooksUi();
  const endpoints = useFilteredEndpoints(index.endpoints);
  const failing = index.endpoints.reduce((a, e) => a + e.states.failing, 0);

  useIntent("webhooks", (i) =>
    sheets.push("webhooks", "repo", { repo: String(i.repo), title: String(i.repo).split("/")[1] }),
  );

  const chips: FilterChip[] = [];
  if (ui.filter.state)
    chips.push({
      id: "state",
      facet: t("facets.state"),
      value: t(`states.${ui.filter.state}`),
      onRemove: () => ui.setFilter({ state: null }),
    });
  if (ui.filter.event)
    chips.push({
      id: "event",
      facet: t("facets.event"),
      value: ui.filter.event,
      onRemove: () => ui.setFilter({ event: null }),
    });

  const exportCsv = async () => {
    const path = await save({ defaultPath: "webhooks.csv", filters: [{ name: "CSV", extensions: ["csv"] }] });
    if (!path) return;
    try {
      await unwrap(commands.exportTextFile(path, hooksCsv(index)));
      toast({ kind: "success", title: t("exported") });
    } catch (e) {
      toastError(e);
    }
  };

  const busy = scan.isFetching
    ? { label: t("scanning"), p: scan.progress }
    : health.isFetching
      ? { label: t("health.running"), p: health.progress }
      : null;

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
              <span className="num">{t("meta.hooks", { count: index.total })}</span>
              <span className="text-faint">·</span>
              <span className="num">{t("meta.endpoints", { count: index.endpoints.length })}</span>
              {failing > 0 && (
                <>
                  <span className="text-faint">·</span>
                  <span className="num text-danger">{t("meta.failing", { count: failing })}</span>
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
              </div>
            </Popover>
            <Button icon={RefreshCw} loading={scan.isFetching} onClick={() => void rescanHooks()}>
              {t("rescan")}
            </Button>
            <Popover
              placement="bottom-end"
              className="w-[280px] p-3"
              trigger={(p) => (
                <Button {...p} icon={Activity} loading={health.isFetching} disabled={index.total === 0}>
                  {t("health.button")}
                </Button>
              )}
            >
              {(close) => (
                <div className="space-y-2.5">
                  <p className="text-[11.5px] text-faint">{t("health.hint")}</p>
                  <div>
                    <div className="annot mb-1">{t("health.depth")}</div>
                    <Segmented
                      size="sm"
                      className="w-full"
                      value={String(prefs.healthDepth)}
                      onChange={(v) => prefs.set({ healthDepth: Number(v) })}
                      options={["10", "25", "50", "100"].map((v) => ({ value: v, label: v }))}
                    />
                  </div>
                  <Button
                    variant="primary"
                    icon={Activity}
                    className="w-full"
                    onClick={() => {
                      close();
                      void health.run();
                    }}
                  >
                    {t("health.run", { count: health.targets })}
                  </Button>
                </div>
              )}
            </Popover>
            <Button icon={Fingerprint} onClick={() => setSigOpen(true)}>
              {t("sig.open")}
            </Button>
            <Button icon={Download} disabled={!scan.data} onClick={exportCsv}>
              CSV
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => ui.set({ create: { repos: [] } })}>
              {t("new")}
            </Button>
          </>
        }
      />
      <FilterBar
        search={ui.filter.search}
        onSearch={(search) => ui.setFilter({ search })}
        placeholder={t("searchPlaceholder")}
        chips={chips}
        onReset={() => ui.setFilter(DEFAULT_HOOKS_FILTER)}
        facetsWidth={480}
        facets={
          <FacetGrid>
            <FacetColumn>
              <Section title={t("facets.state")}>
                <div className="space-y-1">
                  {HOOK_STATES.map((s) => (
                    <Checkbox
                      key={s}
                      checked={ui.filter.state === s}
                      onChange={(on) => ui.setFilter({ state: on ? s : null })}
                      label={
                        <span className="flex items-center gap-1.5">
                          <StateMark state={s} /> {t(`states.${s}`)}
                        </span>
                      }
                    />
                  ))}
                </div>
              </Section>
            </FacetColumn>
            <FacetColumn>
              <Section title={t("facets.event")}>
                <Select
                  value={ui.filter.event ?? ""}
                  onChange={(e) => ui.setFilter({ event: e.target.value || null })}
                  className="num h-7 text-[12px]"
                >
                  <option value="">{t("facets.anyEvent")}</option>
                  {[...ALL_EVENTS].sort().map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </Select>
              </Section>
            </FacetColumn>
            <span />
          </FacetGrid>
        }
        right={
          <Segmented
            value={prefs.view}
            onChange={(view) => prefs.set({ view })}
            options={[
              { value: "endpoints", label: t("views.endpoints"), icon: Webhook },
              { value: "repos", label: t("views.repos"), icon: Rows3 },
            ]}
          />
        }
      />
      {busy && (
        <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
          <span className="annot shrink-0">{busy.label}</span>
          <Meter value={busy.p ? (busy.p.done / Math.max(1, busy.p.total)) * 100 : 3} className="flex-1" />
          <span className="num text-[11px] text-faint">
            {busy.p ? `${formatNumber(busy.p.done)}/${formatNumber(busy.p.total)}` : "…"}
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
            <EmptyState icon={<Webhook size={20} />} title={t("noTargets")} />
          ) : (
            <Plotter />
          )
        ) : prefs.view === "endpoints" ? (
          <EndpointsView endpoints={endpoints} health={health.map} />
        ) : (
          <ReposView repos={index.repos} />
        )}
      </div>
      {sigOpen && <SignatureDialog onClose={() => setSigOpen(false)} />}
    </div>
  );
}
