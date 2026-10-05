import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "@/core/ipc";
import { persistStorage } from "@/core/store/persist";

export type AccessView = "people" | "repos" | "matrix";

interface AccessPrefs {
  view: AccessView;
  includeArchived: boolean;
  includeForks: boolean;
  set: (p: Partial<Pick<AccessPrefs, "view" | "includeArchived" | "includeForks">>) => void;
}

export const useAccessPrefs = create<AccessPrefs>()(
  persist(
    (set) => ({ view: "people", includeArchived: false, includeForks: true, set: (p) => set(p) }),
    { name: "access", version: 1, storage: persistStorage, partialize: ({ view, includeArchived, includeForks }) => ({ view, includeArchived, includeForks }) },
  ),
);

export interface AccessFilter {
  search: string;

  minRole: Role | null;
  kind: "any" | "users" | "bots";
  pendingOnly: boolean;
}

export const DEFAULT_ACCESS_FILTER: AccessFilter = { search: "", minRole: null, kind: "any", pendingOnly: false };

interface AccessUi {
  filter: AccessFilter;
  selected: Set<string>;
  grant: { users: string[]; repos: string[]; mode: "add" | "remove" } | null;
  setFilter: (p: Partial<AccessFilter>) => void;
  toggleSelect: (login: string) => void;
  setSelected: (l: string[]) => void;
  set: (p: Partial<Pick<AccessUi, "grant">>) => void;
}

export const useAccessUi = create<AccessUi>()((set) => ({
  filter: DEFAULT_ACCESS_FILTER,
  selected: new Set(),
  grant: null,
  setFilter: (p) => set((s) => ({ filter: { ...s.filter, ...p } })),
  toggleSelect: (login) =>
    set((s) => {
      const n = new Set(s.selected);
      if (n.has(login)) n.delete(login);
      else n.add(login);
      return { selected: n };
    }),
  setSelected: (l) => set({ selected: new Set(l) }),
  set: (p) => set(p),
}));
