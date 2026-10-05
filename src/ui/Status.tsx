import type { ReactNode } from "react";
import { cn } from "@/core/cn";

export type Tone = "ok" | "warn" | "danger" | "info" | "idle" | "accent" | "done";

export const toneVar: Record<Tone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  info: "var(--info)",
  idle: "var(--idle)",
  accent: "var(--accent)",
  done: "var(--done)",
};

export function Badge({ tone, children, className, mono }: { tone?: Tone; children: ReactNode; className?: string; mono?: boolean }) {
  const color = tone ? toneVar[tone] : "var(--text-dim)";
  return (
    <span
      className={cn("inline-flex h-[18px] items-center gap-1 rounded-[3px] border px-1.5 text-[10.5px] font-medium whitespace-nowrap", mono && "num uppercase tracking-wider", className)}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        background: `color-mix(in srgb, ${color} 9%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] border border-line-strong bg-surface-2 px-1 text-[10.5px] text-dim">
      {children}
    </kbd>
  );
}


export function Meter({ value, tone = "accent", className }: { value: number; tone?: Tone; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("relative h-1.5 overflow-hidden rounded-[1px] bg-surface-3", className)}>
      <div className="absolute inset-y-0 left-0" style={{ width: `${v}%`, background: toneVar[tone] }} />
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "linear-gradient(90deg, var(--surface) 1px, transparent 1px)", backgroundSize: "10% 100%" }}
      />
    </div>
  );
}

export function Plotter({ className }: { className?: string }) {
  return <div className={cn("plotter", className)} role="progressbar" aria-busy />;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      {icon && <div className="relative flex size-12 items-center justify-center rounded-[var(--radius)] border border-dashed border-line-strong text-faint">{icon}</div>}
      <div className="text-[14px] font-medium">{title}</div>
      {body && <div className="max-w-sm text-[12.5px] text-dim">{body}</div>}
      {action}
    </div>
  );
}

export function Avatar({ src, alt, size = 22 }: { src?: string | null; alt: string; size?: number }) {
  return src ? (
    <img src={src} alt={alt} width={size} height={size} className="shrink-0 rounded-[3px] border border-line" draggable={false} />
  ) : (
    <span
      style={{ width: size, height: size }}
      className="num flex shrink-0 items-center justify-center rounded-[3px] border border-line bg-surface-3 text-[10px] uppercase text-dim"
    >
      {alt.slice(0, 2)}
    </span>
  );
}
