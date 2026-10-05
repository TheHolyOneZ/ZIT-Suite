import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "@/core/store/persist";
import { addSnapshot, type Snapshot, type SortBy } from "./model";


export type AuditTarget = string;
export const isLocal = (t: AuditTarget) => t.startsWith("local:");
export const localPath = (t: AuditTarget) => t.slice("local:".length);
export const targetLabel = (t: AuditTarget) =>
  isLocal(t) ? (localPath(t).split(/[\\/]/).filter(Boolean).pop() ?? t) : (t.split("/")[1] ?? t);

interface AuditState {
  repo: AuditTarget | null;

  started: boolean;
  source: "github" | "local";
  sort: SortBy;
  skipNoise: boolean;
  recent: AuditTarget[];

  snapshots: Record<AuditTarget, Snapshot[]>;

  compareAt: string | null;
  set: (
    p: Partial<Pick<AuditState, "repo" | "started" | "sort" | "skipNoise" | "source" | "compareAt">>,
  ) => void;
  remember: (repo: AuditTarget, snap: Snapshot) => void;
}

export const useAudit = create<AuditState>()(
  persist(
    (set) => ({
      repo: null,
      started: false,
      source: "github",
      sort: "lines",
      skipNoise: true,
      recent: [],
      snapshots: {},
      compareAt: null,
      set: (p) => set(p),
      remember: (repo, snap) =>
        set((s) => ({
          recent: [repo, ...s.recent.filter((r) => r !== repo)].slice(0, 8),
          snapshots: { ...s.snapshots, [repo]: addSnapshot(s.snapshots[repo] ?? [], snap) },
          compareAt: null,
        })),
    }),
    {
      name: "audit",
      version: 1,
      storage: persistStorage,
      partialize: ({ sort, skipNoise, recent, source, snapshots }) => ({
        sort,
        skipNoise,
        recent,
        source,
        snapshots,
      }),
    },
  ),
);
