import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowUpCircle,
  Boxes,
  ChevronDown,
  ChevronRight,
  CloudDownload,
  ExternalLink,
  FilePen,
  GitCompareArrows,
  Layers,
  PackageSearch,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import type { RepoDeps } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { formatNumber } from "@/core/i18n/format";
import { getModule } from "@/core/modules/registry";
import { sheets } from "@/core/sheets/store";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  IconButton,
  Input,
  Mark,
  PageHeader,
  Plotter,
  Segmented,
  Select,
  TabBar,
} from "@/ui";
import { BumpDialog } from "./BumpDialog";
import { canBump } from "./bump";
import { checkLatest, useLatest, useProgress, useScan, useTargets } from "./api";
import {
  aggregate,
  conflicts,
  freshness,
  isBehind,
  keyOf,
  lookups,
  sortTools,
  type Freshness,
  type Package,
  type Use,
} from "./model";
import { FRESH_LOOK, useDepsUi, type DepsView } from "./store";

const DAYS = [30, 90, 365, 0];


export function DepsPage() {
  const { t } = useTranslation(["deps", "common"]);
  const ui = useDepsUi();
  const targets = useTargets(ui.days, ui.forks);
  const [go, setGo] = useState(ui.started);
  const scan = useScan(targets, go);
  const latest = useLatest().data;
  const progress = useProgress();
  const [checking, setChecking] = useState(false);
  const [rescanning, setRescanning] = useState(false);

  const packages = useMemo(
    () => aggregate(scan.data ?? [], latest ?? new Map(), ui.dev),
    [scan.data, latest, ui.dev],
  );
  const checked = !!latest && latest.size > 0;
  const check = async () => {
    setChecking(true);
    try {
      await checkLatest(lookups(packages));
      ui.set({ autoLatest: true });
    } catch (e) {
      toastError(e);
    } finally {
      setChecking(false);
    }
  };

  const missing = useMemo(
    () => lookups(packages).filter((l) => !latest?.has(keyOf(l.ecosystem, l.name))),
    [packages, latest],
  );
  useEffect(() => {
    if (ui.autoLatest && scan.data && missing.length && !checking) {

      setChecking(true);
      void checkLatest(missing)
        .catch(() => undefined)
        .finally(() => setChecking(false));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.autoLatest, scan.data]);

  const start = () => (setGo(true), ui.set({ started: true }));
  const rescan = async () => {
    setRescanning(true);
    try {
      await scan.rescan();
    } catch (e) {
      toastError(e);
    } finally {
      setRescanning(false);
    }
  };

  const tools = sortTools([...new Set(packages.flatMap((p) => p.tools))]);

  const eco = tools.includes(ui.ecosystem) ? ui.ecosystem : "all";
  const needle = ui.q.trim().toLowerCase();
  const visible = packages.filter(
    (p) =>
      (eco === "all" || p.tools.includes(eco)) &&
      (!needle ||
        p.name.toLowerCase().includes(needle) ||
        p.uses.some((u) => u.repo.toLowerCase().includes(needle))),
  );
  const outdated = visible.filter((p) => isBehind(p.worst));
  const clashing = conflicts(visible);
  const withManifests = (scan.data ?? []).filter((r) => r.manifests.length > 0);
  const byLevel = (f: Freshness) => packages.filter((p) => p.worst === f).length;
  const busy = scan.isFetching || rescanning;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={<span>{t("subtitle")}</span>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(ui.days)}
              onChange={(e) => ui.set({ days: Number(e.target.value) })}
              className="!w-[230px]"
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d ? t("scope.days", { count: d }) : t("scope.all")}
                </option>
              ))}
            </Select>
            <Checkbox
              checked={ui.forks}
              onChange={(forks) => ui.set({ forks })}
              label={<span className="text-[12px]">{t("scope.forks")}</span>}
            />
            {go && (
              <>
                <IconButton
                  icon={RefreshCw}
                  label={t("rescan")}
                  disabled={busy}
                  onClick={() => void rescan()}
                />
                <Button
                  variant={checked ? "secondary" : "primary"}
                  icon={CloudDownload}
                  loading={checking}
                  disabled={!packages.length || busy}
                  onClick={() => void check()}
                  title={t("latest.privacy")}
                >
                  {checked ? t("latest.again") : t("latest.check")}
                </Button>
              </>
            )}
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!go ? (
          <EmptyState
            icon={<PackageSearch size={20} />}
            title={t("start.title")}
            body={t("start.body")}
            action={
              <Button variant="primary" icon={Boxes} disabled={!targets.length} onClick={start}>
                {t("start.button", { count: targets.length })}
              </Button>
            }
          />
        ) : scan.isLoading || (busy && !scan.data) ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <Plotter />
            {progress?.phase === "scan" && (
              <span className="num text-[11.5px] text-faint">
                {t("scanning", { done: progress.done, total: progress.total })}
              </span>
            )}
          </div>
        ) : scan.error ? (
          <EmptyState title={errorMessage(scan.error)} />
        ) : (
          <div className="mx-auto max-w-[1180px] space-y-4 p-4">
            <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
              <Kpi
                label={t("kpi.repos")}
                value={formatNumber(withManifests.length)}
                sub={t("kpi.ofScanned", { count: scan.data?.length ?? 0 })}
              />
              <Kpi label={t("kpi.packages")} value={formatNumber(packages.length)} />
              {checked ? (
                <>
                  <Kpi
                    label={t("kpi.major")}
                    value={formatNumber(byLevel("major"))}
                    tone={byLevel("major") ? "danger" : undefined}
                  />
                  <Kpi
                    label={t("kpi.minor")}
                    value={formatNumber(byLevel("minor"))}
                    tone={byLevel("minor") ? "warn" : undefined}
                  />
                  <Kpi label={t("kpi.patch")} value={formatNumber(byLevel("patch"))} />
                </>
              ) : (
                <div className="max-w-[300px] text-[11.5px] text-faint">
                  {checking && progress?.phase === "latest"
                    ? t("latest.progress", { done: progress.done, total: progress.total })
                    : t("latest.hint")}
                </div>
              )}
              <Kpi
                label={t("kpi.conflicts")}
                value={formatNumber(conflicts(packages).length)}
                tone={conflicts(packages).length ? "warn" : undefined}
              />
              <span className="ml-auto flex flex-wrap gap-1.5">
                {tools.map((tool) => (
                  <Badge key={tool} tone="idle">
                    {t(`tool.${tool as "npm"}`, { defaultValue: tool })} ·{" "}
                    {packages.filter((p) => p.tools.includes(tool)).length}
                  </Badge>
                ))}
              </span>
            </div>

            <TabBar<DepsView>
              value={ui.view}
              onChange={(view) => ui.set({ view, open: null })}
              tabs={[
                { id: "packages", label: t("views.packages"), count: visible.length },
                { id: "outdated", label: t("views.outdated"), count: checked ? outdated.length : undefined },
                { id: "conflicts", label: t("views.conflicts"), count: clashing.length },
                { id: "repos", label: t("views.repos"), count: withManifests.length },
              ]}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<string>
                size="sm"
                value={eco}
                onChange={(ecosystem) => ui.set({ ecosystem })}
                options={[
                  { value: "all", label: t("tool.all") },
                  ...tools.map((tool) => ({
                    value: tool,
                    label: t(`tool.${tool as "npm"}`, { defaultValue: tool }),
                  })),
                ]}
              />
              <div className="w-[260px]">
                <Input
                  icon={Search}
                  value={ui.q}
                  onChange={(e) => ui.set({ q: e.target.value })}
                  placeholder={t("find")}
                  className="!h-7 text-[12px]"
                />
              </div>
              <Checkbox
                checked={ui.dev}
                onChange={(dev) => ui.set({ dev })}
                label={<span className="text-[12px]">{t("dev")}</span>}
              />
            </div>

            {ui.view === "repos" ? (
              <Repos
                data={withManifests.filter((r) => !needle || r.repo.toLowerCase().includes(needle))}
                packages={packages}
              />
            ) : ui.view === "outdated" && !checked ? (
              <EmptyState
                icon={<CloudDownload size={20} />}
                title={t("latest.needed")}
                body={t("latest.privacy")}
                action={
                  <Button
                    variant="primary"
                    icon={CloudDownload}
                    loading={checking}
                    onClick={() => void check()}
                  >
                    {t("latest.check")}
                  </Button>
                }
              />
            ) : (
              <PackageList
                list={
                  ui.view === "outdated"
                    ? [...outdated].sort(
                        (a, b) => rank(a.worst) - rank(b.worst) || b.uses.length - a.uses.length,
                      )
                    : ui.view === "conflicts"
                      ? clashing
                      : visible
                }
                checked={checked}
              />
            )}
            {(scan.data ?? []).some((r) => r.error || r.truncated) && <Problems data={scan.data ?? []} />}
          </div>
        )}
      </div>
    </div>
  );
}

const rank = (f: Freshness) => ["major", "minor", "patch"].indexOf(f);

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger" | "warn";
}) {
  return (
    <div>
      <div className="annot !text-[9.5px]">{label}</div>
      <div
        className={cn("num text-[17px]", tone === "danger" && "text-danger", tone === "warn" && "text-warn")}
      >
        {value}
        {sub && <span className="ml-1.5 text-[11px] text-faint">{sub}</span>}
      </div>
    </div>
  );
}

function FreshMark({ f, size = 11 }: { f: Freshness; size?: number }) {
  const { t } = useTranslation("deps");
  const l = FRESH_LOOK[f];
  return (
    <Mark
      glyph={l.glyph}
      tone={l.tone}
      size={size}
      title={`${t(`fresh.${f}.name`)} — ${t(`fresh.${f}.what`)}`}
    />
  );
}

function PackageList({ list, checked }: { list: Package[]; checked: boolean }) {
  const { t } = useTranslation("deps");
  const ui = useDepsUi();
  const [limit, setLimit] = useState(200);
  if (!list.length) return <div className="px-3 py-8 text-center text-[12.5px] text-faint">{t("none")}</div>;
  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-line bg-surface">
      <div className="annot grid grid-cols-[18px_minmax(0,1.4fr)_70px_minmax(0,1fr)_120px] gap-3 border-b border-line px-3 py-2 !text-[9.5px]">
        <span />
        <span>{t("col.package")}</span>
        <span className="text-right">{t("col.repos")}</span>
        <span>{t("col.declared")}</span>
        <span>{t("col.latest")}</span>
      </div>
      {list.slice(0, limit).map((p) => (
        <PackageRow
          key={p.key}
          p={p}
          checked={checked}
          open={ui.open === p.key}
          onToggle={() => ui.set({ open: ui.open === p.key ? null : p.key })}
        />
      ))}
      {list.length > limit && (
        <button
          className="w-full cursor-default border-t border-line px-3 py-2 text-[12px] text-accent hover:bg-surface-2"
          onClick={() => setLimit(limit + 300)}
        >
          {t("more", { count: list.length - limit })}
        </button>
      )}
    </div>
  );
}

function PackageRow({
  p,
  checked,
  open,
  onToggle,
}: {
  p: Package;
  checked: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("deps");
  const [bumping, setBumping] = useState(false);
  const repos = new Set(p.uses.map((u) => u.repo)).size;
  const specs = [...new Set(p.uses.map((u) => u.spec || "*"))];
  return (
    <div className="border-b border-line last:border-b-0">
      <button
        className={cn(
          "grid w-full cursor-default grid-cols-[18px_minmax(0,1.4fr)_70px_minmax(0,1fr)_120px] items-center gap-3 px-3 py-2 text-left hover:bg-surface-2",
          open && "bg-surface-2",
        )}
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown size={13} className="text-faint" />
        ) : (
          <ChevronRight size={13} className="text-faint" />
        )}
        <span className="flex min-w-0 items-center gap-2">
          <span className="num truncate text-[12.5px]" title={p.name}>
            {p.name}
          </span>
          <span
            className="num shrink-0 text-[10px] text-faint uppercase"
            title={t("registryOf", { registry: t(`eco.${p.ecosystem as "npm"}`) })}
          >
            {sortTools(p.tools).join(" · ")}
          </span>
          {p.versions.length > 1 && (
            <span title={t("conflictHint", { list: p.versions.join(" · ") })}>
              <TriangleAlert size={11} className="text-warn" />
            </span>
          )}
        </span>
        <span className="num text-right text-[12px] text-dim">{repos}</span>
        <span className="num truncate text-[11.5px] text-dim" title={specs.join("  ")}>
          {specs.slice(0, 4).join("  ")}
          {specs.length > 4 && ` +${specs.length - 4}`}
        </span>
        <span className="flex items-center gap-1.5">
          {checked && <FreshMark f={p.worst} />}
          <span
            className={cn("num truncate text-[11.5px]", p.latestError ? "text-faint" : "text-text")}
            title={
              p.latestError
                ? t(`latest.error.${p.latestError === "not_found" ? "notFound" : "failed"}`)
                : undefined
            }
          >
            {p.latest ?? (checked ? "—" : "")}
          </span>
        </span>
      </button>
      {open && (
        <div className="border-t border-line bg-bg px-3 py-1.5">
          {p.uses.map((u, i) => (
            <UseRow key={i} u={u} p={p} checked={checked} />
          ))}
          <div className="flex items-center gap-3 py-1.5">
            <button
              className="cursor-default text-[11.5px] text-accent hover:underline"
              onClick={() => void openUrl(registryPage(p.ecosystem, p.name))}
            >
              {t("registryPage", { registry: t(`eco.${p.ecosystem as "npm"}`) })}
            </button>
            {p.uses.some((u) => canBump(p.ecosystem, u.path)) && (
              <Button
                size="sm"
                variant="secondary"
                icon={ArrowUpCircle}
                className="ml-auto"
                onClick={() => setBumping(true)}
              >
                {p.latest ? t("bump.open", { version: p.latest }) : t("bump.openNoLatest")}
              </Button>
            )}
          </div>
          {bumping && <BumpDialog pkg={p} onClose={() => setBumping(false)} onDone={() => undefined} />}
        </div>
      )}
    </div>
  );
}

function UseRow({ u, p, checked }: { u: Use; p: Package; checked: boolean }) {
  const { t } = useTranslation("deps");
  const f = freshness(u.spec, p.ecosystem, p.latest);
  return (
    <div className="group grid grid-cols-[14px_minmax(0,1.2fr)_minmax(0,1fr)_100px_70px_auto] items-center gap-3 py-1 text-[12px]">
      {checked ? <FreshMark f={f} size={9} /> : <span />}
      <span className="num truncate" title={u.repo}>
        {u.repo}
      </span>
      <span className="num truncate text-faint" title={u.path}>
        {u.path}
        <span className="text-dim"> · </span>
        <ToolTag tool={u.manager} from={u.managerFrom} />
      </span>
      <span className="num truncate text-dim">{u.spec || "*"}</span>
      <span className="text-[11px] text-faint">
        {t(`kind.${u.kind as "normal"}`, { defaultValue: u.kind })}
      </span>
      <span className="flex opacity-50 group-hover:opacity-100">
        {getModule("files") && (
          <IconButton
            icon={FilePen}
            label={t("openManifest")}
            size={12}
            className="size-6"
            onClick={() => sheets.openWith("files", { repo: u.repo, branch: u.branch, path: u.path })}
          />
        )}
        <IconButton
          icon={ExternalLink}
          label={t("openOnGitHub")}
          size={12}
          className="size-6"
          onClick={() =>
            void openUrl(`https://github.com/${u.repo}/blob/${encodeURIComponent(u.branch)}/${u.path}`)
          }
        />
      </span>
    </div>
  );
}


function ToolTag({ tool, from }: { tool: string; from: string }) {
  const { t } = useTranslation("deps");
  const why =
    from === "declared" ? t("toolDeclared") : from === "lockfile" ? t("toolLockfile") : t("toolGuess");
  return (
    <span className={from === "default" ? "text-faint" : "text-dim"} title={why}>
      {t(`tool.${tool as "npm"}`, { defaultValue: tool })}
      {from === "default" && "?"}
    </span>
  );
}

function registryPage(ecosystem: string, name: string) {
  switch (ecosystem) {
    case "npm":
      return `https://www.npmjs.com/package/${name}`;
    case "cargo":
      return `https://crates.io/crates/${name}`;
    case "pypi":
      return `https://pypi.org/project/${name}/`;
    case "go":
      return `https://pkg.go.dev/${name}`;
    default: {
      const [g, a] = name.split(":");
      return `https://central.sonatype.com/artifact/${g}/${a}`;
    }
  }
}


function Repos({ data, packages }: { data: RepoDeps[]; packages: Package[] }) {
  const { t } = useTranslation("deps");
  const ui = useDepsUi();
  const byKey = useMemo(() => new Map(packages.map((p) => [p.key, p])), [packages]);
  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-line bg-surface">
      {data.map((r) => (
        <div key={r.repo} className="border-b border-line last:border-b-0">
          <button
            className="flex w-full cursor-default items-center gap-3 px-3 py-2 text-left hover:bg-surface-2"
            onClick={() => ui.set({ open: ui.open === r.repo ? null : r.repo })}
          >
            {ui.open === r.repo ? (
              <ChevronDown size={13} className="text-faint" />
            ) : (
              <ChevronRight size={13} className="text-faint" />
            )}
            <span className="num min-w-0 flex-1 truncate text-[12.5px]">{r.repo}</span>
            <span className="flex flex-wrap gap-1">
              {sortTools([...new Set(r.manifests.map((m) => m.manager))]).map((tool) => (
                <span key={tool} className="num text-[10px] text-faint uppercase">
                  {tool}
                </span>
              ))}
            </span>
            <span className="num w-[150px] text-right text-[11.5px] text-dim">
              {t("repoCounts", {
                manifests: r.manifests.length,
                deps: r.manifests.reduce((n, m) => n + m.deps.length, 0),
              })}
            </span>
          </button>
          {ui.open === r.repo && (
            <div className="border-t border-line bg-bg px-3 py-2">
              {r.manifests.map((m) => (
                <div key={m.path} className="mb-2">
                  <div className="flex items-center gap-2 text-[12px]">
                    <Layers size={12} className="text-faint" />
                    <span className="num">{m.path}</span>
                    <span className="text-[11px]">
                      <ToolTag tool={m.manager} from={m.manager_from} />
                    </span>
                    {m.error && (
                      <span className="text-[11px] text-warn">{t("parseError", { error: m.error })}</span>
                    )}
                    {getModule("files") && (
                      <IconButton
                        icon={FilePen}
                        label={t("openManifest")}
                        size={12}
                        className="size-6"
                        onClick={() =>
                          sheets.openWith("files", { repo: r.repo, branch: r.branch, path: m.path })
                        }
                      />
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 pl-5">
                    {m.deps.map((d, i) => {
                      const p = byKey.get(keyOf(m.ecosystem, d.name));
                      const f = p ? freshness(d.spec, m.ecosystem, p.latest) : "unknown";
                      return (
                        <span
                          key={i}
                          className={cn(
                            "num inline-flex items-center gap-1 rounded-[3px] border border-line px-1.5 py-0.5 text-[11px]",
                            d.kind === "dev" && "text-faint",
                          )}
                          title={`${d.name} ${d.spec} · ${t(`kind.${d.kind as "normal"}`, { defaultValue: d.kind })}`}
                        >
                          {p?.latest && <FreshMark f={f} size={8} />}
                          {d.name}
                          <span className="text-faint">{d.spec}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Problems({ data }: { data: RepoDeps[] }) {
  const { t } = useTranslation("deps");
  const bad = data.filter((r) => r.error && r.error.code !== "files.no_branch");
  const cut = data.filter((r) => r.truncated);
  if (!bad.length && !cut.length) return null;
  return (
    <div className="space-y-1 text-[11.5px] text-warn">
      {bad.length > 0 && (
        <p>
          {t("unreadable", {
            count: bad.length,
            list: bad
              .slice(0, 5)
              .map((r) => r.repo)
              .join(", "),
          })}
        </p>
      )}
      {cut.length > 0 && (
        <p className="flex items-center gap-1">
          <GitCompareArrows size={11} />
          {t("truncated", {
            list: cut
              .slice(0, 5)
              .map((r) => r.repo)
              .join(", "),
          })}
        </p>
      )}
    </div>
  );
}
