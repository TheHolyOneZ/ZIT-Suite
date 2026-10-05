import { useTranslation } from "react-i18next";
import { StatusSegment } from "@/app/StatusSegment";
import { useSheets } from "@/core/sheets/store";
import { Mark } from "@/ui";
import { useUnreadCount } from "./api";
import { isUrgent } from "./model";


export function InboxStatusItem() {
  const { t } = useTranslation("inbox");
  const { count, data } = useUnreadCount();
  const open = useSheets((s) => s.open);
  const urgent = (data ?? []).filter(isUrgent).length;
  if (!count) return null;
  return (
    <StatusSegment onClick={() => open("inbox")} title={t("title")}>
      <Mark glyph={urgent ? "open" : "equal"} tone={urgent ? "accent" : "idle"} size={10} />
      <span className="text-faint">{t("statusBar.label")}</span>
      <span>{count}</span>
      {urgent > 0 && <span className="text-accent">· {t("statusBar.urgent", { count: urgent })}</span>}
    </StatusSegment>
  );
}
