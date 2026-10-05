import { useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { Eye, FilePlus2, FileUp, Pencil, Trash2, Undo2 } from "lucide-react";
import { commands, unwrap } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { Button, IconButton, Input, Markdown } from "@/ui";
import { CodeBox } from "./CodeBox";
import { isMarkdown, type Draft } from "./model";

let seq = 0;
export const newDraft = (name = "", content = ""): Draft => ({
  key: `new-${++seq}`,
  orig: null,
  name,
  content,
  origContent: "",
  removed: false,
});


export function DraftsEditor({ drafts, onChange }: { drafts: Draft[]; onChange: (d: Draft[]) => void }) {
  const { t } = useTranslation("gists");
  const [preview, setPreview] = useState<Set<string>>(new Set());
  const patch = (key: string, p: Partial<Draft>) =>
    onChange(drafts.map((d) => (d.key === key ? { ...d, ...p } : d)));
  const fromDisk = async () => {
    const picked = await open({ multiple: true, directory: false });
    if (!picked) return;
    const added: Draft[] = [];
    for (const path of Array.isArray(picked) ? picked : [picked]) {
      try {
        added.push(
          newDraft(path.split(/[\\/]/).pop() ?? "file.txt", await unwrap(commands.readTextFile(path))),
        );
      } catch (e) {
        toastError(e);
      }
    }
    onChange([...drafts, ...added]);
  };
  return (
    <div className="space-y-3">
      {drafts.map((d) => {
        const md = isMarkdown(d.name) && preview.has(d.key);
        return (
          <div key={d.key} className={cn("space-y-1.5", d.removed && "opacity-50")}>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  value={d.name}
                  disabled={d.removed}
                  onChange={(e) => patch(d.key, { name: e.target.value.replace(/\//g, "") })}
                  placeholder={t("editor.namePlaceholder")}
                  className="num !h-8"
                />
              </div>
              {isMarkdown(d.name) && !d.removed && (
                <IconButton
                  icon={md ? Pencil : Eye}
                  label={md ? t("editor.edit") : t("editor.preview")}
                  size={13}
                  className="size-8"
                  onClick={() =>
                    setPreview((s) =>
                      s.has(d.key) ? new Set([...s].filter((x) => x !== d.key)) : new Set([...s, d.key]),
                    )
                  }
                />
              )}
              <IconButton
                icon={d.removed ? Undo2 : Trash2}
                label={d.removed ? t("editor.restore") : t("editor.remove")}
                size={13}
                className={d.removed ? "size-8" : "size-8 hover:text-danger"}
                onClick={() =>
                  d.orig == null && !d.removed
                    ? onChange(drafts.filter((x) => x.key !== d.key))
                    : patch(d.key, { removed: !d.removed })
                }
              />
            </div>
            {d.removed ? (
              <p className="text-[11.5px] text-danger">{t("editor.willDelete")}</p>
            ) : md ? (
              <div className="max-h-[520px] overflow-auto rounded-[var(--radius)] border border-line p-3">
                <Markdown source={d.content} className="text-[12.5px]" />
              </div>
            ) : (
              <CodeBox value={d.content} onChange={(content) => patch(d.key, { content })} />
            )}
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button size="sm" icon={FilePlus2} onClick={() => onChange([...drafts, newDraft()])}>
          {t("editor.addFile")}
        </Button>
        <Button size="sm" variant="ghost" icon={FileUp} onClick={() => void fromDisk()}>
          {t("editor.fromDisk")}
        </Button>
      </div>
    </div>
  );
}
