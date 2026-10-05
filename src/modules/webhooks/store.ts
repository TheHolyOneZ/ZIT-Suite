import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HookInput } from "@/core/ipc";
import { persistStorage } from "@/core/store/persist";
import type { HookState } from "./model";

export type HooksView = "endpoints" | "repos";

interface HooksPrefs {
  view: HooksView;
  includeArchived: boolean;
  includeForks: boolean;

  healthDepth: number;
  set: (p: Partial<Pick<HooksPrefs, "view" | "includeArchived" | "includeForks" | "healthDepth">>) => void;
}

export const useHooksPrefs = create<HooksPrefs>()(
  persist(
    (set) => ({
      view: "endpoints",
      includeArchived: false,
      includeForks: true,
      healthDepth: 25,
      set: (p) => set(p),
    }),
    {
      name: "hooks",
      version: 1,
      storage: persistStorage,
      partialize: ({ view, includeArchived, includeForks, healthDepth }) => ({
        view,
        includeArchived,
        includeForks,
        healthDepth,
      }),
    },
  ),
);

export interface HooksFilter {
  search: string;
  state: HookState | null;
  event: string | null;
}

export const DEFAULT_HOOKS_FILTER: HooksFilter = { search: "", state: null, event: null };


export interface CreateRequest {
  repos: string[];
  config?: HookInput;
}

interface HooksUi {
  filter: HooksFilter;
  create: CreateRequest | null;

  edit: string | null;
  setFilter: (p: Partial<HooksFilter>) => void;
  set: (p: Partial<Pick<HooksUi, "create" | "edit">>) => void;
}

export const useHooksUi = create<HooksUi>()((set) => ({
  filter: DEFAULT_HOOKS_FILTER,
  create: null,
  edit: null,
  setFilter: (p) => set((s) => ({ filter: { ...s.filter, ...p } })),
  set: (p) => set(p),
}));
