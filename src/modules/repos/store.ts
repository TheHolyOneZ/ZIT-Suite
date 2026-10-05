import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "@/core/store/persist";
import { DEFAULT_FILTER, type RepoFilter, type Sort } from "./filters";

export const BUILTIN_TAGS = ["keep", "delete", "review"] as const;

export interface FilterPreset {
  id: string;
  name: string;
  filter: RepoFilter;
}


interface ReposPrefs {
  tags: Record<string, string[]>;
  customTags: string[];
  presets: FilterPreset[];
  view: "table" | "grid";
  sort: Sort;
  toggleTag: (repos: string[], tag: string, on?: boolean) => void;
  addCustomTag: (tag: string) => void;
  removeCustomTag: (tag: string) => void;
  savePreset: (name: string, filter: RepoFilter) => void;
  deletePreset: (id: string) => void;
  set: (p: Partial<Pick<ReposPrefs, "view" | "sort">>) => void;
}

export const useReposPrefs = create<ReposPrefs>()(
  persist(
    (set) => ({
      tags: {},
      customTags: [],
      presets: [],
      view: "table",
      sort: { key: "updated", dir: "desc" },
      toggleTag: (repos, tag, on) =>
        set((s) => {
          const tags = { ...s.tags };
          const allHave = repos.every((r) => tags[r]?.includes(tag));
          const add = on ?? !allHave;
          for (const r of repos) {
            const cur = new Set(tags[r] ?? []);
            if (add) cur.add(tag);
            else cur.delete(tag);
            if (cur.size) tags[r] = [...cur];
            else delete tags[r];
          }
          return { tags };
        }),
      addCustomTag: (tag) =>
        set((s) => {
          const t = tag.trim().toLowerCase();
          if (!t || s.customTags.includes(t) || (BUILTIN_TAGS as readonly string[]).includes(t)) return s;
          return { customTags: [...s.customTags, t] };
        }),
      removeCustomTag: (tag) =>
        set((s) => ({
          customTags: s.customTags.filter((t) => t !== tag),
          tags: Object.fromEntries(
            Object.entries(s.tags)
              .map(([k, v]) => [k, v.filter((t) => t !== tag)] as const)
              .filter(([, v]) => v.length),
          ),
        })),
      savePreset: (name, filter) =>
        set((s) => ({
          presets: [...s.presets, { id: crypto.randomUUID(), name, filter: { ...filter, search: "" } }],
        })),
      deletePreset: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
      set: (p) => set(p),
    }),
    {
      name: "repos",
      version: 1,
      storage: persistStorage,
      partialize: ({ tags, customTags, presets, view, sort }) => ({ tags, customTags, presets, view, sort }),
    },
  ),
);


interface ReposUi {
  filter: RepoFilter;
  selected: Set<string>;
  cursor: number;
  cleanupOpen: boolean;
  exportFor: string[] | null;
  searchFocus: number;
  setFilter: (patch: Partial<RepoFilter>) => void;
  resetFilter: () => void;
  toggleSelect: (name: string) => void;
  setSelected: (names: string[]) => void;
  set: (
    p: Partial<Omit<ReposUi, "set" | "setFilter" | "resetFilter" | "toggleSelect" | "setSelected">>,
  ) => void;
}

export const useReposUi = create<ReposUi>()((set) => ({
  filter: DEFAULT_FILTER,
  selected: new Set(),
  cursor: 0,
  cleanupOpen: false,
  exportFor: null,
  searchFocus: 0,
  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch }, cursor: 0 })),
  resetFilter: () => set({ filter: DEFAULT_FILTER, cursor: 0 }),
  toggleSelect: (name) =>
    set((s) => {
      const selected = new Set(s.selected);
      if (selected.has(name)) selected.delete(name);
      else selected.add(name);
      return { selected };
    }),
  setSelected: (names) => set({ selected: new Set(names) }),
  set: (p) => set(p),
}));

export function tagTone(tag: string) {
  return tag === "keep" ? "ok" : tag === "delete" ? "danger" : tag === "review" ? "warn" : "info";
}
