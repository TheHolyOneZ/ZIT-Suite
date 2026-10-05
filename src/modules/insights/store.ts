import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "@/core/store/persist";
import type { CustomRule } from "./custom";

export type InsightsView = "overview" | "checks" | "traffic" | "people";

interface InsightsState {
  view: InsightsView;

  dismissed: Record<string, string[]>;
  includeArchived: boolean;

  trafficRange: 14 | 90 | 365;

  peopleRepo: string | null;
  set: (p: Partial<Pick<InsightsState, "view" | "includeArchived" | "trafficRange" | "peopleRepo">>) => void;

  customRules: CustomRule[];
  saveRule: (r: CustomRule) => void;
  deleteRule: (id: string) => void;
  dismiss: (rule: string, repos: string[]) => void;
  restore: (rule: string) => void;
}

export const useInsights = create<InsightsState>()(
  persist(
    (set) => ({
      view: "overview",
      dismissed: {},
      includeArchived: false,
      trafficRange: 14,
      peopleRepo: null,
      customRules: [],
      set: (p) => set(p),
      saveRule: (r) =>
        set((s) => ({
          customRules: s.customRules.some((x) => x.id === r.id)
            ? s.customRules.map((x) => (x.id === r.id ? r : x))
            : [...s.customRules, r],
        })),
      deleteRule: (id) =>
        set((s) => {
          const dismissed = { ...s.dismissed };
          delete dismissed[id];
          return { customRules: s.customRules.filter((x) => x.id !== id), dismissed };
        }),
      dismiss: (rule, repos) =>
        set((s) => ({
          dismissed: { ...s.dismissed, [rule]: [...new Set([...(s.dismissed[rule] ?? []), ...repos])] },
        })),
      restore: (rule) => set((s) => ({ dismissed: { ...s.dismissed, [rule]: [] } })),
    }),
    {
      name: "insights",
      version: 1,
      storage: persistStorage,
      partialize: ({ view, dismissed, includeArchived, trafficRange }) => ({
        view,
        dismissed,
        includeArchived,
        trafficRange,
      }),
    },
  ),
);
