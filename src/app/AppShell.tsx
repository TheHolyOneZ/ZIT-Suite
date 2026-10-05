import { useEffect } from "react";
import { useHotkeys } from "@/core/keyboard";
import { useNavModules } from "@/core/modules/registry";
import { useSheets } from "@/core/sheets/store";
import { useUi } from "@/core/store/ui";
import { CommandPalette } from "./CommandPalette";
import { PillarBar } from "./PillarBar";
import { SheetStack } from "./SheetStack";
import { ShortcutsOverlay } from "./ShortcutsOverlay";
import { TitleBlock } from "./TitleBlock";


function useEscapeFoldsSheet() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      setTimeout(() => {
        if (e.defaultPrevented || document.querySelector("[data-popover],[role=dialog]")) return;
        const el = e.target as HTMLElement | null;
        if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
        useSheets.getState().pop();
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function AppShell() {
  const nav = useNavModules();
  const active = useSheets((s) => s.active);
  const open = useSheets((s) => s.open);
  const setUi = useUi((s) => s.set);


  useEffect(() => {
    if (nav.length && !nav.some((m) => m.id === active)) open(nav[0].id);
  }, [nav, active, open]);

  useEscapeFoldsSheet();
  const numbered = Object.fromEntries(nav.slice(0, 9).map((m, i) => [`mod+${i + 1}`, () => open(m.id)]));
  useHotkeys({
    ...numbered,
    "mod+k": () => setUi({ paletteOpen: !useUi.getState().paletteOpen }),
    "alt+arrowleft": () => useSheets.getState().pop(),
    "?": () => setUi({ shortcutsOpen: true }),
  });

  return (
    <div className="flex h-full flex-col">
      <TitleBlock />
      <main className="relative min-h-0 flex-1 overflow-hidden bg-bg">
        <SheetStack />
      </main>
      <PillarBar />
      <CommandPalette />
      <ShortcutsOverlay />
    </div>
  );
}
