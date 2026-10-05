import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, GitFork, LayoutTemplate, Lock } from "lucide-react";
import { cn } from "@/core/cn";
import { formatCompact, formatSizeKb } from "@/core/i18n/format";
import { Badge, Checkbox, Meter, Mark, RelTime } from "@/ui";
import type { RepoRow, SortKey } from "./filters";
import { healthGlyph, healthTone } from "./health";
import { languageColor } from "./languageColors";
import { tagTone, useReposPrefs, useReposUi } from "./store";
import { useTagLabel } from "./TagMenu";
import { openRepo } from "./RepoSheet";
import { useTopSheet } from "@/core/sheets/store";
import { useSheetRole } from "@/core/sheets/role";

const COLS = "grid-cols-[32px_minmax(240px,1fr)_120px_56px_60px_80px_116px_96px_minmax(90px,150px)]";

const COLS_COMPACT = "grid-cols-[32px_minmax(0,1fr)_90px_64px]";
const ROW_H = 46;

export function RepoTable({ rows }: { rows: RepoRow[] }) {
  const { t } = useTranslation("repos");
  const scrollRef = useRef<HTMLDivElement>(null);
  const selected = useReposUi((s) => s.selected);
  const cursor = useReposUi((s) => s.cursor);
  const setSelected = useReposUi((s) => s.setSelected);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.repo.full_name));
  const someSelected = !allSelected && rows.some((r) => selected.has(r.repo.full_name));

  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
  });

  useEffect(() => {
    if (cursor < rows.length) v.scrollToIndex(cursor, { align: "auto" });
  }, [cursor, rows.length, v]);

  const header: { key: SortKey | null; label: string; align?: "right" }[] = [
    { key: "name", label: t("columns.name") },
    { key: "language", label: t("columns.language") },
    { key: "stars", label: "★", align: "right" },
    { key: "issues", label: t("columns.issues"), align: "right" },
    { key: "size", label: t("columns.size"), align: "right" },
    { key: "updated", label: t("columns.updated"), align: "right" },
    { key: "health", label: t("columns.health") },
    { key: null, label: t("columns.tags") },
  ];

  const compact = useSheetRole() === "peek";
  const shown = compact
    ? header.filter((h) => h.key === "name" || h.key === "updated" || h.key === "health")
    : header;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "annot grid shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-2",
          compact ? COLS_COMPACT : COLS,
        )}
      >
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected}
          onChange={() => setSelected(allSelected ? [] : rows.map((r) => r.repo.full_name))}
        />
        {(compact ? [shown[0], shown[2], shown[1]] : shown).map((h) => (
          <SortHeader key={h.label} sortKey={h.key} align={h.align}>
            {h.label}
          </SortHeader>
        ))}
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div style={{ height: v.getTotalSize(), position: "relative" }}>
          {v.getVirtualItems().map((vi) => (
            <TableRow
              key={rows[vi.index].repo.id}
              row={rows[vi.index]}
              index={vi.index}
              top={vi.start}
              compact={compact}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SortHeader({
  sortKey,
  align,
  children,
}: {
  sortKey: SortKey | null;
  align?: "right";
  children: React.ReactNode;
}) {
  const sort = useReposPrefs((s) => s.sort);
  const set = useReposPrefs((s) => s.set);
  if (!sortKey) return <span>{children}</span>;
  const active = sort.key === sortKey;
  return (
    <button
      onClick={() => set({ sort: { key: sortKey, dir: active && sort.dir === "desc" ? "asc" : "desc" } })}
      className={cn(
        "flex items-center gap-1 uppercase cursor-default hover:text-text",
        align === "right" && "justify-end",
        active && "text-accent",
      )}
    >
      {children}
      {active && (sort.dir === "desc" ? <ArrowDown size={10} /> : <ArrowUp size={10} />)}
    </button>
  );
}

function TableRow({
  row,
  index,
  top,
  compact,
}: {
  row: RepoRow;
  index: number;
  top: number;
  compact: boolean;
}) {
  const { t } = useTranslation("repos");
  const { repo, health, tags } = row;
  const isSelected = useReposUi((s) => s.selected.has(repo.full_name));
  const isCursor = useReposUi((s) => s.cursor === index);
  const isOpen = useTopSheet("repos", "repo")?.fullName === repo.full_name;
  const toggle = useReposUi((s) => s.toggleSelect);
  const set = useReposUi((s) => s.set);
  const tagLabel = useTagLabel();

  return (
    <div
      onClick={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) toggle(repo.full_name);
        else {
          set({ cursor: index });
          openRepo(repo.full_name, repo.name);
        }
      }}
      style={{ position: "absolute", top, left: 0, right: 0, height: ROW_H }}
      className={cn(
        "grid items-center gap-3 border-b border-line px-4 text-[12.5px] transition-colors",
        compact ? COLS_COMPACT : COLS,
        isSelected
          ? "bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface))]"
          : "bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] hover:bg-surface-2",
        isCursor && "shadow-[inset_2px_0_0_var(--accent)]",
        isOpen && "bg-surface-2",
      )}
    >
      <Checkbox checked={isSelected} onChange={() => toggle(repo.full_name)} />
      <div className="flex min-w-0 items-center gap-2.5">
        <Mark
          glyph={healthGlyph[health.status]}
          tone={healthTone[health.status]}
          size={12}
          title={t(`health.${health.status}`)}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-text">{repo.name}</span>
            {repo.private && (
              <Lock size={11} className="shrink-0 text-faint" aria-label={t("visibility.private")} />
            )}
            {repo.fork && <GitFork size={11} className="shrink-0 text-faint" aria-label={t("badges.fork")} />}
            {repo.is_template && (
              <LayoutTemplate size={11} className="shrink-0 text-faint" aria-label={t("badges.template")} />
            )}
          </div>
          <div className="truncate text-[11.5px] text-faint">{repo.description || repo.owner.login}</div>
        </div>
      </div>
      {compact ? (
        <>
          <span className="flex items-center gap-2">
            <Meter value={health.score} tone={healthTone[health.status]} className="flex-1" />
          </span>
          <span className="num truncate text-right text-[11px] whitespace-nowrap text-faint">
            <RelTime at={repo.pushed_at ?? repo.updated_at} />
          </span>
        </>
      ) : (
        <>
          <span className="flex min-w-0 items-center gap-1.5 text-dim">
            {repo.language && (
              <span
                className="size-2 shrink-0 rounded-[1px]"
                style={{ background: languageColor(repo.language) }}
              />
            )}
            <span className="truncate">{repo.language ?? "—"}</span>
          </span>
          <span className="num text-right text-dim">{formatCompact(repo.stargazers_count)}</span>
          <span className="num text-right text-dim">{formatCompact(repo.open_issues_count)}</span>
          <span className="num text-right text-[11.5px] text-dim">{formatSizeKb(repo.size)}</span>
          <span
            className="num truncate text-right text-[11.5px] whitespace-nowrap text-dim"
            title={repo.pushed_at ?? repo.updated_at}
          >
            <RelTime at={repo.pushed_at ?? repo.updated_at} />
          </span>
          <span className="flex items-center gap-2">
            <Meter value={health.score} tone={healthTone[health.status]} className="flex-1" />
            <span className="num w-6 text-right text-[11px] text-faint">{health.score}</span>
          </span>
          <span className="flex min-w-0 gap-1 overflow-hidden">
            {tags.map((tg) => (
              <Badge key={tg} tone={tagTone(tg)}>
                {tagLabel(tg)}
              </Badge>
            ))}
          </span>
        </>
      )}
    </div>
  );
}
