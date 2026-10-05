import { useEffect, useRef } from "react";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { Thread } from "@/core/ipc";
import { tDynamic } from "@/core/i18n";
import { useUnreadCount } from "./api";
import { newlyUrgent, reasonKey } from "./model";
import { useInboxPrefs } from "./store";


export function InboxSync() {
  const { data } = useUnreadCount();
  const desktop = useInboxPrefs((s) => s.desktop);
  const prev = useRef<Thread[] | undefined>(undefined);
  useEffect(() => {
    if (!data) return;
    const fresh = newlyUrgent(prev.current, data);
    prev.current = data;
    if (!desktop || !fresh.length) return;
    void (async () => {
      try {
        let ok = await isPermissionGranted();
        if (!ok) ok = (await requestPermission()) === "granted";
        if (!ok) return;
        const first = fresh[0];
        sendNotification({
          title:
            fresh.length === 1
              ? `${tDynamic(`inbox:reason.${reasonKey(first.reason)}`)} · ${first.repo}`
              : tDynamic("inbox:desktop.many", { count: fresh.length }),
          body:
            fresh.length === 1
              ? first.title
              : fresh
                  .slice(0, 3)
                  .map((t) => t.title)
                  .join(" · "),
        });
      } catch {
      }
    })();
  }, [data, desktop]);
  return null;
}
