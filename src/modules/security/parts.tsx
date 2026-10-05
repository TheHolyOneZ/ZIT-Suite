import { useTranslation } from "react-i18next";
import { Bug, Code2, KeyRound, type LucideIcon } from "lucide-react";
import type { AlertKind, Feature, FeatureState, Severity } from "@/core/ipc";
import { cn } from "@/core/cn";
import { Badge, Mark, type Glyph, type Tone } from "@/ui";
import type { SeverityCounts } from "./model";

export const SEVERITY_LOOK: Record<Severity, { glyph: Glyph; tone: Tone }> = {
  critical: { glyph: "block", tone: "danger" },
  high: { glyph: "warn", tone: "danger" },
  medium: { glyph: "warn", tone: "warn" },
  low: { glyph: "info", tone: "info" },
  unknown: { glyph: "void", tone: "idle" },
};

export const KIND_ICON: Record<AlertKind, LucideIcon> = { dependency: Bug, code: Code2, secret: KeyRound };

export function SeverityMark({ s, size }: { s: Severity; size?: number }) {
  const { t } = useTranslation("security");
  return (
    <Mark
      glyph={SEVERITY_LOOK[s].glyph}
      tone={SEVERITY_LOOK[s].tone}
      size={size}
      title={t(`severity.${s}`)}
    />
  );
}

export function SeverityBadge({ s }: { s: Severity }) {
  const { t } = useTranslation("security");
  return (
    <Badge tone={SEVERITY_LOOK[s].tone} mono>
      {t(`severity.${s}`)}
    </Badge>
  );
}

export function KindLabel({ kind, className }: { kind: AlertKind; className?: string }) {
  const { t } = useTranslation("security");
  const Icon = KIND_ICON[kind];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] text-dim", className)}>
      <Icon size={12} />
      {t(`kind.${kind}`)}
    </span>
  );
}


export function FeatureMark({
  state,
  gap,
  size = 12,
}: {
  state: FeatureState;
  gap?: boolean;
  size?: number;
}) {
  const { t } = useTranslation("security");
  if (state === "on") return <Mark glyph="tick" tone="ok" size={size} title={t("state.on")} />;
  if (state === "off")
    return (
      <Mark
        glyph={gap ? "cross" : "void"}
        tone={gap ? "warn" : "idle"}
        size={size}
        title={gap ? t("state.gap") : t("state.off")}
      />
    );
  return <Mark glyph="slash" tone="idle" size={size} title={t("state.unavailable")} />;
}


export function Counts({ c, className }: { c: SeverityCounts; className?: string }) {
  const { t } = useTranslation("security");
  const parts = (["critical", "high", "medium", "low"] as const).filter((s) => c[s] > 0);
  if (!parts.length) return <span className={cn("text-[11.5px] text-ok", className)}>{t("noOpen")}</span>;
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      {parts.map((s) => (
        <span key={s} className="flex items-center gap-1" title={t(`severity.${s}`)}>
          <SeverityMark s={s} size={11} />
          <span className="num text-[11.5px]">{c[s]}</span>
        </span>
      ))}
    </span>
  );
}

export function Grade({ g, score }: { g: string; score: number }) {
  const tone: Tone = g === "A" ? "ok" : g === "B" ? "info" : g === "C" ? "warn" : "danger";
  return (
    <span title={String(score)}>
      <Badge tone={tone} mono className="w-7 justify-center">
        {g}
      </Badge>
    </span>
  );
}

export const FEATURE_ORDER: Feature[] = [
  "dependabot_alerts",
  "security_updates",
  "secret_scanning",
  "push_protection",
  "private_reporting",
  "code_scanning",
];
