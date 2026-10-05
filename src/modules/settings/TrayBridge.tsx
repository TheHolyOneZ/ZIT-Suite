import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/core/ipc";
import { useSession } from "@/core/store/session";
import { useQueue } from "@/modules/queue/store";
import { useSchedules } from "@/modules/scheduler/api";


export function TrayBridge() {
  const { t, i18n } = useTranslation();
  const items = useQueue((s) => s.snapshot.items);
  const phase = useQueue((s) => s.snapshot.phase);
  const schedules = useSchedules().data;
  const account = useSession((s) => s.session?.active);

  useEffect(() => {
    void commands.traySetLabels({
      show: t("tray.show"),
      hide: t("tray.hide"),
      quit: t("tray.quit"),
      tooltip: t("tray.tooltip"),
      hidden_title: t("tray.hiddenTitle"),
      hidden_body: t("tray.hiddenBody"),
    });
  }, [t, i18n.language]);

  const left = items.filter((i) => i.status === "pending" || i.status === "running").length;
  const next = (schedules ?? [])
    .filter((s) => s.enabled && s.next_run && s.account_id === account)
    .sort((a, b) => a.next_run!.localeCompare(b.next_run!))[0];
  const when = next?.next_run
    ? new Intl.DateTimeFormat(i18n.language, { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(
        new Date(next.next_run),
      )
    : "";
  const status =
    left > 0 && phase !== "idle"
      ? t("tray.queue", { count: left })
      : next
        ? t("tray.next", { name: next.name, when })
        : t("tray.idle");

  useEffect(() => {
    void commands.traySetStatus(status);
  }, [status]);
  return null;
}
