import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "@/core/store/persist";
import type { RunFilter } from "./model";

export type ActionsView = "board" | "repo";

interface ActionsState {
  view: ActionsView;
  repo: string | null;

  workflow: number | null;
  filter: RunFilter;

  days: number;
  boardFilter: "all" | "failed" | "running";
  set: (p: Partial<Omit<ActionsState, "set" | "setFilter">>) => void;
  setFilter: (p: Partial<RunFilter>) => void;
}

export const useActionsUi = create<ActionsState>()(
  persist(
    (set) => ({
      view: "board",
      repo: null,
      workflow: null,
      filter: { bucket: "all", branch: null, q: "" },
      days: 90,
      boardFilter: "all",
      set: (p) => set(p),
      setFilter: (p) => set((s) => ({ filter: { ...s.filter, ...p } })),
    }),
    {
      name: "actions",
      version: 1,
      storage: persistStorage,
      partialize: ({ view, repo, days, boardFilter }) => ({ view, repo, days, boardFilter }),
    },
  ),
);
