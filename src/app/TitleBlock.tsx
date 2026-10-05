import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Bell, ChevronRight, Keyboard, Search } from "lucide-react";
import { cn } from "@/core/cn";
import { getModule } from "@/core/modules/registry";
import { combo } from "@/core/platform";
import { useActiveStack, useSheets } from "@/core/sheets/store";
import { useToasts } from "@/core/store/toasts";
import { useUi } from "@/core/store/ui";
import { IconButton } from "@/ui";
import { AccountMenu } from "./AccountMenu";
import { Logo } from "./Logo";
import { NotificationCenter } from "./NotificationCenter";
import { WindowControls } from "./WindowControls";
import { sheetTitle } from "./SheetStack";


export function TitleBlock() {
  const { t } = useTranslation();
  const stack = useActiveStack();
  const active = useSheets((s) => s.active);
  const popTo = useSheets((s) => s.popTo);
  const setUi = useUi((s) => s.set);
  const notificationsOpen = useUi((s) => s.notificationsOpen);
  const unread = useToasts((s) => s.unread);
  const mod = getModule(active);

  return (

    <header data-tauri-drag-region className="relative z-20 flex h-[var(--title-h)] shrink-0 items-center gap-3 border-b border-line-strong bg-surface pr-2 pl-3">
      <div data-tauri-drag-region className="flex items-center gap-2 border-r border-line pr-3">
        <Logo size={22} />
        <span className="num text-[11px] font-semibold tracking-[0.08em] uppercase">ZIT</span>
      </div>

      <nav data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-[12.5px]" aria-label={t("shell.breadcrumb")}>
        {mod && <span className="annot shrink-0 !text-[9.5px]">{t(`pillars.${mod.pillar}`)}</span>}
        {stack.map((ref, i) => {
          const last = i === stack.length - 1;
          return (
            <Fragment key={ref.key}>
              <ChevronRight size={12} className="shrink-0 text-faint" />
              <button
                disabled={last}
                onClick={() => popTo(i)}
                className={cn("min-w-0 truncate rounded-[3px] px-1.5 py-0.5 cursor-default", last ? "font-medium text-text" : "text-dim hover:bg-surface-2 hover:text-text")}
              >
                {sheetTitle(ref)}
              </button>
            </Fragment>
          );
        })}
      </nav>

      <button
        onClick={() => setUi({ paletteOpen: true })}
        className="flex h-7 w-[260px] items-center gap-2 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2.5 text-left text-[12px] text-faint hover:border-dim cursor-default"
      >
        <Search size={13} />
        <span className="flex-1">{t("shell.searchOrRun")}</span>
        <span className="num text-[10px]">{combo("K")}</span>
      </button>
      <IconButton icon={Keyboard} label={t("shell.shortcuts")} onClick={() => setUi({ shortcutsOpen: true })} />
      <div className="relative">
        <IconButton icon={Bell} label={t("shell.notifications")} onClick={() => setUi({ notificationsOpen: !notificationsOpen })} />
        {unread > 0 && <span className="num pointer-events-none absolute -top-0.5 -right-0.5 rounded-[2px] bg-accent px-1 text-[9px] text-accent-fg">{unread}</span>}
        {notificationsOpen && <NotificationCenter onClose={() => setUi({ notificationsOpen: false })} />}
      </div>
      <AccountMenu />
      <WindowControls />
    </header>
  );
}
