import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "@/core/store/persist";
import type { GroupBy, InboxFilter } from "./model";

export type InboxView = "unread" | "all" | "participating";

interface InboxPrefs {
  view: InboxView;
  groupBy: GroupBy;

  desktop: boolean;

  views: { id: string; name: string; filter: InboxFilter }[];
  set: (p: Partial<Pick<InboxPrefs, "view" | "groupBy" | "desktop" | "views">>) => void;
}

export const useInboxPrefs = create<InboxPrefs>()(
  persist((set) => ({ view: "unread", groupBy: "reason", desktop: true, views: [], set: (p) => set(p) }), {
    name: "inbox",
    version: 1,
    storage: persistStorage,
    partialize: ({ view, groupBy, desktop, views }) => ({ view, groupBy, desktop, views }),
  }),
);

export const EMPTY_FILTER: InboxFilter = { search: "", reasons: [], kinds: [], repo: null, owner: null };

interface InboxUi {
  filter: InboxFilter;
  activeView: string | null;
  selected: Set<string>;
  cursor: number;
  setFilter: (p: Partial<InboxFilter>) => void;
  set: (p: Partial<Pick<InboxUi, "selected" | "cursor" | "activeView" | "filter">>) => void;
  toggle: (id: string) => void;
}

export const useInboxUi = create<InboxUi>()((set) => ({
  filter: EMPTY_FILTER,
  activeView: null,
  selected: new Set(),
  cursor: 0,
  setFilter: (p) => set((s) => ({ filter: { ...s.filter, ...p }, cursor: 0, activeView: null })),
  set: (p) => set(p),
  toggle: (id) =>
    set((s) => {
      const n = new Set(s.selected);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return { selected: n };
    }),
}));
