import { LazyStore } from "@tauri-apps/plugin-store";
import { createJSONStorage, type StateStorage } from "zustand/middleware";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const store = inTauri ? new LazyStore("zit-suite.json") : null;

const tauriStorage: StateStorage = {
  getItem: async (name) => (await store!.get<string>(name)) ?? null,
  setItem: async (name, value) => {
    await store!.set(name, value);
    await store!.save();
  },
  removeItem: async (name) => {
    await store!.delete(name);
    await store!.save();
  },
};

export const persistStorage = createJSONStorage(() => (store ? tauriStorage : localStorage));
