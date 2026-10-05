import { create } from "zustand";
import type { Visibility } from "./model";

interface GistsUi {
  starred: boolean;
  search: string;
  visibility: Visibility;
  language: string | null;
  creating: boolean;
  set: (p: Partial<Omit<GistsUi, "set">>) => void;
}

export const useGistsUi = create<GistsUi>()((set) => ({
  starred: false,
  search: "",
  visibility: "all",
  language: null,
  creating: false,
  set: (p) => set(p),
}));
