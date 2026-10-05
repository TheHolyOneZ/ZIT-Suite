import { useEffect } from "react";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { commands, events } from "@/core/ipc";
import { tDynamic } from "@/core/i18n";
import { useSettings } from "@/core/store/settings";
import { toast } from "@/core/store/toasts";
import { useQueue } from "./store";

export async function notifyDesktop(title: string, body: string) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) sendNotification({ title, body });
  } catch {
  }
}


export function QueueBridge() {
  useEffect(() => {
    let alive = true;
    commands.queueGet().then((s) => alive && useQueue.getState().setSnapshot(s));
    const unSnap = events.queueSnapshot.listen((e) => useQueue.getState().setSnapshot(e.payload));
    const unDone = events.queueFinished.listen(({ payload: { done, failed } }) => {
      const title = tDynamic(failed ? "queue:finished.withFailures" : "queue:finished.title");
      const body = tDynamic("queue:finished.body", { done, failed });
      toast({ kind: failed ? "warning" : "success", title, body });

      const s = useSettings.getState();
      if (s.desktopNotifications && ((failed && s.notifyOnFailure) || (!failed && s.notifyOnFinish))) {
        void notifyDesktop(title, body);
      }
    });
    return () => {
      alive = false;
      void unSnap.then((f) => f());
      void unDone.then((f) => f());
    };
  }, []);
  return null;
}
