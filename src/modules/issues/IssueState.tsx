import { useTranslation } from "react-i18next";
import type { Issue } from "@/core/ipc";
import { Mark, type Glyph, type Tone } from "@/ui";

export function issueGlyph(i: Pick<Issue, "state" | "state_reason">): {
  glyph: Glyph;
  tone: Tone;
  key: "open" | "completed" | "notPlanned";
} {
  if (i.state === "open") return { glyph: "open", tone: "ok", key: "open" };
  if (i.state_reason === "not_planned") return { glyph: "notPlanned", tone: "idle", key: "notPlanned" };
  return { glyph: "closed", tone: "done", key: "completed" };
}

export function IssueStateMark({
  issue,
  size = 13,
}: {
  issue: Pick<Issue, "state" | "state_reason">;
  size?: number;
}) {
  const { t } = useTranslation("issues");
  const g = issueGlyph(issue);
  return <Mark glyph={g.glyph} tone={g.tone} size={size} title={t(`state.${g.key}`)} />;
}
