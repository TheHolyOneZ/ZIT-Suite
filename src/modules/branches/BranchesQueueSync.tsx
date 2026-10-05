import { useEffect } from "react";
import { events } from "@/core/ipc";
import { reloadBranches } from "./api";


export function BranchesQueueSync() {
  useEffect(() => {
    const seen = new Set<string>();
    let first = true;
    const un = events.queueSnapshot.listen(({ payload }) => {
      const finished = payload.items.filter(
        (i) => (i.status === "done" || i.status === "failed") && !seen.has(i.id),
      );
      for (const i of finished) seen.add(i.id);
      if (first) {
        first = false;
        return;
      }
      const repos = new Set(finished.filter((i) => i.action.kind.startsWith("branch_")).map((i) => i.repo));
      for (const r of repos) reloadBranches(r);
    });
    return () => void un.then((f) => f());
  }, []);
  return null;
}
