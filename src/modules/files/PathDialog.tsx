import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FilePlus2, Pencil } from "lucide-react";
import type { TreeItem } from "@/core/ipc";
import { Button, Dialog, Input, Label } from "@/ui";
import { stageRename, type StagedMap } from "./model";

export type PathRequest = { mode: "new"; path: string } | { mode: "rename"; from: string; path: string };

const validPath = (p: string) =>
  !!p &&
  !p.startsWith("/") &&
  !p.endsWith("/") &&
  p.split("/").every((s) => s && s !== "." && s !== ".." && s !== ".git") &&
  ![...p].some((c) => c === "\\" || c.charCodeAt(0) < 32);


export function PathDialog({
  req,
  taken,
  items,
  staged,
  onStage,
  onOpen,
  onClose,
}: {
  k: string;
  req: PathRequest;
  taken: Set<string>;
  items: TreeItem[];
  staged: StagedMap;
  onStage: (s: StagedMap) => void;
  onOpen: (p: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["files", "common"]);
  const [path, setPath] = useState(req.path);
  const p = path.trim();
  const clash = p !== (req.mode === "rename" ? req.from : "") && taken.has(p);
  const ok = validPath(p) && !clash && (req.mode === "new" || p !== req.from);
  const submit = () => {
    if (!ok) return;
    if (req.mode === "new") {
      onStage({ ...staged, [p]: { kind: "new", text: "" } });
      onOpen(p);
    } else {
      onStage(
        stageRename(
          staged,
          req.from,
          p,
          items.some((i) => i.path === req.from),
        ),
      );
      onOpen(p);
    }
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      width={520}
      kicker={t("title")}
      title={req.mode === "new" ? t("path.newTitle") : t("path.renameTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={req.mode === "new" ? FilePlus2 : Pencil}
            disabled={!ok}
            onClick={submit}
          >
            {req.mode === "new" ? t("path.create") : t("path.rename")}
          </Button>
        </>
      }
    >
      <Label hint={t("path.hint")}>{t("path.label")}</Label>
      <Input
        autoFocus
        value={path}
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="docs/notes.md"
        className="num"
      />
      {clash && <p className="mt-1 text-[11.5px] text-warn">{t("path.exists")}</p>}
      {p && !p.endsWith("/") && !validPath(p) && (
        <p className="mt-1 text-[11.5px] text-warn">{t("path.invalid")}</p>
      )}
    </Dialog>
  );
}
