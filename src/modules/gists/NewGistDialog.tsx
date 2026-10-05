import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileCode2 } from "lucide-react";
import { commands, unwrap } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { sheets } from "@/core/sheets/store";
import { toast } from "@/core/store/toasts";
import { queryClient } from "@/core/query";
import { Button, Checkbox, Dialog, Input, Label } from "@/ui";
import { DraftsEditor, newDraft } from "./DraftsEditor";
import { draftProblem, titleOf, type Draft } from "./model";
import { useGistsUi } from "./store";

export function NewGistDialog() {
  const { t } = useTranslation(["gists", "common"]);
  const openState = useGistsUi((s) => s.creating);
  const set = useGistsUi((s) => s.set);
  const [description, setDescription] = useState("");
  const [isPublic, setPublic] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!openState) return;
    setDescription("");
    setPublic(false);
    setDrafts([newDraft()]);
  }, [openState]);
  const problem = draftProblem(drafts);
  const close = () => set({ creating: false });
  const submit = async () => {
    setBusy(true);
    try {
      const g = await unwrap(
        commands.gistCreate(
          description,
          isPublic,
          drafts.filter((d) => !d.removed).map((d) => ({ name: d.name.trim(), content: d.content })),
        ),
      );
      toast({ kind: "success", title: t("created") });
      close();
      void queryClient.invalidateQueries({ queryKey: ["gists"] });
      sheets.push("gists", "gist", { id: g.id, title: titleOf(g) });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={openState}
      onClose={close}
      width={820}
      kicker={t("title")}
      title={t("newTitle")}
      footer={
        <>
          {problem && <span className="mr-auto text-[11.5px] text-warn">{t(`problem.${problem}`)}</span>}
          <Button variant="ghost" onClick={close}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={FileCode2}
            loading={busy}
            disabled={!!problem}
            onClick={() => void submit()}
          >
            {isPublic ? t("createPublic") : t("createSecret")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>{t("description")}</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
          />
        </div>
        <div>
          <Checkbox
            checked={isPublic}
            onChange={setPublic}
            label={<span className="text-[12.5px]">{t("publicLabel")}</span>}
          />
          <p className="mt-1 text-[11.5px] text-faint">{isPublic ? t("publicHint") : t("secretHint")}</p>
        </div>
        <DraftsEditor drafts={drafts} onChange={setDrafts} />
      </div>
    </Dialog>
  );
}
