import { useRef } from "react";
import { cn } from "@/core/cn";


export function CodeBox({
  value,
  onChange,
  minRows = 6,
  className,
}: {
  value: string;
  onChange?: (v: string) => void;
  minRows?: number;
  className?: string;
}) {
  const gutter = useRef<HTMLDivElement>(null);
  const lines = Math.max(value.split("\n").length, minRows);
  return (
    <div
      className={cn(
        "relative flex max-h-[520px] overflow-hidden rounded-[var(--radius)] border border-line bg-surface-2",
        className,
      )}
    >
      <div
        ref={gutter}
        className="num shrink-0 overflow-hidden border-r border-line px-2 py-2 text-right text-[11px] leading-[18px] text-faint select-none"
        aria-hidden
      >
        {Array.from({ length: lines }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      {onChange ? (
        <textarea
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => gutter.current && (gutter.current.scrollTop = e.currentTarget.scrollTop)}
          onKeyDown={(e) => {
            if (e.key !== "Tab") return;
            e.preventDefault();
            const t = e.currentTarget;
            const { selectionStart: a, selectionEnd: b } = t;
            onChange(value.slice(0, a) + "  " + value.slice(b));
            requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2));
          }}
          rows={lines}
          className="num min-h-0 flex-1 resize-none overflow-auto bg-transparent px-3 py-2 text-[12px] leading-[18px] whitespace-pre outline-none"
        />
      ) : (
        <pre
          onScroll={(e) => gutter.current && (gutter.current.scrollTop = e.currentTarget.scrollTop)}
          className="num min-w-0 flex-1 overflow-auto px-3 py-2 text-[12px] leading-[18px]"
          data-selectable
        >
          {value}
        </pre>
      )}
    </div>
  );
}
