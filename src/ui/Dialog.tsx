import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/core/cn";
import { Ticks } from "./Panel";

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {

      if (e.key === "Escape" && !document.querySelector("[data-popover]")) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [open, onClose]);
}

export function Dialog({
  open,
  onClose,
  title,
  kicker,
  children,
  footer,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  kicker?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const { t } = useTranslation();
  useEscape(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <motion.div
            className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal
            className="relative flex max-h-full w-full flex-col rounded-[var(--radius)] border border-line-strong bg-surface shadow-[var(--shadow)]"
            style={{ maxWidth: width }}
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.99 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <Ticks />
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                {kicker && <div className="annot mb-1">{kicker}</div>}
                <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
              </div>
              <button onClick={onClose} aria-label={t("actions.close")} className="text-faint hover:text-text cursor-default">
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}


export function Drawer({
  open,
  onClose,
  children,
  width = 440,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  className?: string;
}) {
  useEscape(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          className={cn("absolute inset-y-0 right-0 z-30 flex flex-col border-l border-line-strong bg-surface shadow-[var(--shadow)]", className)}
          style={{ width }}
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {children}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
