import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "@/core/store/persist";
import type { BoardFilter } from "./model";

export type ReleasesView = "board" | "repo";

interface ReleasesState {
  view: ReleasesView;
  repo: string | null;
  days: number;
  filter: BoardFilter;
  q: string;

  create: { tag?: string } | null;
  set: (p: Partial<Omit<ReleasesState, "set">>) => void;
}

export const useReleasesUi = create<ReleasesState>()(
  persist(
    (set) => ({
      view: "board",
      repo: null,
      days: 365,
      filter: "all",
      q: "",
      create: null,
      set: (p) => set(p),
    }),
    {
      name: "releases",
      version: 1,
      storage: persistStorage,
      partialize: ({ view, repo, days, filter }) => ({ view, repo, days, filter }),
    },
  ),
);
