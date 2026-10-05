import { forwardRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ListFilter, RotateCcw, Search, X } from "lucide-react";
import { cn } from "@/core/cn";
import { Popover } from "./Popover";

export interface FilterChip {
  id: string;

  facet: string;
  value: ReactNode;
  onRemove: () => void;
  negative?: boolean;
}


export const FilterBar = forwardRef<
  HTMLInputElement,
  {
    search?: string;
    onSearch?: (v: string) => void;
    placeholder?: string;
    chips: FilterChip[];

    facets?: ReactNode | ((close: () => void) => ReactNode);
    facetsWidth?: number;
    views?: ReactNode;
    right?: ReactNode;
    onReset?: () => void;
    leading?: ReactNode;
  }
>(function FilterBar(
  { search, onSearch, placeholder, chips, facets, facetsWidth = 760, views, right, onReset, leading },
  ref,
) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-surface px-4 py-1.5">
      {leading}
      {onSearch && (
        <label className="flex h-7 w-[240px] items-center gap-2 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2 focus-within:border-accent">
          <Search size={13} className="shrink-0 text-faint" />
          <input
            ref={ref}
            value={search ?? ""}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && search && (e.preventDefault(), onSearch(""))}
            placeholder={placeholder}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-text outline-none placeholder:text-faint"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearch("")}
              className="text-faint hover:text-text cursor-default"
              aria-label={t("actions.clear")}
            >
              <X size={12} />
            </button>
          ) : null}
        </label>
      )}

      {chips.map((c) => (
        <span
          key={c.id}
          className={cn(
            "num flex h-7 items-center overflow-hidden rounded-[var(--radius)] border text-[11.5px]",
            c.negative ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)]" : "border-line-strong",
          )}
        >
          <span className="flex h-full items-center border-r border-line bg-surface-3 px-1.5 text-[10px] tracking-[0.08em] text-faint uppercase">
            {c.negative ? "−" : ""}
            {c.facet}
          </span>
          <span className="flex max-w-[220px] items-center gap-1 truncate px-2 text-text">{c.value}</span>
          <button
            type="button"
            onClick={c.onRemove}
            className="flex h-full items-center px-1.5 text-faint hover:bg-surface-2 hover:text-text cursor-default"
            aria-label={t("actions.remove")}
          >
            <X size={11} />
          </button>
        </span>
      ))}

      {facets != null && (
        <Popover
          placement="bottom-start"
          className="p-0"
          trigger={(p) => (
            <button
              {...p}
              type="button"
              className="flex h-7 items-center gap-1.5 rounded-[var(--radius)] border border-dashed border-line-strong px-2 text-[12px] text-dim hover:border-accent hover:text-text cursor-default"
            >
              <ListFilter size={13} />
              {t("filters.add")}
            </button>
          )}
        >
          {(close) => (
            <div style={{ width: facetsWidth }}>{typeof facets === "function" ? facets(close) : facets}</div>
          )}
        </Popover>
      )}

      {chips.length > 0 && onReset && (
        <button
          type="button"
          onClick={onReset}
          className="flex h-7 items-center gap-1 px-1.5 text-[11.5px] text-faint hover:text-text cursor-default"
        >
          <RotateCcw size={11} />
          {t("filters.reset")}
        </button>
      )}
      <span className="flex-1" />
      {views}
      {right}
    </div>
  );
});


export function FacetGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-3 divide-x divide-[var(--line)]">{children}</div>;
}

export function FacetColumn({ children }: { children: ReactNode }) {
  return <div className="max-h-[70vh] overflow-y-auto py-1">{children}</div>;
}
