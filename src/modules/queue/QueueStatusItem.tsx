import { useTranslation } from "react-i18next";
import { useSheets } from "@/core/sheets/store";
import { Mark } from "@/ui";
import { phaseGlyph } from "./QueuePage";
import { StatusSegment } from "@/app/StatusSegment";
import { useQueue } from "./store";

export function QueueStatusItem() {
  const { t } = useTranslation("queue");
  const { items, phase, grace_remaining } = useQueue((s) => s.snapshot);
  const navigate = useSheets((s) => s.open);
  const open = items.filter((i) => i.status === "pending" || i.status === "running").length;
  const failed = items.filter((i) => i.status === "failed").length;
  if (items.length === 0) return null;

  const tone =
    phase === "running"
      ? "accent"
      : phase === "grace"
        ? "warn"
        : failed
          ? "danger"
          : phase === "paused"
            ? "warn"
            : "idle";
  return (
    <StatusSegment onClick={() => navigate("queue")} title={t("title")}>
      <Mark glyph={failed && phase === "idle" ? "cross" : phaseGlyph[phase]} tone={tone} size={10} />
      <span className="text-faint">{t("statusBar.label")}</span>
      {phase === "grace" ? (
        <span className="text-warn">T−{grace_remaining}s</span>
      ) : (
        <span>{t("statusBar.open", { count: open })}</span>
      )}
      {failed > 0 && <span className="text-danger">· {t("statusBar.failed", { count: failed })}</span>}
    </StatusSegment>
  );
}
