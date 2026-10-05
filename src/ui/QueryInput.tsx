import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, TerminalSquare } from "lucide-react";
import { cn } from "@/core/cn";


export function QueryInput({
  value,
  raw,
  onSubmit,
  onReset,
  focusSignal,
  right,
  label,
}: {
  value: string;
  raw: boolean;
  onSubmit: (q: string) => void;
  onReset: () => void;
  focusSignal?: number;
  right?: ReactNode;
  label: string;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (focusSignal) ref.current?.focus();
  }, [focusSignal]);
  return (
    <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
      <form
        className={cn("flex h-8 flex-1 items-center gap-2 rounded-[var(--radius)] border bg-surface-2 px-2.5", raw ? "border-accent" : "border-line-strong focus-within:border-accent")}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(draft.trim());
          ref.current?.blur();
        }}
      >
        <TerminalSquare size={14} className="shrink-0 text-faint" />
        <input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && (setDraft(value), e.currentTarget.blur())}
          spellCheck={false}
          className="num min-w-0 flex-1 bg-transparent text-[12px] text-text outline-none"
          aria-label={label}
        />
        {raw && (
          <button type="button" onClick={onReset} title={t("query.backToFilters")} className="text-faint hover:text-text cursor-default">
            <RotateCcw size={12} />
          </button>
        )}
        <kbd className="num text-[10px] text-faint">/</kbd>
      </form>
      {right}
    </div>
  );
}
