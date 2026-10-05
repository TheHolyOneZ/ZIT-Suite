import type { Label } from "@/core/ipc";
import { cn } from "@/core/cn";


export function LabelChip({
  label,
  className,
  onRemove,
}: {
  label: Pick<Label, "name" | "color">;
  className?: string;
  onRemove?: () => void;
}) {
  const c = `#${label.color.replace("#", "")}`;
  return (
    <span
      className={cn(
        "inline-flex h-[19px] max-w-[180px] items-center gap-1.5 rounded-[3px] border pr-1.5 pl-1 text-[11px] whitespace-nowrap",
        className,
      )}
      style={{
        borderColor: `color-mix(in srgb, ${c} 55%, transparent)`,
        background: `color-mix(in srgb, ${c} 12%, transparent)`,
      }}
      title={label.name}
    >
      <span className="size-2 shrink-0 rounded-[1px]" style={{ background: c }} />
      <span className="truncate text-text">{label.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-faint hover:text-text cursor-default"
          aria-label="×"
        >
          ×
        </button>
      )}
    </span>
  );
}
