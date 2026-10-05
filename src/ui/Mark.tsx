import type { CSSProperties } from "react";
import type { Tone } from "./Status";

export type Glyph =
  | "signal3"
  | "signal2"
  | "signal1"
  | "void"
  | "archive"
  | "pending"
  | "running"
  | "tick"
  | "cross"
  | "slash"
  | "skip"
  | "pause"
  | "hourglass"
  | "equal"
  | "block"
  | "open"
  | "closed"
  | "notPlanned"
  | "info"
  | "warn"
  | "merge";

const toneVar: Record<Tone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  info: "var(--info)",
  idle: "var(--idle)",
  accent: "var(--accent)",
  done: "var(--done)",
};

function paths(g: Glyph, c: string) {
  const off = "var(--line-strong)";
  const sw = { stroke: c, strokeWidth: 1.4, fill: "none", strokeLinecap: "square" as const };
  const frame = <rect x="1.5" y="1.5" width="9" height="9" {...sw} />;
  switch (g) {
    case "signal3":
    case "signal2":
    case "signal1": {
      const lit = Number(g.slice(-1));
      return [
        [1, 7, 4],
        [4.75, 4.5, 6.5],
        [8.5, 1.5, 9.5],
      ].map(([x, y, h], i) => <rect key={i} x={x} y={y} width="2.5" height={h} fill={i < lit ? c : off} />);
    }
    case "void":
      return <rect x="1.5" y="1.5" width="9" height="9" {...sw} strokeDasharray="2 1.6" />;
    case "archive":
      return (
        <>
          <rect x="1" y="1.5" width="10" height="3" fill={c} />
          <path d="M2 4.5v6h8v-6M4.5 7h3" {...sw} />
        </>
      );
    case "pending":
      return frame;
    case "running":
      return (
        <>
          {frame}
          <rect x="3.5" y="3.5" width="5" height="5" fill={c} className="mark-sweep" />
        </>
      );
    case "tick":
      return <path d="M2 6.5l2.6 2.6L10 3.4" {...sw} strokeWidth={1.8} />;
    case "cross":
      return <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" {...sw} strokeWidth={1.8} />;
    case "slash":
      return (
        <>
          {frame}
          <path d="M3 9l6-6" {...sw} />
        </>
      );
    case "skip":
      return <path d="M2 2.5l3.5 3.5L2 9.5M6.5 2.5L10 6l-3.5 3.5" {...sw} />;
    case "pause":
      return (
        <>
          <rect x="2.5" y="2" width="2.5" height="8" fill={c} />
          <rect x="7" y="2" width="2.5" height="8" fill={c} />
        </>
      );
    case "hourglass":
      return <path d="M2.5 1.5h7L2.5 10.5h7z" {...sw} strokeLinejoin="miter" />;
    case "equal":
      return <path d="M2 4.5h8M2 7.5h8" {...sw} />;
    case "block":
      return (
        <>
          {frame}
          <path d="M3.5 6h5" {...sw} strokeWidth={1.8} />
        </>
      );
    case "open":
      return (
        <>
          <path d="M1.5 4V1.5H4M8 1.5h2.5V4M10.5 8v2.5H8M4 10.5H1.5V8" {...sw} />
          <rect x="4.25" y="4.25" width="3.5" height="3.5" fill={c} />
        </>
      );
    case "closed":
      return (
        <>
          <path d="M1.5 4V1.5H4M8 1.5h2.5V4M10.5 8v2.5H8M4 10.5H1.5V8" {...sw} />
          <path d="M3.4 6.1l1.8 1.8 3.5-3.9" {...sw} strokeWidth={1.6} />
        </>
      );
    case "notPlanned":
      return (
        <>
          <path d="M1.5 4V1.5H4M8 1.5h2.5V4M10.5 8v2.5H8M4 10.5H1.5V8" {...sw} />
          <path d="M3.8 8.2l4.4-4.4" {...sw} strokeWidth={1.6} />
        </>
      );
    case "merge":
      return <path d="M3 1.5v9M3 4.5h3a3 3 0 0 1 3 3v3M7 8.5l2 2 2-2" {...sw} strokeLinejoin="miter" />;
    case "info":
      return <path d="M6 5v5M6 2v1.4" {...sw} strokeWidth={1.8} />;
    case "warn":
      return <path d="M6 1.5L11 10.5H1zM6 5v2.5M6 8.6v.4" {...sw} strokeLinejoin="miter" />;
  }
}

export function Mark({
  glyph,
  tone = "idle",
  size = 12,
  title,
  className,
  style,
}: {
  glyph: Glyph;
  tone?: Tone;
  size?: number;
  title?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={className}
      style={{ flexShrink: 0, ...style }}
    >
      {title && <title>{title}</title>}
      {paths(glyph, toneVar[tone])}
    </svg>
  );
}
