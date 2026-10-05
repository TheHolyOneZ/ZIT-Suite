import { useEffect } from "react";
import { events } from "@/core/ipc";
import { queryClient } from "@/core/query";
import { refreshIssues } from "./api";


export function IssuesQueueSync() {
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
      const issues = fresh.flatMap((i) =>
        "number" in i.action ? [{ repo: i.repo, number: i.action.number }] : [],
      );
      if (issues.length) void refreshIssues(issues);
      const labelRepos = new Set(fresh.filter((i) => i.action.kind.startsWith("label_")).map((i) => i.repo));
      for (const repo of labelRepos) void queryClient.invalidateQueries({ queryKey: ["labels", repo] });
    });
    return () => void un.then((f) => f());
  }, []);
  return null;
}
