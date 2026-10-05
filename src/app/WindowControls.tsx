import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";

type ResizeDirection = Parameters<ReturnType<typeof getCurrentWindow>["startResizeDragging"]>[0];
import { cn } from "@/core/cn";

const win = () => getCurrentWindow();


export function WindowControls() {
  const { t } = useTranslation();
  const [max, setMax] = useState(false);
  useEffect(() => {
    const w = win();
    void w.isMaximized().then(setMax);
    const un = w.onResized(() => void w.isMaximized().then(setMax));
    return () => void un.then((f) => f());
  }, []);
  const btn = "flex h-[var(--title-h)] w-11 cursor-default items-center justify-center text-dim transition-colors";
  return (
    <div className="-mr-2 ml-1 flex items-stretch border-l border-line">
      <button type="button" className={cn(btn, "hover:bg-surface-2 hover:text-text")} title={t("window.minimize")} onClick={() => void win().minimize()}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M1 5.5h8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      <button type="button" className={cn(btn, "hover:bg-surface-2 hover:text-text")} title={max ? t("window.restore") : t("window.maximize")} onClick={() => void win().toggleMaximize()}>
        {max ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <rect x="1" y="3" width="6" height="6" stroke="currentColor" strokeWidth="1.1" />
            <path d="M3 3V1h6v6H7" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <rect x="1" y="1" width="8" height="8" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        )}
      </button>
      <button type="button" className={cn(btn, "hover:bg-[#e5484d] hover:text-white")} title={t("window.close")} onClick={() => void win().close()}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  );
}

const EDGES: { dir: ResizeDirection; className: string; cursor: string }[] = [
  { dir: "North", className: "top-0 left-2 right-2 h-[4px]", cursor: "ns-resize" },
  { dir: "South", className: "bottom-0 left-2 right-2 h-[4px]", cursor: "ns-resize" },
  { dir: "West", className: "left-0 top-2 bottom-2 w-[4px]", cursor: "ew-resize" },
  { dir: "East", className: "right-0 top-2 bottom-2 w-[4px]", cursor: "ew-resize" },
  { dir: "NorthWest", className: "top-0 left-0 size-2", cursor: "nwse-resize" },
  { dir: "NorthEast", className: "top-0 right-0 size-2", cursor: "nesw-resize" },
  { dir: "SouthWest", className: "bottom-0 left-0 size-2", cursor: "nesw-resize" },
  { dir: "SouthEast", className: "bottom-0 right-0 size-2", cursor: "nwse-resize" },
];


export function ResizeEdges() {
  const [max, setMax] = useState(false);
  useEffect(() => {
    const w = win();
    void w.isMaximized().then(setMax);
    const un = w.onResized(() => void w.isMaximized().then(setMax));
    return () => void un.then((f) => f());
  }, []);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-maximized", max);
  }, [max]);
  if (max) return null;
  return (
    <>
      {EDGES.map((e) => (
        <div
          key={e.dir}
          className={cn("fixed z-[100]", e.className)}
          style={{ cursor: e.cursor }}
          onMouseDown={(ev) => {
            if (ev.button === 0) void win().startResizeDragging(e.dir);
          }}
        />
      ))}
    </>
  );
}


export function BareTitleBar() {
  return (
    <header data-tauri-drag-region className="flex h-[var(--title-h)] shrink-0 items-center border-b border-line bg-surface pr-2 pl-3">
      <span data-tauri-drag-region className="num flex-1 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
        ZIT-Suite
      </span>
      <WindowControls />
    </header>
  );
}
