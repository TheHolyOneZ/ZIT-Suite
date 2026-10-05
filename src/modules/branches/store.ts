import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "@/core/store/persist";
import type { BranchFilter } from "./model";

export type BranchesView = "repo" | "many";

interface BranchesState {
  view: BranchesView;
  repo: string | null;
  filter: BranchFilter;
  q: string;
  set: (p: Partial<Omit<BranchesState, "set">>) => void;
}

export const useBranchesUi = create<BranchesState>()(
  persist((set) => ({ view: "repo", repo: null, filter: "all", q: "", set: (p) => set(p) }), {
    name: "branches",
    version: 1,
    storage: persistStorage,
    partialize: ({ view, repo }) => ({ view, repo }),
  }),
);
