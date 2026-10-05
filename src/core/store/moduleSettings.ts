import { getModule } from "../modules/registry";
import { useSettings } from "./settings";


export function useModuleSetting<T extends string | number | boolean>(moduleId: string, key: string): T {
  const value = useSettings((s) => s.moduleSettings[moduleId]?.[key]);
  if (value !== undefined) return value as T;
  const field = getModule(moduleId)?.settings?.find((f) => f.key === key);
  return field?.default as T;
}
