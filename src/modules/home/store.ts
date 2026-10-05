import type { Source } from "@/core/ipc";
import { create } from "zustand";

interface HomeUi {

  add: string | null;

  clone: string[] | null;

  conflict: { id: string; source: Source; branch: string } | null;
  set: (p: Partial<Pick<HomeUi, "add" | "clone" | "conflict">>) => void;
}

export const useHomeUi = create<HomeUi>()((set) => ({
  add: null,
  clone: null,
  conflict: null,
  set: (p) => set(p),
}));
