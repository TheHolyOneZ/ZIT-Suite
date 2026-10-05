import { create } from "zustand";

export const CORE_SECTIONS = [
  "appearance",
  "language",
  "accounts",
  "queue",
  "background",
  "notifications",
  "modules",
] as const;
export type CoreSection = (typeof CORE_SECTIONS)[number];

export const useSettingsNav = create<{ section: string; go: (s: string) => void }>()((set) => ({
  section: "appearance",
  go: (section) => {
    set({ section });
    document.getElementById(`settings-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  },
}));
