import { useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, unwrap, type Source, type Workspace } from "@/core/ipc";
import { errorDetail, errorMessage, toastError } from "@/core/errors";
import { queryClient } from "@/core/query";
import { toast } from "@/core/store/toasts";
import { homeKey, refreshAll, refreshLocal } from "./api";
import { useHomeUi } from "./store";

type Busy = "save" | "upload" | "latest" | "check" | null;


export function useWorkspaceActions(ws: Workspace) {
  const { t } = useTranslation(["home", "common"]);
  const [busy, setBusy] = useState<Busy>(null);
  const run = async <T>(kind: Exclude<Busy, null>, fn: () => Promise<T>): Promise<T | undefined> => {
    if (busy) return undefined;
    setBusy(kind);
    try {
      return await fn();
    } catch (e) {
      toastError(e);
      return undefined;
    } finally {
      setBusy(null);
    }
  };


  const save = (message: string, paths: string[] | null, upload: boolean) =>
    run("save", async () => {
      const r = await unwrap(commands.wsCommit(ws.id, paths, message, upload && !!ws.push_repo));
      if (r.push_error)
        toast({
          kind: "warning",
          title: t("changes.uploadFailed"),
          body: `${errorMessage(r.push_error)}${errorDetail(r.push_error) ? ` — ${errorDetail(r.push_error)}` : ""}`,
        });
      else
        toast({
          kind: "success",
          title: r.pushed
            ? t("changes.uploaded", { repo: ws.push_repo })
            : t("changes.saved", { summary: r.commit.summary }),
        });
      if (r.pushed) refreshAll(ws.id);
      else refreshLocal(ws.id);
      return true;
    });

  const upload = () =>
    run("upload", async () => {
      await unwrap(commands.wsPush(ws.id));
      toast({ kind: "success", title: t("changes.uploaded", { repo: ws.push_repo }) });
      refreshAll(ws.id);
    });

  const getLatest = (source: Source, branch: string) =>
    run("latest", async () => {
      const r = await commands.wsGetLatest(ws.id, source, branch);

      if (r.status === "error" && r.error.code === "workspace.conflicts") {
        toast({ kind: "warning", title: errorMessage(r.error), body: t("conflicts.intro") });
        useHomeUi.getState().set({ conflict: { id: ws.id, source, branch } });
        return;
      }
      const kind = await unwrap(Promise.resolve(r));
      toast({ kind: "success", title: t(`latest.${kind}`) });
      refreshAll(ws.id);
    });

  const check = () => run("check", () => queryClient.refetchQueries({ queryKey: homeKey.sync(ws.id) }));

  return { busy, save, upload, getLatest, check };
}
