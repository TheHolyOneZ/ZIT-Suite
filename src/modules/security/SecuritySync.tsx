import { useEffect } from "react";
import { events } from "@/core/ipc";
import { refreshRepoSecurity } from "./api";

const KINDS = new Set(["security_feature", "alert_set"]);


export function SecuritySync() {
  useEffect(() => {
    const seen = new Set<string>();
    let first = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const un = events.queueSnapshot.listen(({ payload }) => {
      const fresh = payload.items.filter(
        (i) => (i.status === "done" || i.status === "failed") && !seen.has(i.id),
      );
      for (const i of payload.items) if (i.status === "done" || i.status === "failed") seen.add(i.id);
      if (first) {
        first = false;
        return;
      }
      const repos = new Set(fresh.filter((i) => KINDS.has(i.action.kind)).map((i) => i.repo));
      for (const r of repos) {
        void refreshRepoSecurity(r).catch(() => undefined);
        timers.push(setTimeout(() => void refreshRepoSecurity(r).catch(() => undefined), 8_000));
      }
    });
    return () => {
      timers.forEach(clearTimeout);
      void un.then((f) => f());
    };
  }, []);
  return null;
}
