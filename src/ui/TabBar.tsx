import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/core/cn";

export interface TabDef<T extends string> {
  id: T;
  icon?: LucideIcon;
  label: ReactNode;
  count?: number;

  group?: string | true;
}


export function TabBar<T extends string>({ tabs, value, onChange, className }: { tabs: TabDef<T>[]; value: T; onChange: (t: T) => void; className?: string }) {
  const ref = useRef<HTMLElement>(null);

  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = () => {
    const el = ref.current;
    if (el) setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.length]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[data-active]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);
  const nudge = (dir: number) => ref.current?.scrollBy({ left: dir * 220, behavior: "smooth" });
  return (
    <div className={cn("relative shrink-0", className)}>
    <nav
      ref={ref}

      onWheel={(e) => {
        const el = ref.current;
        if (el && el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
      }}
      onScroll={measure}
      className="no-scrollbar flex items-stretch overflow-x-auto border-b border-line bg-surface px-4"
    >
      {tabs.map((x) => (
        <Fragment key={x.id}>
          {x.group && (
            <span className="mx-2 flex shrink-0 items-center gap-2">
              <span className="h-4 w-px bg-line-strong" />
              {typeof x.group === "string" && <span className="annot !text-[9px]">{x.group}</span>}
            </span>
          )}
          <button
            data-active={value === x.id ? "" : undefined}
            onClick={() => onChange(x.id)}
            className={cn("relative flex h-10 shrink-0 items-center gap-2 px-3 text-[12.5px] whitespace-nowrap cursor-default", value === x.id ? "text-text" : "text-dim hover:text-text")}
          >
            {x.icon && <x.icon size={14} />}
            {x.label}
            {x.count != null && <span className="num text-[10.5px] text-faint">{x.count}</span>}
            <span className={cn("absolute inset-x-2 bottom-0 h-[2px]", value === x.id ? "bg-accent" : "bg-transparent")} />
          </button>
        </Fragment>
      ))}
    </nav>
      {(["left", "right"] as const).map(
        (side) =>
          edges[side] && (
            <button
              key={side}
              type="button"
              aria-label={side === "left" ? "‹" : "›"}
              onClick={() => nudge(side === "left" ? -1 : 1)}
              className={cn(
                "absolute top-0 bottom-px flex w-10 cursor-default items-center text-dim hover:text-accent",
                side === "left" ? "left-0 justify-start bg-gradient-to-r pl-1" : "right-0 justify-end bg-gradient-to-l pr-1",
                "from-surface via-surface/90 to-transparent",
              )}
            >
              {side === "left" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
          ),
      )}
    </div>
  );
}
