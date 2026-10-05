import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Boxes,
  Braces,
  ChevronDown,
  KeyRound,
  Layers,
  Plus,
  RefreshCw,
  Rows3,
  ScanSearch,
} from "lucide-react";
import { errorMessage } from "@/core/errors";
import { formatNumber, formatRelative } from "@/core/i18n/format";
import { sheets, useIntent } from "@/core/sheets/store";
import {
  Button,
  Checkbox,
  EmptyState,
  FilterBar,
  MenuItem,
  Meter,
  PageHeader,
  Plotter,
  Popover,
  Segmented,
  useNow,
} from "@/ui";
import { rescanSecrets, useSecretsIndex } from "./api";
import { EnvironmentsList, ReposList, SecretsList, VariablesList } from "./ListViews";
import { useSecretsPrefs, useSecretsUi, type SecretsView } from "./store";

export function SecretsPage() {
  const { t } = useTranslation(["secrets", "common"]);
  useNow();
  const { index, scan } = useSecretsIndex();
  const prefs = useSecretsPrefs();
  const ui = useSecretsUi();

  useIntent("secrets", (i) =>
    sheets.push("secrets", "repo", { repo: String(i.repo), title: String(i.repo).split("/")[1] }),
  );

  const q = ui.search.toLowerCase();
  const match = (name: string, repos: string[]) =>
    !q || name.toLowerCase().includes(q) || repos.some((r) => r.toLowerCase().includes(q));
  const lists = useMemo(
    () => ({
      secrets: index.secrets.filter(
        (g) =>
          match(
            g.name,
            g.places.map((p) => p.repo),
          ) &&
          (!ui.onlyFlagged || g.stale > 0),
      ),
      variables: index.variables.filter(
        (g) =>
          match(
            g.name,
            g.places.map((p) => p.repo),
          ) &&
          (!ui.onlyFlagged || g.values.length > 1),
      ),
      environments: index.environments.filter(
        (g) =>
          match(
            g.name,
            g.repos.map((r) => r.repo),
          ) &&
          (!ui.onlyFlagged || g.configs > 1),
      ),
      repos: index.repos.filter(
        (r) => match("", [r.repo]) && (!ui.onlyFlagged || r.secrets + r.variables + r.environments > 0),
      ),
    }),

    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, q, ui.onlyFlagged],
  );
  const stale = index.secrets.filter((g) => g.stale > 0).length;
  const drift =
    index.variables.filter((g) => g.values.length > 1).length +
    index.environments.filter((g) => g.configs > 1).length;

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
              <span className="num">{t("meta.secrets", { count: index.secrets.length })}</span>
              <span className="text-faint">·</span>
              <span className="num">{t("meta.variables", { count: index.variables.length })}</span>
              <span className="text-faint">·</span>
              <span className="num">{t("meta.environments", { count: index.environments.length })}</span>
              {stale > 0 && (
                <>
                  <span className="text-faint">·</span>
                  <span className="num text-warn">{t("meta.stale", { count: stale })}</span>
                </>
              )}
              {drift > 0 && (
                <>
                  <span className="text-faint">·</span>
                  <span className="num text-warn">{t("meta.drift", { count: drift })}</span>
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
              className="w-[280px] p-3"
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
                <div className="annot pt-1">{t("scope.staleDays")}</div>
                <Segmented
                  size="sm"
                  className="w-full"
                  value={String(prefs.staleDays)}
                  onChange={(v) => prefs.set({ staleDays: Number(v) })}
                  options={["90", "180", "365"].map((v) => ({
                    value: v,
                    label: t("days", { count: Number(v) }),
                  }))}
                />
              </div>
            </Popover>
            <Button icon={RefreshCw} loading={scan.isFetching} onClick={() => void rescanSecrets()}>
              {t("rescan")}
            </Button>
            <Popover
              placement="bottom-end"
              trigger={(p) => (
                <Button {...p} variant="primary" icon={Plus} trailing={<ChevronDown size={13} />}>
                  {t("new")}
                </Button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem icon={KeyRound} onClick={() => (close(), ui.set({ value: { kind: "secret" } }))}>
                    {t("newSecret")}
                  </MenuItem>
                  <MenuItem icon={Braces} onClick={() => (close(), ui.set({ value: { kind: "variable" } }))}>
                    {t("newVariable")}
                  </MenuItem>
                  <MenuItem icon={Layers} onClick={() => (close(), ui.set({ env: {} }))}>
                    {t("newEnv")}
                  </MenuItem>
                </>
              )}
            </Popover>
          </>
        }
      />
      <FilterBar
        search={ui.search}
        onSearch={(search) => ui.set({ search })}
        placeholder={t("searchPlaceholder")}
        chips={[]}
        onReset={() => ui.set({ search: "", onlyFlagged: false })}
        right={
          <div className="flex items-center gap-3">
            <Checkbox
              checked={ui.onlyFlagged}
              onChange={(onlyFlagged) => ui.set({ onlyFlagged })}
              label={t(`flagged.${prefs.view}`)}
            />
            <Segmented<SecretsView>
              value={prefs.view}
              onChange={(view) => prefs.set({ view })}
              options={[
                { value: "secrets", label: t("views.secrets"), icon: KeyRound },
                { value: "variables", label: t("views.variables"), icon: Braces },
                { value: "environments", label: t("views.environments"), icon: Layers },
                { value: "repos", label: t("views.repos"), icon: Rows3 },
              ]}
            />
          </div>
        }
      />
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
        ) : prefs.view === "secrets" ? (
          <SecretsList groups={lists.secrets} />
        ) : prefs.view === "variables" ? (
          <VariablesList groups={lists.variables} />
        ) : prefs.view === "environments" ? (
          <EnvironmentsList groups={lists.environments} />
        ) : (
          <ReposList rows={lists.repos} />
        )}
      </div>
    </div>
  );
}
