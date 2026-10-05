import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/core/cn";


export function Ticks({ className }: { className?: string }) {
  const c = "pointer-events-none absolute size-2 border-[color-mix(in_srgb,var(--accent)_70%,transparent)]";
  return (
    <span aria-hidden className={className}>
      <span className={cn(c, "-top-px -left-px border-t border-l")} />
      <span className={cn(c, "-top-px -right-px border-t border-r")} />
      <span className={cn(c, "-bottom-px -left-px border-b border-l")} />
      <span className={cn(c, "-right-px -bottom-px border-r border-b")} />
    </span>
  );
}

export function Panel({ ticks, className, children, ...rest }: HTMLAttributes<HTMLDivElement> & { ticks?: boolean }) {
  return (
    <div className={cn("relative rounded-[var(--radius)] border border-line bg-surface", className)} {...rest}>
      {ticks && <Ticks />}
      {children}
    </div>
  );
}


export function PageHeader({
  kicker,
  title,
  meta,
  actions,
}: {
  kicker: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (

    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line px-6 pt-5 pb-4">
      <div className="min-w-[240px] flex-1">
        <div className="annot mb-1 flex items-center gap-2">
          <span className="inline-block h-px w-4 bg-accent" />
          {kicker}
        </div>
        <h1 className="truncate text-[22px] leading-tight font-semibold tracking-[-0.015em]">{title}</h1>
        {meta && <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-dim">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("py-3", className)}>
      <div className="mb-2 flex items-center justify-between gap-2 px-4">
        <h3 className="annot">{title}</h3>
        {aside}
      </div>
      <div className="px-4">{children}</div>
    </section>
  );
}
