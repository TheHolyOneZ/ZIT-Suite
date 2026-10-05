import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/core/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  trailing?: ReactNode;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg border-accent hover:brightness-110 shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent)]",
  secondary: "bg-surface-2 text-text border-line-strong hover:border-[color-mix(in_srgb,var(--accent)_55%,var(--line-strong))] hover:bg-surface-3",
  ghost: "bg-transparent text-dim border-transparent hover:text-text hover:bg-surface-2",
  danger: "bg-transparent text-danger border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12px] gap-1.5",
  md: "h-8 px-3 text-[13px] gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, trailing, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius)] border font-medium whitespace-nowrap transition-[background,border,color,filter] duration-150 disabled:opacity-45 disabled:pointer-events-none cursor-default",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={size === "sm" ? 13 : 14} strokeWidth={2} className={cn("shrink-0", loading && "animate-spin")} />}
      {children}
      {trailing}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  size?: number;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, active, size = 15, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-[var(--radius)] border border-transparent text-dim transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-40 cursor-default",
        active && "text-accent bg-surface-2 border-line",
        className,
      )}
      {...rest}
    >
      <Icon size={size} strokeWidth={1.9} />
    </button>
  );
});
