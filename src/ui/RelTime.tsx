import { useSyncExternalStore } from "react";
import { formatRelative } from "@/core/i18n/format";


const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(cb: () => void) {
  listeners.add(cb);
  timer ??= setInterval(() => {
    now = Date.now();
    listeners.forEach((l) => l());
  }, 15_000);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}


export function useNow() {
  return useSyncExternalStore(subscribe, () => now);
}


export function RelTime({ at }: { at: string | number | null | undefined }) {
  useNow();
  return <>{formatRelative(at == null ? null : new Date(at).toISOString())}</>;
}
