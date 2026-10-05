import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChevronRight, ExternalLink, RefreshCw } from "lucide-react";
import { errorMessage, toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { formatNumber } from "@/core/i18n/format";
import { useScopeKey } from "@/core/store/session";
import { EmptyState, IconButton, Mark, Meter, Panel, Plotter, RelTime, Segmented, Select } from "@/ui";
import { runLook } from "@/modules/home/ActionsTab";
import { formatDuration, durationMs } from "@/modules/home/ghmodel";
import { actionsKey, refreshBoard, useBoard, useBoardRepos } from "./api";
import { board, type BoardRow } from "./model";
import { useActionsUi } from "./store";

const DAYS = [7, 30, 90, 365, 0];


export function Board() {
  const { t } = useTranslation(["actions", "common"]);
  const ui = useActionsUi();
  const repos = useBoardRepos(ui.days);
  const q = useBoard(repos, ui.days);
  const scope = useScopeKey();
  const rows = useMemo(() => board(q.data ?? []), [q.data]);
  const shown = rows.filter((r) => ui.boardFilter === "all" || r.state === ui.boardFilter);
  const failed = rows.filter((r) => r.state === "failed").length;
  const running = rows.filter((r) => r.state === "running").length;
  const errors = (q.data ?? []).filter((r) => r.error && r.error.code !== "github.not_found");
  const rates = rows.map((r) => r.successRate).filter((x): x is number => x != null);
  const rate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;

  if (q.isLoading || (!q.data && repos.length > 0)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Plotter />
        {q.progress && (
          <span className="num text-[11.5px] text-faint">
            {t("board.scanning", { done: q.progress.done, total: q.progress.total })}
          </span>
        )}
      </div>
    );
  }
  if (q.error) return <EmptyState title={errorMessage(q.error)} />;

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Kpi
          label={t("board.withCi")}
          value={formatNumber(rows.length)}
          sub={t("board.ofRepos", { count: repos.length })}
        />
        <Kpi label={t("board.failing")} value={formatNumber(failed)} tone={failed ? "danger" : undefined} />
        <Kpi label={t("board.running")} value={formatNumber(running)} tone={running ? "accent" : undefined} />
        <div>
          <div className="annot !text-[9.5px]">{t("board.reliability")}</div>
          <div className="flex items-center gap-2">
            <span className="num text-[17px]">{rate == null ? "—" : `${Math.round(rate * 100)}%`}</span>
            {rate != null && (
              <Meter value={rate * 100} tone={rate < 0.8 ? "warn" : "ok"} className="w-[70px]" />
            )}
          </div>
        </div>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            value={String(ui.days)}
            onChange={(e) => ui.set({ days: Number(e.target.value) })}
            className="!w-[170px]"
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
            onClick={() =>
              void refreshBoard(repos, actionsKey.board(scope, ui.days, repos.length)).catch(toastError)
            }
          />
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Segmented<"all" | "failed" | "running">
          size="sm"
          value={ui.boardFilter}
          onChange={(v) => ui.set({ boardFilter: v })}
          options={[
            { value: "all", label: t("board.all", { count: rows.length }) },
            { value: "failed", label: t("board.onlyFailing", { count: failed }) },
            { value: "running", label: t("board.onlyRunning", { count: running }) },
          ]}
        />
        <span className="text-[11.5px] text-faint">{t("board.hint")}</span>
      </div>

      <Panel className="overflow-hidden">
        {shown.length === 0 && (
          <div className="px-3 py-6 text-center text-[12.5px] text-faint">
            {rows.length ? t("board.nothingHere") : t("board.noCi")}
          </div>
        )}
        {shown.map((r) => (
          <BoardLine
            key={r.repo}
            r={r}
            onOpen={() => ui.set({ view: "repo", repo: r.repo, workflow: null })}
          />
        ))}
      </Panel>
      {errors.length > 0 && (
        <p className="text-[11.5px] text-warn">
          {t("board.unreadable", {
            count: errors.length,
            list: errors
              .map((e) => e.repo)
              .slice(0, 5)
              .join(", "),
          })}
        </p>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger" | "accent";
}) {
  return (
    <div>
      <div className="annot !text-[9.5px]">{label}</div>
      <div
        className={cn(
          "num text-[17px]",
          tone === "danger" && "text-danger",
          tone === "accent" && "text-accent",
        )}
      >
        {value}
        {sub && <span className="ml-1.5 text-[11px] text-faint">{sub}</span>}
      </div>
    </div>
  );
}

function BoardLine({ r, onOpen }: { r: BoardRow; onOpen: () => void }) {
  const { t } = useTranslation(["actions", "home"]);
  const last = runLook(r.last);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="group grid cursor-default grid-cols-[18px_minmax(0,1.1fr)_minmax(0,1.4fr)_64px_auto] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-surface-2"
    >
      <Mark
        glyph={last.glyph}
        tone={r.state === "failed" ? "danger" : last.tone}
        title={t(`home:actionsTab.state.${last.state as "success"}`)}
      />
      <span className="min-w-0">
        <span className="num block truncate text-[12.5px]">{r.repo}</span>
        <span className="flex flex-wrap gap-1.5 text-[11px] text-faint">
          {r.latest.map((w) => {
            const l = runLook(w);
            return (
              <span
                key={w.workflow_id}
                className="inline-flex items-center gap-1"
                title={`${w.name} · ${t(`home:actionsTab.state.${l.state as "success"}`)}`}
              >
                <Mark glyph={l.glyph} tone={l.tone} size={9} />
                <span className="max-w-[120px] truncate">{w.name}</span>
              </span>
            );
          })}
        </span>
      </span>
      <span className="min-w-0 text-[12px]">
        <span className="block truncate">{r.last.display_title ?? r.last.name}</span>
        <span className="flex gap-2 text-[11px] text-faint">
          {r.last.head_branch && <span className="num">{r.last.head_branch}</span>}
          <RelTime at={r.last.created_at} />
          <span className="num">
            {r.last.status === "completed"
              ? formatDuration(durationMs(r.last))
              : t(`home:actionsTab.state.${last.state as "running"}`)}
          </span>
        </span>
      </span>
      <span className="num text-right text-[12px] text-dim" title={t("board.reliability")}>
        {r.successRate == null ? "—" : `${Math.round(r.successRate * 100)}%`}
      </span>
      <span className="flex items-center">
        <IconButton
          icon={ExternalLink}
          label={t("openOnGitHub")}
          size={13}
          className="size-7 opacity-0 group-hover:opacity-100"
          onClick={(e) => (e.stopPropagation(), void openUrl(`https://github.com/${r.repo}/actions`))}
        />
        <ChevronRight size={14} className="text-faint" />
      </span>
    </div>
  );
}
