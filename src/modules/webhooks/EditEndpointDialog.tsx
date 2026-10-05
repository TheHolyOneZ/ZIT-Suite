import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { Button, Dialog } from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { useEndpoint } from "./api";
import { draftErrors, draftFrom, draftPatch, isEmptyPatch, type HookDraft } from "./draft";
import { HookForm } from "./HookForm";
import { useHooksUi } from "./store";


export function EditEndpointDialog() {
  const { t } = useTranslation(["webhooks", "common"]);
  const key = useHooksUi((s) => s.edit);
  const set = useHooksUi((s) => s.set);
  const e = useEndpoint(key ?? "");
  const initial = useMemo(() => (e ? draftFrom(e.hooks[0].hook) : draftFrom()), [e]);
  const [draft, setDraft] = useState<HookDraft>(initial);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (key) {
      setDraft(initial);
      setTried(false);
    }


    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const repos = e ? [...new Set(e.hooks.map((h) => h.repo))] : [];
  const patch = draftPatch(initial, draft);
  const close = () => set({ edit: null });
  const submit = () => {
    setTried(true);
    if (!e || draftErrors(draft).length || isEmptyPatch(patch)) return;
    close();
    useQueue
      .getState()
      .requestRun(repos.map((repo) => ({ repo, action: { kind: "hook_update", url: e.url, patch } })));
  };

  return (
    <Dialog
      open={!!key && !!e}
      onClose={close}
      width={620}
      kicker={e?.host}
      title={t("edit.title")}
      footer={
        <>
          <span className="mr-auto text-[11.5px] text-faint">
            {isEmptyPatch(patch) ? t("edit.nothing") : null}
          </span>
          <Button variant="ghost" onClick={close}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="primary" icon={Pencil} disabled={isEmptyPatch(patch)} onClick={submit}>
            {t("edit.submit")}
          </Button>
        </>
      }
    >
      <div>
        <p className="mb-4 text-[12px] text-dim">{t("edit.note", { count: repos.length })}</p>
        <HookForm
          value={draft}
          onChange={setDraft}
          hasSecret={!!e?.hooks.some((h) => h.hook.has_secret)}
          showErrors={tried}
        />
      </div>
    </Dialog>
  );
}
