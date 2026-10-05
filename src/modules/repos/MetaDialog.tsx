import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";
import { Button, Dialog, Input, Label } from "@/ui";
import { requestQueue } from "@/modules/queue/store";
import { parseTopics } from "@/modules/home/ghmodel";


export function MetaDialog({
  kind,
  repos,
  onClose,
}: {
  kind: "description" | "topics";
  repos: string[];
  onClose: () => void;
}) {
  const { t } = useTranslation(["repos", "common"]);
  const [description, setDescription] = useState("");
  const [add, setAdd] = useState("");
  const [remove, setRemove] = useState("");
  const addList = parseTopics(add);
  const removeList = parseTopics(remove);
  const ok = kind === "description" ? true : addList.length + removeList.length > 0;
  const run = () => {
    requestQueue(
      repos,
      kind === "description"
        ? { kind: "repo_description", description: description.trim() }
        : { kind: "repo_topics", add: addList, remove: removeList },
    );
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      width={520}
      kicker={t("bulkMeta.kicker", { count: repos.length })}
      title={kind === "description" ? t("bulkMeta.descriptionTitle") : t("bulkMeta.topicsTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="primary" icon={Play} disabled={!ok} onClick={run}>
            {t("bulkMeta.review", { count: repos.length })}
          </Button>
        </>
      }
    >
      {kind === "description" ? (
        <div>
          <Label hint={t("bulkMeta.descriptionHint")}>{t("create.description")}</Label>
          <Input
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={350}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label hint={t("bulkMeta.topicsHint")}>{t("bulkMeta.add")}</Label>
            <Input
              autoFocus
              value={add}
              onChange={(e) => setAdd(e.target.value)}
              placeholder="rust, tauri, desktop-app"
            />
            {addList.length > 0 && <p className="num mt-1 text-[11.5px] text-ok">+ {addList.join("  ")}</p>}
          </div>
          <div>
            <Label>{t("bulkMeta.remove")}</Label>
            <Input value={remove} onChange={(e) => setRemove(e.target.value)} placeholder="old-topic" />
            {removeList.length > 0 && (
              <p className="num mt-1 text-[11.5px] text-danger">− {removeList.join("  ")}</p>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
