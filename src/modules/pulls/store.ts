import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MergeMethod } from "@/core/ipc";
import { persistStorage } from "@/core/store/persist";
import { DEFAULT_PULL_FILTER, type PullFilter } from "./query";

interface PullsPrefs {
  views: { id: string; name: string; filter: PullFilter }[];
  mergeMethod: MergeMethod;
  saveView: (name: string, filter: PullFilter) => void;
  deleteView: (id: string) => void;
  set: (p: Partial<Pick<PullsPrefs, "mergeMethod">>) => void;
}

export const usePullsPrefs = create<PullsPrefs>()(
  persist(
    (set) => ({
      views: [],
      mergeMethod: "squash",
      saveView: (name, filter) =>
        set((s) => ({ views: [...s.views, { id: crypto.randomUUID(), name, filter }] })),
      deleteView: (id) => set((s) => ({ views: s.views.filter((v) => v.id !== id) })),
      set: (p) => set(p),
    }),
    {
      name: "pulls",
      version: 1,
      storage: persistStorage,
      partialize: ({ views, mergeMethod }) => ({ views, mergeMethod }),
    },
  ),
);

interface PullsUi {
  filter: PullFilter;
  rawQuery: string | null;
  activeView: string | null;
  selected: Set<string>;
  cursor: number;
  createOpen: boolean;

  createPrefill: { repo: string; head: string } | null;
  focusQuery: number;
  setFilter: (patch: Partial<PullFilter>) => void;
  toggleSelect: (key: string) => void;
  setSelected: (keys: string[]) => void;
  set: (p: Partial<Omit<PullsUi, "set" | "setFilter" | "toggleSelect" | "setSelected">>) => void;
}

export const usePullsUi = create<PullsUi>()((set) => ({
  filter: DEFAULT_PULL_FILTER,
  rawQuery: null,
  activeView: "myRepos",
  selected: new Set(),
  cursor: 0,
  createOpen: false,
  createPrefill: null,
  focusQuery: 0,
  setFilter: (patch) =>
    set((s) => ({ filter: { ...s.filter, ...patch }, rawQuery: null, activeView: null, cursor: 0 })),
  toggleSelect: (key) =>
    set((s) => {
      const selected = new Set(s.selected);
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      return { selected };
    }),
  setSelected: (keys) => set({ selected: new Set(keys) }),
  set: (p) => set(p),
}));
