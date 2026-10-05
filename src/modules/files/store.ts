import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "@/core/store/persist";
import type { StagedMap } from "./model";

export const keyOf = (repo: string, branch: string) => `${repo}@${branch}`;

interface FilesState {
  repo: string | null;
  branch: string | null;

  tabs: Record<string, string[]>;
  active: Record<string, string | null>;

  staged: Record<string, StagedMap>;

  folder: string;
  pane: "editor" | "changes";
  preview: boolean;
  focus: boolean;
  set: (p: Partial<Pick<FilesState, "repo" | "branch" | "folder" | "pane" | "preview" | "focus">>) => void;
  open: (key: string, path: string) => void;
  close: (key: string, path: string) => void;
  setStaged: (key: string, s: StagedMap) => void;
}

export const useFiles = create<FilesState>()(
  persist(
    (set) => ({
      repo: null,
      branch: null,
      tabs: {},
      active: {},
      staged: {},
      folder: "",
      pane: "editor",
      preview: false,
      focus: false,
      set: (p) => set(p),
      open: (key, path) =>
        set((s) => ({
          tabs: {
            ...s.tabs,
            [key]: (s.tabs[key] ?? []).includes(path)
              ? s.tabs[key]
              : [...(s.tabs[key] ?? []), path].slice(-12),
          },
          active: { ...s.active, [key]: path },
          pane: "editor",
        })),
      close: (key, path) =>
        set((s) => {
          const list = (s.tabs[key] ?? []).filter((p) => p !== path);
          const was = s.active[key];
          return {
            tabs: { ...s.tabs, [key]: list },
            active: { ...s.active, [key]: was === path ? (list[list.length - 1] ?? null) : was },
          };
        }),
      setStaged: (key, st) =>
        set((s) => {
          const next = { ...s.staged };
          if (Object.keys(st).length) next[key] = st;
          else delete next[key];
          return { staged: next };
        }),
    }),
    {
      name: "files",
      version: 1,
      storage: persistStorage,
      partialize: ({ repo, branch, tabs, active, staged, preview }) => ({
        repo,
        branch,
        tabs,
        active,
        staged,
        preview,
      }),
    },
  ),
);
