import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "@/core/store/persist";
import { DEFAULT_ISSUE_FILTER, type IssueFilter, type IssueSort } from "./query";

export interface SavedIssueView {
  id: string;
  name: string;

  filter: IssueFilter;
}

interface IssuesPrefs {
  views: SavedIssueView[];
  sort: IssueSort;
  order: "desc" | "asc";

  managerRepo: string | null;
  saveView: (name: string, filter: IssueFilter) => void;
  deleteView: (id: string) => void;
  set: (p: Partial<Pick<IssuesPrefs, "sort" | "order" | "managerRepo">>) => void;
}

export const useIssuesPrefs = create<IssuesPrefs>()(
  persist(
    (set) => ({
      views: [],
      sort: "updated",
      order: "desc",
      managerRepo: null,
      saveView: (name, filter) =>
        set((s) => ({ views: [...s.views, { id: crypto.randomUUID(), name, filter }] })),
      deleteView: (id) => set((s) => ({ views: s.views.filter((v) => v.id !== id) })),
      set: (p) => set(p),
    }),
    {
      name: "issues",
      version: 1,
      storage: persistStorage,
      partialize: ({ views, sort, order, managerRepo }) => ({ views, sort, order, managerRepo }),
    },
  ),
);

export type IssuesTab = "issues" | "labels" | "milestones";

interface IssuesUi {
  tab: IssuesTab;
  filter: IssueFilter;

  rawQuery: string | null;
  activeView: string | null;
  selected: Set<string>;
  cursor: number;
  createOpen: boolean;
  focusQuery: number;
  focusComposer: number;

  picker: { kind: "labels" | "assignees" | "milestone"; n: number } | null;
  setFilter: (patch: Partial<IssueFilter>) => void;
  toggleSelect: (key: string) => void;
  setSelected: (keys: string[]) => void;
  set: (p: Partial<Omit<IssuesUi, "set" | "setFilter" | "toggleSelect" | "setSelected">>) => void;
}

export const useIssuesUi = create<IssuesUi>()((set) => ({
  tab: "issues",
  filter: DEFAULT_ISSUE_FILTER,
  rawQuery: null,
  activeView: "myOpen",
  selected: new Set(),
  cursor: 0,
  createOpen: false,
  focusQuery: 0,
  focusComposer: 0,
  picker: null,
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
