import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, Input, Label, Mark } from "@/ui";
import { sameSignature, signPayload } from "./signature";


export function SignatureDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["webhooks", "common"]);
  const [secret, setSecret] = useState("");
  const [payload, setPayload] = useState("");
  const [header, setHeader] = useState("");
  const [computed, setComputed] = useState("");
  useEffect(() => {
    let alive = true;
    if (!secret || !payload) return setComputed("");
    void signPayload(secret, payload).then((s) => alive && setComputed(s));
    return () => {
      alive = false;
    };
  }, [secret, payload]);
  const verdict = computed && header.trim() ? sameSignature(computed, header) : null;
  return (
    <Dialog open onClose={onClose} width={640} kicker={t("title")} title={t("sig.title")}>
      <div className="space-y-3">
        <div>
          <Label hint={t("sig.secretHint")}>{t("sig.secret")}</Label>
          <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} className="num" />
        </div>
        <div>
          <Label hint={t("sig.payloadHint")}>{t("sig.payload")}</Label>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={7}
            className="num w-full resize-y rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2.5 py-2 text-[12px] outline-none focus:border-accent"
          />
        </div>
        <div>
          <Label hint="X-Hub-Signature-256">{t("sig.header")}</Label>
          <Input
            value={header}
            onChange={(e) => setHeader(e.target.value)}
            placeholder="sha256=…"
            className="num"
          />
        </div>
        {computed && (
          <div className="rounded-[var(--radius)] border border-line px-3 py-2 text-[12px]">
            <div className="annot !text-[9.5px]">{t("sig.computed")}</div>
            <div className="num break-all text-dim">{computed}</div>
            {verdict !== null && (
              <div className={`mt-1.5 flex items-center gap-2 ${verdict ? "text-ok" : "text-danger"}`}>
                <Mark glyph={verdict ? "tick" : "cross"} tone={verdict ? "ok" : "danger"} size={11} />
                {verdict ? t("sig.match") : t("sig.noMatch")}
              </div>
            )}
          </div>
        )}
        <p className="text-[11.5px] text-faint">{t("sig.note")}</p>
      </div>
    </Dialog>
  );
}
