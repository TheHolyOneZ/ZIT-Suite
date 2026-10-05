import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AlertKind, Feature, Severity } from "@/core/ipc";
import { persistStorage } from "@/core/store/persist";
import { DEFAULT_BASELINE, type SlaPreset } from "./model";

export type SecurityView = "alerts" | "fixes" | "repos";

interface SecurityPrefs {
  view: SecurityView;
  includeArchived: boolean;
  includeForks: boolean;
  baseline: Feature[];
  sla: SlaPreset;
  set: (
    p: Partial<Pick<SecurityPrefs, "view" | "includeArchived" | "includeForks" | "baseline" | "sla">>,
  ) => void;
}

export const useSecurityPrefs = create<SecurityPrefs>()(
  persist(
    (set) => ({
      view: "alerts",
      includeArchived: false,
      includeForks: true,
      baseline: DEFAULT_BASELINE,
      sla: "standard",
      set: (p) => set(p),
    }),
    {
      name: "security",
      version: 1,
      storage: persistStorage,
      partialize: ({ view, includeArchived, includeForks, baseline, sla }) => ({
        view,
        includeArchived,
        includeForks,
        baseline,
        sla,
      }),
    },
  ),
);


export type AlertTarget = { repo: string; number: number; title: string };
export type DismissRequest = { kind: AlertKind; alerts: AlertTarget[] };

export type FeaturesRequest = { repos?: string[]; feature?: Feature; enabled?: boolean };

interface SecurityUi {
  search: string;
  kind: AlertKind | "all";
  minSeverity: Severity;
  onlyFlagged: boolean;
  dismiss: DismissRequest | null;
  features: FeaturesRequest | null;
  set: (
    p: Partial<Pick<SecurityUi, "search" | "kind" | "minSeverity" | "onlyFlagged" | "dismiss" | "features">>,
  ) => void;
}

export const useSecurityUi = create<SecurityUi>()((set) => ({
  search: "",
  kind: "all",
  minSeverity: "unknown",
  onlyFlagged: false,
  dismiss: null,
  features: null,
  set: (p) => set(p),
}));
