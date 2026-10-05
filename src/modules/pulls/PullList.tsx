import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { GitBranch, MessageSquare } from "lucide-react";
import type { PullSummary } from "@/core/ipc";
import { cn } from "@/core/cn";
import { formatRelative } from "@/core/i18n/format";
import { useSheetRole } from "@/core/sheets/role";
import { useTopSheet } from "@/core/sheets/store";
import { useActiveAccount } from "@/core/store/session";
import { Avatar, Checkbox, Mark, Plotter } from "@/ui";
import { LabelChip } from "@/modules/issues/LabelChip";
import { ChecksMark, PullStateMark, ReviewBadge } from "./PullMarks";
import { openPull } from "./PullSheet";
import { pullKey } from "./query";
import { usePullsUi } from "./store";

const ROW_H = 70;

export function PullList({
  pulls,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  pulls: PullSummary[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cursor = usePullsUi((s) => s.cursor);
  const v = useVirtualizer({
    count: pulls.length + (hasMore ? 1 : 0),
    getScrollElement: () => ref.current,
    estimateSize: () => ROW_H,
    overscan: 10,
  });
  const items = v.getVirtualItems();
  const last = items[items.length - 1];
  useEffect(() => {
    if (last && last.index >= pulls.length && hasMore && !loadingMore) onLoadMore();
  }, [last, pulls.length, hasMore, loadingMore, onLoadMore]);
  useEffect(() => {
    if (cursor < pulls.length) v.scrollToIndex(cursor, { align: "auto" });
  }, [cursor, pulls.length, v]);

  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto">
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {items.map((vi) =>
          vi.index >= pulls.length ? (
            <div
              key="more"
              style={{ position: "absolute", top: vi.start, left: 0, right: 0, height: ROW_H }}
              className="flex items-center px-6"
            >
              <Plotter className="w-full" />
            </div>
          ) : (
            <Row
              key={pullKey(pulls[vi.index].repo, pulls[vi.index].number)}
              pull={pulls[vi.index]}
              index={vi.index}
              top={vi.start}
            />
          ),
        )}
      </div>
    </div>
  );
}

function Row({ pull, index, top }: { pull: PullSummary; index: number; top: number }) {
  const { t } = useTranslation("pulls");
  const key = pullKey(pull.repo, pull.number);
  const me = useActiveAccount()?.login;
  const compact = useSheetRole() === "peek";
  const selected = usePullsUi((s) => s.selected.has(key));
  const isCursor = usePullsUi((s) => s.cursor === index);
  const openSheet = useTopSheet("pulls", "pull");
  const isOpen = !!openSheet && openSheet.repo === pull.repo && openSheet.number === pull.number;
  const toggle = usePullsUi((s) => s.toggleSelect);
  const set = usePullsUi((s) => s.set);
  const repoLabel = pull.repo.startsWith(`${me}/`) ? pull.repo.slice(me!.length + 1) : pull.repo;

  return (
    <div
      onClick={(e) =>
        e.shiftKey || e.ctrlKey || e.metaKey ? toggle(key) : (set({ cursor: index }), openPull(pull))
      }
      style={{ position: "absolute", top, left: 0, right: 0, height: ROW_H }}
      className={cn(
        "group flex items-start gap-2.5 border-b border-line px-4 pt-2.5 transition-colors",
        selected
          ? "bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface))]"
          : isOpen
            ? "bg-surface-2"
            : "bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] hover:bg-surface-2",
        isCursor && "shadow-[inset_2px_0_0_var(--accent)]",
      )}
    >
      <div
        className={cn(
          "pt-0.5 transition-opacity",
          selected ? "opacity-100" : "opacity-40 group-hover:opacity-100",
        )}
      >
        <Checkbox checked={selected} onChange={() => toggle(key)} />
      </div>
      <div className="pt-[2px]">
        <PullStateMark pull={pull} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-text">{pull.title}</span>
          {pull.mergeable === "CONFLICTING" && pull.state === "OPEN" && (
            <Mark glyph="warn" tone="warn" size={11} title={t("merge.conflicts")} />
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-faint">
          <span className="num truncate text-dim">{repoLabel}</span>
          <span className="num">#{pull.number}</span>
          {!compact && (
            <span className="num flex min-w-0 items-center gap-1 truncate">
              <GitBranch size={10} />
              {pull.head_ref} → {pull.base_ref}
            </span>
          )}
        </div>
        <div className="mt-1 flex h-[19px] items-center gap-1 overflow-hidden">
          <span className="num mr-1 shrink-0 text-[10.5px] text-faint">
            {t("list.byAt", { login: pull.author?.login ?? "ghost", when: formatRelative(pull.updated_at) })}
          </span>
          {!compact && pull.labels.slice(0, 3).map((l) => <LabelChip key={l.name} label={l} />)}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
        <div className="flex items-center gap-2">
          <ChecksMark state={pull.checks} />
          <ReviewBadge decision={pull.review_decision} />
        </div>
        <div className="num flex items-center gap-2 text-[10.5px]">
          <span className="text-ok">+{pull.additions}</span>
          <span className="text-danger">−{pull.deletions}</span>
          {pull.comments > 0 && (
            <span className="flex items-center gap-0.5 text-faint">
              <MessageSquare size={10} />
              {pull.comments}
            </span>
          )}
          {!compact && (
            <span className="flex -space-x-1">
              {pull.assignees.slice(0, 2).map((a) => (
                <Avatar key={a.login} src={a.avatar_url} alt={a.login} size={14} />
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
