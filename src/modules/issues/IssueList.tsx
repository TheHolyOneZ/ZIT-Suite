import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Lock, MessageSquare } from "lucide-react";
import type { Issue } from "@/core/ipc";
import { cn } from "@/core/cn";
import { formatRelative } from "@/core/i18n/format";
import { Avatar, Checkbox, Plotter } from "@/ui";
import { IssueStateMark } from "./IssueState";
import { LabelChip } from "./LabelChip";
import { issueKey } from "./query";
import { useIssuesUi } from "./store";
import { openIssue } from "./IssueSheet";
import { useTopSheet } from "@/core/sheets/store";

const ROW_H = 68;

export function IssueList({
  issues,
  hasMore,
  loadingMore,
  onLoadMore,
  showRepo,
}: {
  issues: Issue[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  showRepo: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cursor = useIssuesUi((s) => s.cursor);
  const v = useVirtualizer({
    count: issues.length + (hasMore ? 1 : 0),
    getScrollElement: () => ref.current,
    estimateSize: () => ROW_H,
    overscan: 10,
  });
  const items = v.getVirtualItems();
  const last = items[items.length - 1];


  useEffect(() => {
    if (last && last.index >= issues.length && hasMore && !loadingMore) onLoadMore();
  }, [last, issues.length, hasMore, loadingMore, onLoadMore]);

  useEffect(() => {
    if (cursor < issues.length) v.scrollToIndex(cursor, { align: "auto" });
  }, [cursor, issues.length, v]);

  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto">
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {items.map((vi) =>
          vi.index >= issues.length ? (
            <div
              key="more"
              style={{ position: "absolute", top: vi.start, left: 0, right: 0, height: ROW_H }}
              className="flex items-center px-6"
            >
              <Plotter className="w-full" />
            </div>
          ) : (
            <Row
              key={issueKey(issues[vi.index].repo, issues[vi.index].number)}
              issue={issues[vi.index]}
              index={vi.index}
              top={vi.start}
              showRepo={showRepo}
            />
          ),
        )}
      </div>
    </div>
  );
}

function Row({
  issue,
  index,
  top,
  showRepo,
}: {
  issue: Issue;
  index: number;
  top: number;
  showRepo: boolean;
}) {
  const { t } = useTranslation("issues");
  const key = issueKey(issue.repo, issue.number);
  const selected = useIssuesUi((s) => s.selected.has(key));
  const isCursor = useIssuesUi((s) => s.cursor === index);
  const openSheet = useTopSheet("issues", "issue");
  const isOpen = !!openSheet && openSheet.repo === issue.repo && openSheet.number === issue.number;
  const toggle = useIssuesUi((s) => s.toggleSelect);
  const set = useIssuesUi((s) => s.set);

  return (
    <div
      onClick={(e) =>
        e.shiftKey || e.ctrlKey || e.metaKey
          ? toggle(key)
          : (set({ cursor: index, picker: null }), openIssue(issue))
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
        <IssueStateMark issue={issue} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-medium text-text">{issue.title}</span>
          {issue.locked && <Lock size={11} className="shrink-0 text-faint" />}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-faint">
          {showRepo && <span className="num truncate text-dim">{issue.repo}</span>}
          <span className="num">#{issue.number}</span>
          <span>·</span>
          <span className="truncate">
            {t("list.byAt", { login: issue.user.login, when: formatRelative(issue.updated_at) })}
          </span>
        </div>
        <div className="mt-1 flex h-[19px] gap-1 overflow-hidden">
          {issue.labels.slice(0, 4).map((l) => (
            <LabelChip key={l.name} label={l} />
          ))}
          {issue.labels.length > 4 && (
            <span className="num self-center text-[10.5px] text-faint">+{issue.labels.length - 4}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
        <div className="flex -space-x-1">
          {issue.assignees.slice(0, 3).map((a) => (
            <Avatar key={a.login} src={a.avatar_url} alt={a.login} size={18} />
          ))}
        </div>
        {issue.comments > 0 && (
          <span className="num flex items-center gap-1 text-[11px] text-faint">
            <MessageSquare size={11} />
            {issue.comments}
          </span>
        )}
      </div>
    </div>
  );
}
