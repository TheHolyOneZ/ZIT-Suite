import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useToasts, type ToastKind } from "@/core/store/toasts";
import { Mark, type Glyph, type Tone } from "@/ui";

export const toastTone: Record<ToastKind, Tone> = { info: "info", success: "ok", warning: "warn", error: "danger" };
export const toastGlyph: Record<ToastKind, Glyph> = { info: "info", success: "tick", warning: "warn", error: "cross" };

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed right-4 bottom-[calc(var(--pillar-h)+12px)] z-[70] flex w-[340px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto relative flex gap-3 overflow-hidden rounded-[var(--radius)] border border-line-strong bg-surface px-3 py-2.5 shadow-[var(--shadow)]"
          >
            <span className="absolute inset-y-0 left-0 w-[2px]" style={{ background: `var(--${toastTone[t.kind]})` }} />
            <div className="pt-[3px]">
              <Mark glyph={toastGlyph[t.kind]} tone={toastTone[t.kind]} size={12} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{t.title}</div>
              {t.body && <div className="mt-0.5 text-[12px] break-words text-dim">{t.body}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} className="self-start text-faint hover:text-text cursor-default">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
