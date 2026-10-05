import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/core/cn";

type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end" | "right-start";


export function Popover({
  trigger,
  children,
  placement = "bottom-start",
  className,
  open: controlled,
  onOpenChange,
}: {
  trigger: (props: { onClick: () => void; ref: React.Ref<HTMLButtonElement>; "aria-expanded": boolean }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  placement?: Placement;
  className?: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setInner(v));
  const anchor = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !pop.current) return;
    const a = anchor.current.getBoundingClientRect();
    const p = pop.current.getBoundingClientRect();
    const gap = 6;
    const below = a.bottom + gap;
    const above = a.top - p.height - gap;
    let top = placement.startsWith("right") ? a.top : placement.startsWith("bottom") ? below : above;

    if (placement.startsWith("top") && above < 8) top = below;
    if (placement.startsWith("bottom") && below + p.height > window.innerHeight - 8 && above >= 8) top = above;
    let left = placement === "right-start" ? a.right + gap : placement.endsWith("end") ? a.right - p.width : a.left;
    top = Math.max(8, Math.min(top, window.innerHeight - p.height - 8));
    left = Math.max(8, Math.min(left, window.innerWidth - p.width - 8));
    setPos({ top, left });
  }, [open, placement]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !anchor.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  });

  const close = () => setOpen(false);
  return (
    <>
      {trigger({ onClick: () => setOpen(!open), ref: anchor, "aria-expanded": open })}
      {open &&
        createPortal(
          <div
            ref={pop}
            data-popover
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className={cn(
              "fixed z-[60] min-w-[200px] rounded-[var(--radius)] border border-line-strong bg-surface p-1 shadow-[var(--shadow)]",
              className,
            )}
          >
            {typeof children === "function" ? children(close) : children}
          </div>,
          document.body,
        )}
    </>
  );
}

export function MenuItem({
  icon: Icon,
  children,
  onClick,
  danger,
  active,
  trailing,
  disabled,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  active?: boolean;
  trailing?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-[3px] px-2 text-left text-[13px] cursor-default disabled:opacity-40",
        danger ? "text-danger hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]" : "text-text hover:bg-surface-2",
        active && "bg-surface-2",
      )}
    >
      {Icon && <Icon size={14} className={danger ? "" : "text-dim"} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="annot px-2 pt-2 pb-1">{children}</div>;
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-line" />;
}
