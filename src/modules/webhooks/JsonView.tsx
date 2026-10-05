import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import { IconButton } from "@/ui";

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;


export function tokenize(
  src: string,
): { text: string; kind: "plain" | "key" | "string" | "literal" | "number" }[] {
  const out: { text: string; kind: "plain" | "key" | "string" | "literal" | "number" }[] = [];
  let last = 0;
  for (const m of src.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: src.slice(last, at), kind: "plain" });
    if (m[1] != null) {
      out.push({ text: m[1], kind: m[2] ? "key" : "string" });
      if (m[2]) out.push({ text: m[2], kind: "plain" });
    } else if (m[3] != null) out.push({ text: m[3], kind: "literal" });
    else out.push({ text: m[4], kind: "number" });
    last = at + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last), kind: "plain" });
  return out;
}

const COLOR = {
  plain: "text-dim",
  key: "text-info",
  string: "text-ok",
  literal: "text-accent",
  number: "text-warn",
} as const;


export function JsonView({
  source,
  empty,
  maxHeight = 520,
}: {
  source: string;
  empty?: ReactNode;
  maxHeight?: number;
}) {
  const { t } = useTranslation("webhooks");
  const [copied, setCopied] = useState(false);
  const pretty = useMemo(() => {
    const s = source.trim();
    if (!s.startsWith("{") && !s.startsWith("[")) return null;
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch {
      return null;
    }
  }, [source]);
  const parts = useMemo(() => (pretty ? tokenize(pretty) : null), [pretty]);
  if (!source.trim())
    return (
      <div className="rounded-[var(--radius)] border border-dashed border-line px-3 py-2 text-[12px] text-faint">
        {empty}
      </div>
    );
  const lines = (pretty ?? source).split("\n").length;
  return (
    <div className="relative rounded-[var(--radius)] border border-line bg-surface-2">
      <div className="flex items-center justify-between border-b border-line px-3 py-1">
        <span className="num text-[10.5px] text-faint">
          {pretty ? "JSON" : "TEXT"} ·{" "}
          {t("delivery.size", { lines, kb: (new Blob([source]).size / 1024).toFixed(1) })}
        </span>
        <IconButton
          icon={copied ? Check : Copy}
          label={copied ? t("delivery.copied") : t("delivery.copy")}
          size={12}
          className="size-6"
          onClick={() => {
            void navigator.clipboard.writeText(pretty ?? source);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        />
      </div>
      <pre
        className="num overflow-auto px-3 py-2 text-[11.5px] leading-[1.55] whitespace-pre"
        style={{ maxHeight }}
      >
        {parts
          ? parts.map((p, i) =>
              p.kind === "plain" ? (
                p.text
              ) : (
                <span key={i} className={COLOR[p.kind]}>
                  {p.text}
                </span>
              ),
            )
          : source}
      </pre>
    </div>
  );
}
