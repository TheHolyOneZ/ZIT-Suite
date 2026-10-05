import { create } from "zustand";

interface UiState {
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  notificationsOpen: boolean;
  set: (patch: Partial<Omit<UiState, "set">>) => void;
}

export const useUi = create<UiState>()((set) => ({
  paletteOpen: false,
  shortcutsOpen: false,
  notificationsOpen: false,
  set: (patch) => set(patch),
}));
