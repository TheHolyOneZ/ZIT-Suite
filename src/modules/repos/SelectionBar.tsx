import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  Download,
  Eye,
  EyeOff,
  Hash,
  MoreHorizontal,
  FolderDown,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { Button, IconButton, MenuItem, Popover } from "@/ui";
import { requestQueue } from "@/modules/queue/store";
import { getModule } from "@/core/modules/registry";
import { useHomeUi } from "@/modules/home/store";
import { useReposUi } from "./store";
import { MetaDialog } from "./MetaDialog";
import { TagMenu } from "./TagMenu";


export function SelectionBar() {
  const { t } = useTranslation("repos");
  const selected = useReposUi((s) => s.selected);
  const setSelected = useReposUi((s) => s.setSelected);
  const set = useReposUi((s) => s.set);
  const names = [...selected];
  const [meta, setMeta] = useState<"description" | "topics" | null>(null);

  return (
    <AnimatePresence>
      {names.length > 0 && (
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 16, opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-[var(--radius)] border border-line-strong bg-surface py-1.5 pr-1.5 pl-3 shadow-[var(--shadow)]"
        >
          <span className="num mr-2 flex items-center gap-2 text-[12px]">
            <span className="flex h-5 min-w-5 items-center justify-center rounded-[3px] bg-accent px-1 text-accent-fg">
              {names.length}
            </span>
            <span className="annot">{t("selection.selected")}</span>
          </span>
          <Button size="sm" icon={Archive} onClick={() => requestQueue(names, { kind: "archive" })}>
            {t("actions.archive")}
          </Button>
          <Button size="sm" icon={EyeOff} onClick={() => requestQueue(names, { kind: "set_private" })}>
            {t("actions.makePrivate")}
          </Button>
          <TagMenu repos={names} />
          <Popover
            placement="top-end"
            trigger={(p) => <IconButton {...p} icon={MoreHorizontal} label={t("selection.more")} />}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={ArchiveRestore}
                  onClick={() => (close(), requestQueue(names, { kind: "unarchive" }))}
                >
                  {t("actions.unarchive")}
                </MenuItem>
                <MenuItem icon={Eye} onClick={() => (close(), requestQueue(names, { kind: "set_public" }))}>
                  {t("actions.makePublic")}
                </MenuItem>
                <MenuItem icon={Pencil} onClick={() => (close(), setMeta("description"))}>
                  {t("bulkMeta.descriptionMenu")}
                </MenuItem>
                <MenuItem icon={Hash} onClick={() => (close(), setMeta("topics"))}>
                  {t("bulkMeta.topicsMenu")}
                </MenuItem>
                {getModule("home") && (
                  <MenuItem
                    icon={FolderDown}
                    onClick={() => (close(), useHomeUi.getState().set({ clone: names }))}
                  >
                    {t("bulkMeta.cloneMenu")}
                  </MenuItem>
                )}
                <MenuItem icon={Download} onClick={() => (close(), set({ exportFor: names }))}>
                  {t("actions.export")}
                </MenuItem>
              </>
            )}
          </Popover>
          <span className="mx-1 h-5 w-px bg-line" />
          <Button
            size="sm"
            variant="danger"
            icon={Trash2}
            onClick={() => requestQueue(names, { kind: "delete" })}
          >
            {t("actions.delete")}
          </Button>
          <IconButton icon={X} label={t("selection.clear")} onClick={() => setSelected([])} />
        </motion.div>
      )}
      {meta && <MetaDialog kind={meta} repos={names} onClose={() => setMeta(null)} />}
    </AnimatePresence>
  );
}
