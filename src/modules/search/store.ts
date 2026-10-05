import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SearchKind } from "@/core/ipc";
import { persistStorage } from "@/core/store/persist";
import { remember } from "./model";

interface SearchState {
  kind: SearchKind;
  q: string;
  mine: boolean;
  sort: string;
  recent: { kind: SearchKind; q: string }[];

  saved: { kind: SearchKind; q: string; name: string }[];

  grouped: boolean;
  set: (p: Partial<Pick<SearchState, "kind" | "q" | "mine" | "sort" | "grouped">>) => void;
  save: (s: { kind: SearchKind; q: string; name: string }) => void;
  unsave: (kind: SearchKind, q: string) => void;
  push: (s: { kind: SearchKind; q: string }) => void;
  clearRecent: () => void;
}

export const useSearch = create<SearchState>()(
  persist(
    (set) => ({
      kind: "repos",
      q: "",
      mine: false,
      sort: "best-match",
      recent: [],
      saved: [],
      grouped: true,
      set: (p) => set(p),
      save: (x) =>
        set((st) => ({ saved: [...st.saved.filter((y) => !(y.kind === x.kind && y.q === x.q)), x] })),
      unsave: (kind, q) => set((st) => ({ saved: st.saved.filter((y) => !(y.kind === kind && y.q === q)) })),
      push: (s) => set((st) => ({ recent: remember(st.recent, s) })),
      clearRecent: () => set({ recent: [] }),
    }),
    {
      name: "search",
      version: 1,
      storage: persistStorage,
      partialize: ({ kind, mine, recent, saved, grouped }) => ({ kind, mine, recent, saved, grouped }),
    },
  ),
);
