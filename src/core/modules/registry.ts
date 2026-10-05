import { useMemo } from "react";
import { useSettings } from "../store/settings";
import { PILLARS, type ModuleManifest } from "./types";

const found = import.meta.glob<{ default: ModuleManifest }>("../../modules/*/index.ts", { eager: true });

export const allModules: ModuleManifest[] = Object.values(found)
  .map((m) => m.default)
  .sort((a, b) => PILLARS.indexOf(a.pillar) - PILLARS.indexOf(b.pillar) || a.order - b.order);

export function getModule(id: string) {
  return allModules.find((m) => m.id === id);
}

export function isEnabled(m: ModuleManifest, disabled: string[]) {
  return m.required || !disabled.includes(m.id);
}


export function useEnabledModules() {
  const disabled = useSettings((s) => s.disabledModules);
  return useMemo(() => allModules.filter((m) => isEnabled(m, disabled)), [disabled]);
}


export function useNavModules() {
  const enabled = useEnabledModules();
  return useMemo(() => enabled.filter((m) => !m.hidden && m.sheets?.root), [enabled]);
}
