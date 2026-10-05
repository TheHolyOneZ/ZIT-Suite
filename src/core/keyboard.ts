import { useEffect, useRef } from "react";

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;


const TYPING_PASSTHROUGH = /^mod\+([kb]|[1-9])$/;

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
};


export function comboOf(e: KeyboardEvent) {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("mod");
  if (e.altKey) parts.push("alt");
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (e.shiftKey && e.key.length > 1) parts.push("shift");
  parts.push(key === " " ? "space" : key);
  return parts.join("+");
}


const modalOpen = () => typeof document !== "undefined" && !!document.querySelector('[role="dialog"][aria-modal="true"]');


export function useHotkeys(map: HotkeyMap, enabled = true) {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const combo = comboOf(e);
      const handler = ref.current[combo];
      if (!handler) return;


      if (isTyping(e) && !TYPING_PASSTHROUGH.test(combo)) return;

      if (e.defaultPrevented || (modalOpen() && !TYPING_PASSTHROUGH.test(combo))) return;
      e.preventDefault();
      handler(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
