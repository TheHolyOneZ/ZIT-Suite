import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { Check, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/core/cn";

const fieldBase =
  "h-8 w-full rounded-[var(--radius)] border border-line-strong bg-surface px-2.5 text-[13px] text-text placeholder:text-faint outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon: Icon, trailing, className, ...rest },
  ref,
) {
  return (
    <div className="relative flex items-center">
      {Icon && <Icon size={14} className="pointer-events-none absolute left-2.5 text-faint" />}
      <input
        ref={ref}
        className={cn(fieldBase, Icon && "pl-8", trailing ? "pr-8" : undefined, className)}
        spellCheck={false}
        {...rest}
      />
      {trailing && <div className="absolute right-2 flex items-center">{trailing}</div>}
    </div>
  );
});

export function Label({
  children,
  hint,
  htmlFor,
}: {
  children: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="annot !text-dim">{children}</span>
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  className?: string;
}) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        "group inline-flex items-center gap-2 text-left text-[13px] text-dim hover:text-text cursor-default",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
          on
            ? "border-accent bg-accent text-accent-fg"
            : "border-line-strong bg-surface group-hover:border-dim",
        )}
      >
        {indeterminate ? (
          <Minus size={10} strokeWidth={3} />
        ) : checked ? (
          <Check size={10} strokeWidth={3} />
        ) : null}
      </span>
      {label}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[18px] w-8 shrink-0 rounded-[3px] border transition-colors cursor-default disabled:opacity-40",
        checked ? "border-accent bg-accent" : "border-line-strong bg-surface-3",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] size-3 rounded-[2px] transition-all",
          checked ? "left-[16px] bg-accent-fg" : "left-[2px] bg-dim",
        )}
      />
    </button>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  title?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  className,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-[var(--radius)] border border-line-strong bg-surface p-0.5",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-1.5 rounded-[3px] px-2 whitespace-nowrap transition-colors cursor-default",
            size === "sm" ? "h-6 text-[11.5px]" : "h-7 text-[12.5px]",
            o.value === value
              ? "bg-surface-3 text-text shadow-[inset_0_-1px_0_var(--accent)]"
              : "text-dim hover:text-text",
          )}
        >
          {o.icon && <o.icon size={13} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
