import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChevronRight, Download, ExternalLink, RefreshCw, Rocket, Search } from "lucide-react";
import type { RepoReleases } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { formatNumber } from "@/core/i18n/format";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  IconButton,
  Input,
  Panel,
  Plotter,
  RelTime,
  Segmented,
  Select,
} from "@/ui";
import { useBoard, useBoardTargets } from "./api";
import { BulkDialog } from "./BulkDialog";
import { isWaiting, sortBoard, type BoardFilter } from "./model";
import { useReleasesUi } from "./store";

const DAYS = [30, 90, 365, 0];


export function Board() {
  const { t } = useTranslation(["releases", "common"]);
  const ui = useReleasesUi();
  const targets = useBoardTargets(ui.days);
  const q = useBoard(targets);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const rows = useMemo(() => sortBoard((q.data ?? []).filter((r) => !r.error)), [q.data]);
  const shown = rows
    .filter((r) => ui.filter === "all" || (ui.filter === "waiting" ? isWaiting(r) : r.releases === 0))
    .filter((r) => !ui.q.trim() || r.repo.toLowerCase().includes(ui.q.trim().toLowerCase()));
  const waiting = rows.filter(isWaiting);
  const never = rows.filter((r) => r.releases === 0);
  const downloads = rows.reduce((n, r) => n + r.downloads, 0);
  const toggle = (repo: string) =>
    setSelected((s) => (s.has(repo) ? (s.delete(repo), new Set(s)) : new Set(s).add(repo)));

  if (q.isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Plotter />
        {q.progress && (
          <span className="num text-[11.5px] text-faint">
            {t("board.reading", { done: q.progress.done, total: q.progress.total })}
          </span>
        )}
      </div>
    );
  }
  if (q.error) return <EmptyState title={errorMessage(q.error)} />;

  return (
    <div className="mx-auto max-w-[1150px] space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
        <Kpi
          label={t("board.released")}
          value={formatNumber(rows.length - never.length)}
          sub={t("board.ofRepos", { count: rows.length })}
        />
        <Kpi label={t("board.waiting")} value={formatNumber(waiting.length)} accent={waiting.length > 0} />
        <Kpi
          label={t("board.unreleasedCommits")}
          value={formatNumber(waiting.reduce((n, r) => n + (r.since ?? 0), 0))}
        />
        <Kpi label={t("board.downloads")} value={formatNumber(downloads)} />
        <span className="ml-auto flex items-center gap-2">
          <Select
            value={String(ui.days)}
            onChange={(e) => ui.set({ days: Number(e.target.value) })}
            className="!w-[230px]"
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d ? t("board.days", { count: d }) : t("board.allTime")}
              </option>
            ))}
          </Select>
          <IconButton
            icon={RefreshCw}
            label={t("refresh")}
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true);
              void q
                .refresh()
                .catch(toastError)
                .finally(() => setRefreshing(false));
            }}
          />
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented<BoardFilter>
          size="sm"
          value={ui.filter}
          onChange={(filter) => ui.set({ filter })}
          options={[
            { value: "all", label: `${t("board.all")} · ${rows.length}` },
            { value: "waiting", label: `${t("board.onlyWaiting")} · ${waiting.length}` },
            { value: "never", label: `${t("board.onlyNever")} · ${never.length}` },
          ]}
        />
        <div className="w-[240px]">
          <Input
            icon={Search}
            value={ui.q}
            onChange={(e) => ui.set({ q: e.target.value })}
            placeholder={t("board.find")}
            className="!h-7 text-[12px]"
          />
        </div>
        {selected.size > 0 ? (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-[12px] text-dim">{t("board.selected", { count: selected.size })}</span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              {t("board.clear")}
            </Button>
            <Button size="sm" variant="primary" icon={Rocket} onClick={() => setBulk(true)}>
              {t("bulk.button", { count: selected.size })}
            </Button>
          </span>
        ) : (
          shown.some(isWaiting) && (
            <Button
              size="sm"
              variant="secondary"
              className="ml-auto"
              onClick={() => setSelected(new Set(shown.filter(isWaiting).map((r) => r.repo)))}
            >
              {t("board.selectWaiting", { count: shown.filter(isWaiting).length })}
            </Button>
          )
        )}
      </div>

      <Panel className="overflow-hidden">
        {shown.length === 0 && (
          <div className="px-3 py-8 text-center text-[12.5px] text-faint">{t("board.nothing")}</div>
        )}
        {shown.map((r) => (
          <Line
            key={r.repo}
            r={r}
            selected={selected.has(r.repo)}
            onSelect={() => toggle(r.repo)}
            onOpen={() => ui.set({ view: "repo", repo: r.repo })}
          />
        ))}
      </Panel>
      {(q.data ?? []).some((r) => r.error) && (
        <p className="text-[11.5px] text-warn">
          {t("board.unreadable", {
            list: (q.data ?? [])
              .filter((r) => r.error)
              .map((r) => r.repo)
              .slice(0, 5)
              .join(", "),
          })}
        </p>
      )}
      {bulk && (
        <BulkDialog
          rows={rows.filter((r) => selected.has(r.repo))}
          onClose={() => setBulk(false)}
          onDone={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="annot !text-[9.5px]">{label}</div>
      <div className={cn("num text-[17px]", accent && "text-accent")}>
        {value}
        {sub && <span className="ml-1.5 text-[11px] text-faint">{sub}</span>}
      </div>
    </div>
  );
}

function Line({
  r,
  selected,
  onSelect,
  onOpen,
}: {
  r: RepoReleases;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation("releases");
  const ui = useReleasesUi();
  const waiting = isWaiting(r);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={cn(
        "group grid cursor-default grid-cols-[22px_minmax(0,1.2fr)_minmax(0,1fr)_150px_90px_auto] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-surface-2",
        selected && "bg-surface-2",
      )}
    >
      <span onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onChange={onSelect} label={null} />
      </span>
      <span className="num truncate text-[12.5px]">{r.repo}</span>
      <span className="flex min-w-0 items-center gap-2 text-[12px]">
        {r.latest ? (
          <>
            <Badge className="num">{r.latest.tag}</Badge>
            {r.latest.prerelease && <Badge tone="warn">{t("pre")}</Badge>}
            <span className="text-[11px] text-faint">
              {r.latest.published_at && <RelTime at={r.latest.published_at} />}
            </span>
          </>
        ) : (
          <span className="text-[11.5px] text-faint">
            {r.tags.length ? t("board.onlyTags", { tag: r.tags[0] }) : t("board.noRelease")}
          </span>
        )}
        {r.drafts > 0 && <Badge tone="idle">{t("board.drafts", { count: r.drafts })}</Badge>}
      </span>
      <span
        className={cn("num text-[12px]", waiting ? "text-accent" : "text-faint")}
        title={r.since_tag ? t("board.sinceTitle", { tag: r.since_tag, branch: r.branch }) : undefined}
      >
        {r.since == null ? "—" : waiting ? t("board.since", { count: r.since }) : t("board.upToDate")}
      </span>
      <span
        className="num flex items-center justify-end gap-1 text-[11.5px] text-dim"
        title={t("board.downloads")}
      >
        {r.downloads > 0 && (
          <>
            <Download size={11} />
            {formatNumber(r.downloads)}
          </>
        )}
      </span>
      <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
        <IconButton
          icon={Rocket}
          label={t("newRelease")}
          size={13}
          className="size-7 opacity-50 group-hover:opacity-100"
          onClick={() => ui.set({ view: "repo", repo: r.repo, create: {} })}
        />
        <IconButton
          icon={ExternalLink}
          label={t("openOnGitHub")}
          size={13}
          className="size-7 opacity-50 group-hover:opacity-100"
          onClick={() => void openUrl(`https://github.com/${r.repo}/releases`)}
        />
        <ChevronRight size={14} className="text-faint" />
      </span>
    </div>
  );
}
