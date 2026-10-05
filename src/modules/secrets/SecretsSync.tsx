import { useEffect } from "react";
import { events } from "@/core/ipc";
import { refreshRepoSecrets } from "./api";

const KINDS = new Set(["secret_set", "secret_delete", "var_set", "var_delete", "env_upsert", "env_delete"]);


export function SecretsSync() {
  useEffect(() => {
    const seen = new Set<string>();
    let first = true;
    const un = events.queueSnapshot.listen(({ payload }) => {
      const fresh = payload.items.filter(
        (i) => (i.status === "done" || i.status === "failed") && !seen.has(i.id),
      );
      for (const i of payload.items) if (i.status === "done" || i.status === "failed") seen.add(i.id);
      if (first) {
        first = false;
        return;
      }
      for (const r of new Set(fresh.filter((i) => KINDS.has(i.action.kind)).map((i) => i.repo)))
        void refreshRepoSecrets(r).catch(() => undefined);
    });
    return () => void un.then((f) => f());
  }, []);
  return null;
}
