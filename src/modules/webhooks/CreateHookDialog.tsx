import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Webhook } from "lucide-react";
import { Badge, Button, Dialog } from "@/ui";
import { RepoChecklist } from "@/app/RepoChecklist";
import { useQueue } from "@/modules/queue/store";
import { useHookIndex, useHookTargets } from "./api";
import { draftErrors, draftFrom, draftToInput, type HookDraft } from "./draft";
import { HookForm } from "./HookForm";
import { urlKey } from "./model";
import { useHooksUi } from "./store";


export function CreateHookDialog() {
  const { t } = useTranslation(["webhooks", "common"]);
  const req = useHooksUi((s) => s.create);
  const set = useHooksUi((s) => s.set);
  const targets = useHookTargets();
  const { index } = useHookIndex();
  const [draft, setDraft] = useState<HookDraft>(() => draftFrom());
  const [repos, setRepos] = useState<Set<string>>(new Set());
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!req) return;
    setDraft(draftFrom(null, req.config));
    setRepos(new Set(req.repos));
    setTried(false);
  }, [req]);


  const has = useMemo(() => {
    const k = urlKey(draft.url);
    return new Set(
      index.repos.filter((r) => k && r.hooks.some((h) => urlKey(h.url) === k)).map((r) => r.repo),
    );
  }, [index, draft.url]);

  const close = () => set({ create: null });
  const submit = () => {
    setTried(true);
    if (draftErrors(draft).length || repos.size === 0) return;
    const config = draftToInput(draft);
    close();
    useQueue
      .getState()
      .requestRun([...repos].map((repo) => ({ repo, action: { kind: "hook_create", config } })));
  };

  return (
    <Dialog
      open={!!req}
      onClose={close}
      width={940}
      kicker={t("title")}
      title={req?.config ? t("create.copyTitle") : t("create.title")}
      footer={
        <>
          <span className="num mr-auto text-[11.5px] text-faint">
            {t("create.summary", { count: repos.size })}
          </span>
          <Button variant="ghost" onClick={close}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="primary" icon={Webhook} disabled={repos.size === 0} onClick={submit}>
            {t("create.submit")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-6">
        <div>
          <HookForm value={draft} onChange={setDraft} showErrors={tried} />
          <p className="mt-4 text-[11.5px] text-faint">{t("create.note")}</p>
          {draft.secretMode === "set" && draft.secret && (
            <p className="mt-1 text-[11.5px] text-faint">{t("create.secretNote")}</p>
          )}
        </div>
        <RepoChecklist
          repos={targets}
          value={repos}
          onChange={setRepos}
          title={t("create.repos")}
          height={470}
          note={(r) => (has.has(r) ? <Badge tone="info">{t("create.exists")}</Badge> : null)}
        />
      </div>
    </Dialog>
  );
}
