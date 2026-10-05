import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "./persist";

export type ThemeMode = "system" | "dark" | "light";

export const ACCENT_PRESETS = [
  { id: "signal", value: "#ff7a1a" },
  { id: "blueprint", value: "#3aa7ff" },
  { id: "circuit", value: "#2fd38a" },
  { id: "violet", value: "#9d7bff" },
  { id: "magenta", value: "#ff4fa3" },
  { id: "brass", value: "#d8b45a" },
] as const;

export interface SettingsState {
  theme: ThemeMode;
  accent: string;
  language: string | null;
  graceSeconds: number;
  typeToConfirmDelete: boolean;
  desktopNotifications: boolean;
  notifyOnFinish: boolean;
  notifyOnFailure: boolean;
  disabledModules: string[];
  moduleSettings: Record<string, Record<string, unknown>>;
  lastModule: string;
  set: (patch: Partial<SettingsState>) => void;
  setModuleSetting: (moduleId: string, key: string, value: unknown) => void;
  toggleModule: (moduleId: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      accent: ACCENT_PRESETS[0].value,
      language: null,
      graceSeconds: 10,
      typeToConfirmDelete: true,
      desktopNotifications: true,
      notifyOnFinish: true,
      notifyOnFailure: true,
      disabledModules: [],
      moduleSettings: {},
      lastModule: "repos",
      set: (patch) => set(patch),
      setModuleSetting: (moduleId, key, value) =>
        set((s) => ({
          moduleSettings: { ...s.moduleSettings, [moduleId]: { ...s.moduleSettings[moduleId], [key]: value } },
        })),
      toggleModule: (moduleId) =>
        set((s) => ({
          disabledModules: s.disabledModules.includes(moduleId)
            ? s.disabledModules.filter((m) => m !== moduleId)
            : [...s.disabledModules, moduleId],
        })),
    }),
    {
      name: "settings",
      version: 1,
      storage: persistStorage,
      skipHydration: true,
      partialize: ({ set: _s, setModuleSetting: _m, toggleModule: _t, ...rest }) => rest,
    },
  ),
);
