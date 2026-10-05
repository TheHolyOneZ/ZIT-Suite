import { create } from "zustand";
import type { NewQueueItem, QueueAction, QueueSnapshot } from "@/core/ipc";

interface QueueState {
  snapshot: QueueSnapshot;

  request: NewQueueItem[] | null;
  setSnapshot: (s: QueueSnapshot) => void;

  requestRun: (items: NewQueueItem[]) => void;
  closeRequest: () => void;
}

export const useQueue = create<QueueState>()((set) => ({
  snapshot: { items: [], phase: "idle", grace_remaining: null },
  request: null,
  setSnapshot: (snapshot) => set({ snapshot }),
  requestRun: (items) => items.length > 0 && set({ request: items }),
  closeRequest: () => set({ request: null }),
}));


export const requestQueue = (repos: string[], action: QueueAction) =>
  useQueue.getState().requestRun(repos.map((repo) => ({ repo, action })));

export type ActionKind = QueueAction["kind"];


export const DESTRUCTIVE: ActionKind[] = [
  "delete",
  "label_delete",
  "collab_remove",
  "hook_delete",
  "secret_delete",
  "var_delete",
  "env_delete",
  "branch_delete",
  "repo_transfer",
];
export const isDestructive = (a: QueueAction) => DESTRUCTIVE.includes(a.kind);
