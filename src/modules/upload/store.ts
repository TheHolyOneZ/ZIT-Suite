import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "@/core/store/persist";

export interface UploadTarget {
  repo: string;
  branch: string;
  folder: string;
  into: string;
}

interface UploadState extends UploadTarget {
  showSame: boolean;
  recent: UploadTarget[];
  set: (p: Partial<Pick<UploadState, "repo" | "branch" | "folder" | "into" | "showSame">>) => void;
  remember: (t: UploadTarget) => void;
}

const sameTarget = (a: UploadTarget, b: UploadTarget) =>
  a.repo === b.repo && a.folder === b.folder && a.into === b.into && a.branch === b.branch;

export const useUpload = create<UploadState>()(
  persist(
    (set) => ({
      repo: "",
      branch: "",
      folder: "",
      into: "",
      showSame: false,
      recent: [],
      set: (p) => set(p),
      remember: (t) =>
        set((s) => ({ recent: [t, ...s.recent.filter((r) => !sameTarget(r, t))].slice(0, 8) })),
    }),
    {
      name: "upload",
      version: 1,
      storage: persistStorage,
      partialize: ({ repo, branch, folder, into, showSame, recent }) => ({
        repo,
        branch,
        folder,
        into,
        showSame,
        recent,
      }),
    },
  ),
);
