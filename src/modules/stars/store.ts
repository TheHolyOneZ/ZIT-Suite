import { create } from "zustand";
import type { StarFilter } from "./model";

export const EMPTY: StarFilter = { search: "", language: null, list: null, flags: [] };

export type StarSort = "starred" | "stars" | "pushed" | "name";

interface StarsUi {
  filter: StarFilter;
  selected: Set<string>;
  adding: boolean;
  sort: StarSort;
  setFilter: (p: Partial<StarFilter>) => void;
  set: (p: Partial<Pick<StarsUi, "selected" | "adding" | "sort">>) => void;
  toggle: (repo: string) => void;
}

export const useStarsUi = create<StarsUi>()((set) => ({
  filter: EMPTY,
  selected: new Set(),
  adding: false,
  sort: "starred",
  setFilter: (p) => set((s) => ({ filter: { ...s.filter, ...p } })),
  set: (p) => set(p),
  toggle: (repo) =>
    set((s) => {
      const n = new Set(s.selected);
      if (n.has(repo)) n.delete(repo);
      else n.add(repo);
      return { selected: n };
    }),
}));
