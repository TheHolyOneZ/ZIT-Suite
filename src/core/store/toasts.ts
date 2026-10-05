import { create } from "zustand";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  at: number;
}

interface ToastState {
  toasts: Toast[];

  log: Toast[];
  unread: number;
  push: (t: Omit<Toast, "id" | "at">) => void;
  dismiss: (id: number) => void;
  markRead: () => void;
  clearLog: () => void;
}

let seq = 0;
const LOG_CAP = 200;

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  log: [],
  unread: 0,
  push: (t) => {
    const toast = { ...t, id: ++seq, at: Date.now() };
    set((s) => ({ toasts: [...s.toasts, toast], log: [toast, ...s.log].slice(0, LOG_CAP), unread: s.unread + 1 }));
    setTimeout(() => useToasts.getState().dismiss(toast.id), t.kind === "error" ? 8000 : 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  markRead: () => set({ unread: 0 }),
  clearLog: () => set({ log: [], unread: 0 }),
}));

export const toast = (t: Omit<Toast, "id" | "at">) => useToasts.getState().push(t);
