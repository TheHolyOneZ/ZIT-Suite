import { useEffect } from "react";
import { events } from "@/core/ipc";
import { refreshRepos } from "./api";


export function ReposQueueSync() {
  useEffect(() => {
    let lastDone: Set<string> | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const un = events.queueSnapshot.listen(({ payload }) => {
      const done = new Set(payload.items.filter((i) => i.status === "done").map((i) => i.id));
      const grew = lastDone !== null && [...done].some((id) => !lastDone!.has(id));
      lastDone = done;
      if (grew) {
        clearTimeout(timer);
        timer = setTimeout(() => void refreshRepos(), 1200);
      }
    });
    return () => {
      clearTimeout(timer);
      void un.then((f) => f());
    };
  }, []);
  return null;
}
