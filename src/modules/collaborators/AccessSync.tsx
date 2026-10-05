import { useEffect } from "react";
import { events } from "@/core/ipc";
import { refreshRepoAccess } from "./api";


export function AccessSync() {
  useEffect(() => {
    const seen = new Set<string>();
    let first = true;
    const un = events.queueSnapshot.listen(({ payload }) => {
      const fresh = payload.items.filter((i) => (i.status === "done" || i.status === "failed") && !seen.has(i.id));
      for (const i of payload.items) if (i.status === "done" || i.status === "failed") seen.add(i.id);
      if (first) {
        first = false;
        return;
      }
      const repos = new Set(fresh.filter((i) => i.action.kind.startsWith("collab_") || i.action.kind === "invite_cancel").map((i) => i.repo));
      for (const r of repos) void refreshRepoAccess(r).catch(() => undefined);
    });
    return () => void un.then((f) => f());
  }, []);
  return null;
}
