import { useTranslation } from "react-i18next";
import type { PullSummary } from "@/core/ipc";
import { Badge, Mark, type Glyph, type Tone } from "@/ui";

type StateKey = "open" | "draft" | "merged" | "closed";

export function pullStateKey(p: {
  state: string;
  is_draft?: boolean;
  draft?: boolean;
  merged?: boolean;
}): StateKey {
  const s = p.state.toLowerCase();
  if (s === "merged" || p.merged) return "merged";
  if (s === "closed") return "closed";
  return p.is_draft || p.draft ? "draft" : "open";
}

const STATE: Record<StateKey, { glyph: Glyph; tone: Tone }> = {
  open: { glyph: "open", tone: "ok" },
  draft: { glyph: "void", tone: "idle" },
  merged: { glyph: "merge", tone: "done" },
  closed: { glyph: "notPlanned", tone: "danger" },
};

export function PullStateMark({
  pull,
  size = 13,
}: {
  pull: Parameters<typeof pullStateKey>[0];
  size?: number;
}) {
  const { t } = useTranslation("pulls");
  const k = pullStateKey(pull);
  return <Mark glyph={STATE[k].glyph} tone={STATE[k].tone} size={size} title={t(`state.${k}`)} />;
}

const CHECKS: Record<string, { glyph: Glyph; tone: Tone; key: "passing" | "failing" | "running" }> = {
  SUCCESS: { glyph: "tick", tone: "ok", key: "passing" },
  FAILURE: { glyph: "cross", tone: "danger", key: "failing" },
  ERROR: { glyph: "cross", tone: "danger", key: "failing" },
  PENDING: { glyph: "running", tone: "accent", key: "running" },
  EXPECTED: { glyph: "running", tone: "accent", key: "running" },
};

export function ChecksMark({ state, size = 12 }: { state: string | null | undefined; size?: number }) {
  const { t } = useTranslation("pulls");
  const c = state ? CHECKS[state.toUpperCase()] : undefined;
  if (!c) return null;
  return <Mark glyph={c.glyph} tone={c.tone} size={size} title={t(`checks.${c.key}`)} />;
}

export function ReviewBadge({ decision }: { decision: PullSummary["review_decision"] }) {
  const { t } = useTranslation("pulls");
  if (!decision) return null;
  const map = {
    APPROVED: { tone: "ok" as Tone, key: "approved" },
    CHANGES_REQUESTED: { tone: "warn" as Tone, key: "changes" },
    REVIEW_REQUIRED: { tone: "idle" as Tone, key: "required" },
  } as const;
  const m = map[decision as keyof typeof map];
  if (!m) return null;
  return (
    <Badge tone={m.tone} mono>
      {t(`review.${m.key}`)}
    </Badge>
  );
}
