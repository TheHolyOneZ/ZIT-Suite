import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Bookmark, BookmarkPlus, Check, ChevronDown, Layers, X } from "lucide-react";
import { cn } from "@/core/cn";
import { Input } from "./Field";
import { MenuLabel, MenuSeparator, Popover } from "./Popover";

export interface ViewItem {
  id: string;
  label: string;
  icon?: ReactNode;
}


export function ViewsMenu({
  builtin = [],
  saved,
  activeId,
  onPick,
  onSave,
  onDelete,
}: {
  builtin?: ViewItem[];
  saved: ViewItem[];
  activeId: string | null;
  onPick: (id: string) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const active = [...builtin, ...saved].find((v) => v.id === activeId);

  const Row = ({ v, deletable, close }: { v: ViewItem; deletable?: boolean; close: () => void }) => (
    <div className="group flex items-center">
      <button
        type="button"
        onClick={() => (onPick(v.id), close())}
        className={cn("flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[3px] px-2 text-left text-[12.5px] cursor-default hover:bg-surface-2", v.id === activeId && "text-accent")}
      >
        <span className="flex w-4 justify-center text-faint">{v.icon ?? <Bookmark size={12} />}</span>
        <span className="truncate">{v.label}</span>
        {v.id === activeId && <Check size={12} className="ml-auto" />}
      </button>
      {deletable && (
        <button type="button" onClick={() => onDelete(v.id)} className="px-1.5 text-faint opacity-0 group-hover:opacity-100 hover:text-danger cursor-default" aria-label={t("actions.remove")}>
          <X size={12} />
        </button>
      )}
    </div>
  );

  return (
    <Popover
      placement="bottom-end"
      className="w-[280px]"
      trigger={(p) => (
        <button
          {...p}
          type="button"
          className="flex h-7 max-w-[220px] items-center gap-1.5 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2 text-[12px] text-dim hover:text-text cursor-default"
        >
          <Layers size={13} />
          <span className="truncate">{active?.label ?? t("views.title")}</span>
          <ChevronDown size={12} />
        </button>
      )}
    >
      {(close) => (
        <div>
          {builtin.length > 0 && (
            <>
              <MenuLabel>{t("views.builtin")}</MenuLabel>
              {builtin.map((v) => (
                <Row key={v.id} v={v} close={close} />
              ))}
              <MenuSeparator />
            </>
          )}
          <MenuLabel>{t("views.saved")}</MenuLabel>
          {saved.length === 0 && <div className="px-2 pb-1 text-[11.5px] text-faint">{t("views.none")}</div>}
          {saved.map((v) => (
            <Row key={v.id} v={v} deletable close={close} />
          ))}
          <MenuSeparator />
          <form
            className="flex items-center gap-1.5 p-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) {
                onSave(name.trim());
                setName("");
                close();
              }
            }}
          >
            <BookmarkPlus size={13} className="ml-1 shrink-0 text-faint" />
            <div className="flex-1">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("views.saveCurrent")} className="h-7 text-[12px]" />
            </div>
          </form>
        </div>
      )}
    </Popover>
  );
}
