import { Suspense, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ArrowLeftToLine, Compass } from "lucide-react";
import { tDynamic } from "@/core/i18n";
import { getModule } from "@/core/modules/registry";
import { useActiveStack, useSheets, type SheetRef } from "@/core/sheets/store";
import { EmptyState, Plotter } from "@/ui";
import { ErrorBoundary } from "./ErrorBoundary";
import { SheetRoleContext } from "@/core/sheets/role";

const PEEK_MIN_WIDTH = 1180;

export function sheetTitle(ref: SheetRef): string {
  const m = getModule(ref.module);
  const def = m?.sheets?.[ref.view];
  if (def?.title) return def.title(ref.params);
  return m ? tDynamic(m.titleKey) : ref.view;
}

function useWideWindow() {
  const [wide, setWide] = useState(() => window.innerWidth >= PEEK_MIN_WIDTH);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= PEEK_MIN_WIDTH);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return wide;
}


export function SheetStack() {
  const { t } = useTranslation();
  const stack = useActiveStack();
  const wide = useWideWindow();
  const n = stack.length;
  const topDef = getModule(stack[n - 1].module)?.sheets?.[stack[n - 1].view];
  const peek = n >= 2 && topDef?.kind === "detail" && wide;
  const firstLive = peek ? n - 2 : n - 1;

  if (!getModule(stack[0].module)?.sheets?.root) {
    return <EmptyState icon={<Compass size={20} />} title={t("shell.noModules")} />;
  }

  return (
    <div className="flex h-full min-h-0">
      {stack.map((ref, i) =>
        i < firstLive ? (
          <Spine key={ref.key} index={i} ref_={ref} />
        ) : (
          <Sheet key={ref.key} ref_={ref} index={i} role={i === n - 1 ? "top" : "peek"} />
        ),
      )}
    </div>
  );
}

function Sheet({ ref_, index, role }: { ref_: SheetRef; index: number; role: "top" | "peek" }) {
  const def = getModule(ref_.module)?.sheets?.[ref_.view];
  if (!def) return null;
  const Comp = def.component;
  return (
    <motion.section
      initial={index > 0 && role === "top" ? { x: 28, opacity: 0 } : false}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      data-sheet={role}
      className={
        role === "top"
          ? "blueprint-grid relative flex min-w-0 flex-1 flex-col border-l border-line-strong shadow-[-14px_0_24px_-16px_rgba(0,0,0,0.55)] first:border-l-0"
          : "relative flex w-[42%] min-w-[420px] shrink-0 flex-col bg-surface"
      }
    >
      <SheetTag index={index} />
      <SheetRoleContext.Provider value={role}>
        <ErrorBoundary resetKey={ref_.key}>
          <Suspense fallback={<Plotter />}>
            <Comp params={ref_.params} />
          </Suspense>
        </ErrorBoundary>
      </SheetRoleContext.Provider>
    </motion.section>
  );
}


function SheetTag({ index }: { index: number }) {
  return (
    <span className="num pointer-events-none absolute top-0 right-0 z-10 border-b border-l border-line px-1.5 py-[1px] text-[9px] tracking-[0.12em] text-faint">
      S-{String(index + 1).padStart(2, "0")}
    </span>
  );
}


function Spine({ ref_, index }: { ref_: SheetRef; index: number }) {
  const { t } = useTranslation();
  const popTo = useSheets((s) => s.popTo);
  const title = sheetTitle(ref_);
  return (
    <button
      onClick={() => popTo(index)}
      title={t("shell.backTo", { title })}
      className="group flex w-10 shrink-0 flex-col items-center border-r border-line bg-surface py-3 text-faint transition-colors hover:bg-surface-2 hover:text-text cursor-default"
    >
      <span className="num text-[9.5px]">{String(index + 1).padStart(2, "0")}</span>
      <span className="mt-3 max-h-[70%] truncate text-[11.5px] tracking-[0.04em]" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
        {title}
      </span>
      <ArrowLeftToLine size={13} className="mt-auto group-hover:text-accent" />
    </button>
  );
}
