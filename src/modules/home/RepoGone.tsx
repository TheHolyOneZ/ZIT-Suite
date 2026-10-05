import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRightLeft, CloudOff, Plus, Settings2, Trash2, Unlink } from "lucide-react";
import { commands, unwrap, type RemoteCompare, type Workspace } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { sheets, useTopSheet } from "@/core/sheets/store";
import { toast } from "@/core/store/toasts";
import { Button, useConfirmClick } from "@/ui";
import { refreshAll, refreshList } from "./api";
import { openWorkspace } from "./WorkspaceCard";


export function RepoGone({
  ws,
  push,
  reference,
  compact,
}: {
  ws: Workspace;
  push?: RemoteCompare | null;
  reference?: RemoteCompare | null;
  compact?: boolean;
}) {
  const { t } = useTranslation(["home", "common"]);
  const [busy, setBusy] = useState<string | null>(null);
  const openId = useTopSheet("home", "workspace")?.id;
  const pushGone = !!push?.missing;
  const pushMoved = push?.renamed_to ?? null;
  const refGone = !!reference?.missing;
  const refMoved = reference?.renamed_to ?? null;
  const remove = useConfirmClick(async () => {
    try {
      await unwrap(commands.wsRemove(ws.id));
      if (openId === ws.id) sheets.pop();
      await refreshList();
      toast({ kind: "success", title: t("settings.removed"), body: t("settings.removeHint") });
    } catch (e) {
      toastError(e);
    }
  });
  if (!pushGone && !pushMoved && !refGone && !refMoved) return null;

  const update = async (key: string, next: Partial<Workspace>, done: string) => {
    setBusy(key);
    try {
      await unwrap(commands.wsUpdate({ ...ws, ...next }));
      await refreshList();
      refreshAll(ws.id);
      toast({ kind: "success", title: done });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const recreate = async () => {
    setBusy("recreate");
    try {
      const w = await unwrap(commands.wsRecreate(ws.id, true));
      await refreshList();
      refreshAll(ws.id);
      toast({ kind: "success", title: t("gone.recreated", { repo: w.push_repo }) });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const settings = () => openWorkspace(ws, "settings");

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const box = (tone: "danger" | "warn", children: React.ReactNode) => (
    <div
      onClick={stop}
      className={cn(
        "space-y-2 rounded-[var(--radius)] border p-2.5 text-[12px]",
        tone === "danger"
          ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]"
          : "border-[color-mix(in_srgb,var(--warn)_45%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)]",
      )}
    >
      {children}
    </div>
  );

  return (
    <div className="space-y-2">
      {pushGone &&
        box(
          "danger",
          <>
            <div className="flex items-start gap-2 text-danger">
              <CloudOff size={14} className="mt-0.5 shrink-0" />
              <span>
                <span className="block font-medium">{t("gone.pushTitle", { repo: push!.slug })}</span>
                {!compact && <span className="block text-dim">{t("gone.pushBody")}</span>}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" icon={Settings2} onClick={settings}>
                {t("gone.choose")}
              </Button>
              <Button
                size="sm"
                icon={Plus}
                loading={busy === "recreate"}
                onClick={() => void recreate()}
                title={t("gone.recreateHint")}
              >
                {t("gone.recreate")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={Unlink}
                loading={busy === "disconnect"}
                onClick={() => void update("disconnect", { push_repo: null }, t("gone.disconnected"))}
              >
                {t("gone.disconnect")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                className={remove.armed ? "text-danger" : undefined}
                onClick={remove.onClick}
              >
                {remove.armed ? t("gone.confirmRemove") : t("gone.remove")}
              </Button>
            </div>
          </>,
        )}
      {pushMoved &&
        box(
          "warn",
          <div className="flex flex-wrap items-center gap-2">
            <ArrowRightLeft size={14} className="shrink-0 text-warn" />
            <span className="min-w-0 flex-1 text-warn">
              {t("gone.renamed", { from: push!.slug, to: pushMoved })}
            </span>
            <Button
              size="sm"
              variant="primary"
              loading={busy === "rename"}
              onClick={() => void update("rename", { push_repo: pushMoved }, t("gone.updated"))}
            >
              {t("gone.useNew")}
            </Button>
          </div>,
        )}
      {(refGone || refMoved) &&
        box(
          "warn",
          <div className="flex flex-wrap items-center gap-2">
            <CloudOff size={14} className="shrink-0 text-warn" />
            <span className="min-w-0 flex-1 text-warn">
              {refMoved
                ? t("gone.refRenamed", { from: reference!.slug, to: refMoved })
                : t("gone.refGone", { repo: reference!.slug })}
            </span>
            {refMoved ? (
              <Button
                size="sm"
                loading={busy === "ref"}
                onClick={() => void update("ref", { reference_repo: refMoved }, t("gone.updated"))}
              >
                {t("gone.useNew")}
              </Button>
            ) : (
              <>
                <Button size="sm" icon={Settings2} onClick={settings}>
                  {t("gone.choose")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Unlink}
                  loading={busy === "ref"}
                  onClick={() => void update("ref", { reference_repo: null }, t("gone.refRemoved"))}
                >
                  {t("gone.removeRef")}
                </Button>
              </>
            )}
          </div>,
        )}
    </div>
  );
}
