import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EyeOff } from "lucide-react";
import { Button, Dialog, Input, Label } from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { REASONS, reasonKey } from "./model";
import { useSecurityUi } from "./store";


export function DismissDialog() {
  const { t } = useTranslation(["security", "common"]);
  const req = useSecurityUi((s) => s.dismiss);
  const set = useSecurityUi((s) => s.set);
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  useEffect(() => {
    setReason(req ? REASONS[req.kind][0] : "");
    setComment("");
  }, [req]);
  if (!req) return null;
  const close = () => set({ dismiss: null });
  const secret = req.kind === "secret";
  const submit = () => {
    const items = req.alerts.map((a) => ({
      repo: a.repo,
      action: {
        kind: "alert_set" as const,
        alert: req.kind,
        number: a.number,
        open: false,
        reason,
        comment: comment.trim() || null,
        title: a.title,
      },
    }));
    close();
    useQueue.getState().requestRun(items);
  };
  const repos = new Set(req.alerts.map((a) => a.repo)).size;
  return (
    <Dialog
      open
      onClose={close}
      width={520}
      kicker={t(`kind.${req.kind}`)}
      title={
        secret
          ? t("dismissDialog.resolveTitle", { count: req.alerts.length })
          : t("dismissDialog.title", { count: req.alerts.length })
      }
      footer={
        <>
          <span className="num mr-auto text-[11.5px] text-faint">{t("repos", { count: repos })}</span>
          <Button variant="ghost" onClick={close}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="primary" icon={EyeOff} onClick={submit}>
            {secret ? t("resolve") : t("dismiss")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {req.alerts.length === 1 && <p className="text-[12.5px] text-dim">{req.alerts[0].title}</p>}
        <div>
          <Label>{t("dismissDialog.reason")}</Label>
          <div className="space-y-1">
            {REASONS[req.kind].map((r) => (
              <label
                key={r}
                className="flex cursor-default items-start gap-2 rounded-[3px] px-2 py-1.5 hover:bg-surface-2"
              >
                <input
                  type="radio"
                  name="reason"
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="mt-1 accent-[var(--accent)]"
                />
                <span>
                  <span className="block text-[13px]">{t(`reasons.${reasonKey(r)}.label`)}</span>
                  <span className="block text-[11.5px] text-faint">{t(`reasons.${reasonKey(r)}.hint`)}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label hint={t("dismissDialog.commentHint")}>{t("dismissDialog.comment")}</Label>
          <Input value={comment} maxLength={280} onChange={(e) => setComment(e.target.value)} />
        </div>
        {secret && reason !== "revoked" && (
          <p className="text-[12px] text-warn">{t("dismissDialog.secretWarn")}</p>
        )}
      </div>
    </Dialog>
  );
}
