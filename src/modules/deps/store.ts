import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "@/core/store/persist";
import type { Freshness } from "./model";

export type DepsView = "packages" | "outdated" | "conflicts" | "repos";

interface DepsState {
  view: DepsView;

  days: number;
  forks: boolean;
  dev: boolean;
  ecosystem: string;
  q: string;

  started: boolean;

  autoLatest: boolean;
  open: string | null;
  set: (p: Partial<Omit<DepsState, "set">>) => void;
}

export const useDepsUi = create<DepsState>()(
  persist(
    (set) => ({
      view: "packages",
      days: 365,
      forks: false,
      dev: true,
      ecosystem: "all",
      q: "",
      started: false,
      autoLatest: false,
      open: null,
      set: (p) => set(p),
    }),
    {
      name: "deps",
      version: 1,
      storage: persistStorage,
      partialize: ({ view, days, forks, dev, started, autoLatest }) => ({
        view,
        days,
        forks,
        dev,
        started,
        autoLatest,
      }),
    },
  ),
);

export const FRESH_LOOK: Record<
  Freshness,
  {
    glyph: "tick" | "warn" | "cross" | "info" | "equal" | "void" | "block" | "pending";
    tone: "ok" | "warn" | "danger" | "info" | "idle" | "accent";
  }
> = {
  current: { glyph: "tick", tone: "ok" },
  allowed: { glyph: "equal", tone: "ok" },
  patch: { glyph: "info", tone: "info" },
  minor: { glyph: "warn", tone: "warn" },
  major: { glyph: "cross", tone: "danger" },
  any: { glyph: "void", tone: "idle" },
  local: { glyph: "block", tone: "idle" },
  unknown: { glyph: "pending", tone: "idle" },
};
