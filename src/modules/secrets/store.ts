import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EnvConfig } from "@/core/ipc";
import { persistStorage } from "@/core/store/persist";
import type { Place } from "./model";

export type SecretsView = "secrets" | "variables" | "environments" | "repos";

interface SecretsPrefs {
  view: SecretsView;
  includeArchived: boolean;
  includeForks: boolean;

  staleDays: number;
  set: (p: Partial<Pick<SecretsPrefs, "view" | "includeArchived" | "includeForks" | "staleDays">>) => void;
}

export const useSecretsPrefs = create<SecretsPrefs>()(
  persist(
    (set) => ({
      view: "secrets",
      includeArchived: false,
      includeForks: true,
      staleDays: 180,
      set: (p) => set(p),
    }),
    {
      name: "secrets",
      version: 1,
      storage: persistStorage,
      partialize: ({ view, includeArchived, includeForks, staleDays }) => ({
        view,
        includeArchived,
        includeForks,
        staleDays,
      }),
    },
  ),
);


export type ValueRequest = {
  kind: "secret" | "variable";
  name?: string;
  value?: string;

  places?: Place[];

  repos?: string[];
  env?: string;
};

export type EnvRequest = { name?: string; config?: EnvConfig; repos?: string[]; fixed?: boolean };

interface SecretsUi {
  search: string;
  onlyFlagged: boolean;
  value: ValueRequest | null;
  env: EnvRequest | null;
  set: (p: Partial<Pick<SecretsUi, "search" | "onlyFlagged" | "value" | "env">>) => void;
}

export const useSecretsUi = create<SecretsUi>()((set) => ({
  search: "",
  onlyFlagged: false,
  value: null,
  env: null,
  set: (p) => set(p),
}));
