import { useEffect } from "react";
import { events } from "@/core/ipc";
import { queryClient } from "@/core/query";
import { refreshPull } from "./api";


export function PullsQueueSync() {
  useEffect(() => {
    const seen = new Set<string>();
    let first = true;
    const un = events.queueSnapshot.listen(({ payload }) => {
      const fresh = payload.items.filter((i) => i.status === "done" && !seen.has(i.id));
      for (const i of payload.items) if (i.status === "done") seen.add(i.id);
      if (first) {
        first = false;
        return;
      }
      const prs = fresh.filter((i) => i.action.kind.startsWith("pr_") || i.action.kind.startsWith("issue_"));
      for (const i of prs) if ("number" in i.action) void refreshPull(i.repo, i.action.number);
      if (
        prs.some(
          (i) =>
            i.action.kind === "pr_merge" || i.action.kind === "pr_close" || i.action.kind === "pr_reopen",
        )
      ) {
        setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["pulls", "search"] }), 1500);
      }
    });
    return () => void un.then((f) => f());
  }, []);
  return null;
}
