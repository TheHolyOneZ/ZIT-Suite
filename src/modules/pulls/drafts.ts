import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DraftComment } from "@/core/ipc";
import { persistStorage } from "@/core/store/persist";


interface DraftsState {
  pending: Record<string, (DraftComment & { id: string })[]>;
  add: (key: string, d: DraftComment) => void;
  remove: (key: string, id: string) => void;
  clear: (key: string) => void;
}

export const prKey = (repo: string, number: number) => `${repo}#${number}`;
const EMPTY: (DraftComment & { id: string })[] = [];
export const noDrafts = EMPTY;

export const useReviewDrafts = create<DraftsState>()(
  persist(
    (set) => ({
      pending: {},
      add: (key, d) =>
        set((s) => ({
          pending: {
            ...s.pending,
            [key]: [
              ...(s.pending[key] ?? []),
              { ...d, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
            ],
          },
        })),
      remove: (key, id) =>
        set((s) => {
          const left = (s.pending[key] ?? []).filter((d) => d.id !== id);
          const next = { ...s.pending };
          if (left.length) next[key] = left;
          else delete next[key];
          return { pending: next };
        }),
      clear: (key) =>
        set((s) => {
          const next = { ...s.pending };
          delete next[key];
          return { pending: next };
        }),
    }),
    { name: "review-drafts", version: 1, storage: persistStorage },
  ),
);
