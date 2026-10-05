import type { ReactNode } from "react";
import { cn } from "@/core/cn";
import { formatNumber } from "@/core/i18n/format";
import { Panel } from "@/ui";
import type { Count } from "./model";

export function ChartCard({
  kicker,
  title,
  children,
  className,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel ticks className={cn("p-4", className)}>
      <div className="annot">{kicker}</div>
      <div className="mb-3 text-[13.5px] font-medium">{title}</div>
      {children}
    </Panel>
  );
}


export function Bars({
  data,
  color,
  onPick,
  format = formatNumber,
  empty,
}: {
  data: (Count & { color?: string; label?: ReactNode })[];
  color?: string;
  onPick?: (key: string) => void;
  format?: (n: number) => string;
  empty?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  if (!data.length) return <div className="py-4 text-center text-[12px] text-faint">{empty ?? "—"}</div>;
  return (
    <div className="space-y-1.5">
      {data.map((d) => (
        <button
          key={d.key}
          onClick={onPick ? () => onPick(d.key) : undefined}
          className={cn(
            "grid w-full grid-cols-[minmax(0,140px)_minmax(0,1fr)_56px] items-center gap-2 text-left",
            onPick ? "cursor-default hover:text-accent" : "cursor-default",
          )}
        >
          <span className="truncate text-[12px]" title={d.key}>
            {d.label ?? d.key}
          </span>
          <span className="h-2.5 overflow-hidden rounded-[2px] bg-surface-2">
            <span
              className="block h-full rounded-[2px]"
              style={{ width: `${(d.count / max) * 100}%`, background: d.color ?? color ?? "var(--accent)" }}
            />
          </span>
          <span className="num text-right text-[11.5px] text-dim">{format(d.count)}</span>
        </button>
      ))}
    </div>
  );
}


export function Columns({
  data,
  height = 110,
  color = "var(--accent)",
}: {
  data: Count[];
  height?: number;
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d) => (
          <div
            key={d.key}
            className="group relative flex h-full min-w-[4px] flex-1 items-end"
            title={`${d.key} · ${d.count}`}
          >
            <div
              className="w-full rounded-t-[2px] transition-opacity group-hover:opacity-80"
              style={{ height: `${Math.max((d.count / max) * 100, d.count ? 3 : 0)}%`, background: color }}
            />
          </div>
        ))}
      </div>
      <div className="num mt-1 flex justify-between text-[10.5px] text-faint">
        <span>{data[0]?.key}</span>
        <span>{data[data.length - 1]?.key}</span>
      </div>
    </div>
  );
}


export function Spark({
  values,
  width = 90,
  height = 22,
  color = "var(--accent)",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return <span className="inline-block" style={{ width, height }} />;
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - (v / max) * (height - 4)}`)
    .join(" ");
  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
