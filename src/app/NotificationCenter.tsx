import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { BellOff } from "lucide-react";
import { useToasts } from "@/core/store/toasts";
import { Button, Mark, RelTime } from "@/ui";
import { toastGlyph, toastTone } from "./Toaster";

export function NotificationCenter({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const log = useToasts((s) => s.log);
  const markRead = useToasts((s) => s.markRead);
  const clear = useToasts((s) => s.clearLog);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    markRead();
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const t = setTimeout(() => window.addEventListener("mousedown", down));
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", down);
    };
  }, [markRead, onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-[calc(100%+8px)] right-0 z-[60] flex max-h-[60vh] w-[360px] flex-col rounded-[var(--radius)] border border-line-strong bg-surface font-sans shadow-[var(--shadow)]"
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="annot">{t("shell.notifications")}</span>
        {log.length > 0 && (
          <Button size="sm" variant="ghost" onClick={clear}>
            {t("actions.clear")}
          </Button>
        )}
      </div>
      <div className="overflow-y-auto">
        {log.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-[12px] text-faint">
            <BellOff size={18} />
            {t("shell.noNotifications")}
          </div>
        ) : (
          log.map((n) => (
            <div key={n.id} className="flex gap-2.5 border-b border-line px-3 py-2 last:border-0">
              <div className="pt-[3px]">
                <Mark glyph={toastGlyph[n.kind]} tone={toastTone[n.kind]} size={11} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px]">{n.title}</div>
                {n.body && <div className="text-[11.5px] break-words text-dim">{n.body}</div>}
              </div>
              <span className="num shrink-0 text-[10.5px] text-faint"><RelTime at={n.at} /></span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
