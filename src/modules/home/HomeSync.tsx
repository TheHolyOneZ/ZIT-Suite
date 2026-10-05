import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { events } from "@/core/ipc";
import { errorMessage, errorDetail } from "@/core/errors";
import { queryClient } from "@/core/query";
import { toast } from "@/core/store/toasts";
import { homeKey, refreshAll, refreshLocal } from "./api";
import type { Workspace } from "@/core/ipc";


export function HomeSync() {
  const { t } = useTranslation("home");
  useEffect(() => {
    const name = (id: string) =>
      queryClient.getQueryData<Workspace[]>(homeKey.list)?.find((w) => w.id === id)?.name ?? "";
    const un1 = events.workspaceChanged.listen(({ payload }) => refreshLocal(payload.id));
    const un2 = events.workspaceAutoCommit.listen(({ payload: p }) => {
      if (p.commit) {
        toast({
          kind: p.error ? "warning" : "success",
          title: t(p.pushed ? "events.autoSavedUploaded" : "events.autoSaved", { name: name(p.id) }),
          body: p.error ? errorMessage(p.error) : p.commit.summary,
        });
        refreshAll(p.id);
      } else if (p.error) {
        toast({
          kind: "error",
          title: t("events.autoFailed", { name: name(p.id) }),
          body: `${errorMessage(p.error)}${errorDetail(p.error) ? ` — ${errorDetail(p.error)}` : ""}`,
        });
      }
    });
    return () => {
      void un1.then((f) => f());
      void un2.then((f) => f());
    };
  }, [t]);
  return null;
}
