import { useEffect, useRef } from "react";
import { create } from "zustand";

export type SheetParams = Record<string, string | number | boolean | null>;

export interface SheetRef {
  key: string;
  module: string;
  view: string;
  params: SheetParams;
}

let seq = 0;
const make = (module: string, view: string, params: SheetParams = {}): SheetRef => ({ key: `s${++seq}`, module, view, params });
export const rootSheet = (module: string) => make(module, "root");

interface SheetsState {
  active: string;
  stacks: Record<string, SheetRef[]>;

  open: (module: string) => void;

  push: (module: string, view: string, params?: SheetParams) => void;
  pop: () => void;
  popTo: (index: number) => void;

  patchTop: (params: SheetParams) => void;

  patchWhere: (module: string, view: string, where: (p: SheetParams) => boolean, params: SheetParams) => void;

  intents: Record<string, SheetParams | null>;
  openWith: (module: string, intent: SheetParams) => void;
  consumeIntent: (module: string) => SheetParams | null;
}

const stackOf = (s: SheetsState, m = s.active) => s.stacks[m] ?? defaultStack(m);

export const useSheets = create<SheetsState>()((set, get) => ({
  intents: {},
  openWith: (module, intent) =>
    set((s) => ({ active: module, stacks: { ...s.stacks, [module]: [stackOf(s, module)[0]] }, intents: { ...s.intents, [module]: intent } })),
  consumeIntent: (module) => {
    const i = get().intents[module] ?? null;
    if (i) set((s) => ({ intents: { ...s.intents, [module]: null } }));
    return i;
  },
  active: "repos",
  stacks: {},
  open: (module) =>
    set((s) => {
      if (s.active === module) return { stacks: { ...s.stacks, [module]: [stackOf(s, module)[0]] } };
      return { active: module, stacks: { ...s.stacks, [module]: stackOf(s, module) } };
    }),
  push: (module, view, params = {}) =>
    set((s) => {
      const stack = stackOf(s);
      const top = stack[stack.length - 1];
      const next = make(module, view, params);
      const replace = stack.length > 1 && top.module === module && top.view === view;
      return { stacks: { ...s.stacks, [s.active]: replace ? [...stack.slice(0, -1), next] : [...stack, next] } };
    }),
  pop: () =>
    set((s) => {
      const stack = stackOf(s);
      return stack.length > 1 ? { stacks: { ...s.stacks, [s.active]: stack.slice(0, -1) } } : s;
    }),
  popTo: (index) => set((s) => ({ stacks: { ...s.stacks, [s.active]: stackOf(s).slice(0, Math.max(1, index + 1)) } })),
  patchWhere: (module, view, where, params) =>
    set((s) => {
      const stack = s.stacks[module];
      if (!stack) return s;
      const next = stack.map((x) => (x.module === module && x.view === view && where(x.params) ? { ...x, params: { ...x.params, ...params } } : x));
      return { stacks: { ...s.stacks, [module]: next } };
    }),
  patchTop: (params) =>
    set((s) => {
      const stack = stackOf(s);
      const top = stack[stack.length - 1];
      return { stacks: { ...s.stacks, [s.active]: [...stack.slice(0, -1), { ...top, params: { ...top.params, ...params } }] } };
    }),
}));


const defaults = new Map<string, SheetRef[]>();
const defaultStack = (m: string) => {
  if (!defaults.has(m)) defaults.set(m, [rootSheet(m)]);
  return defaults.get(m)!;
};

export function useActiveStack(): SheetRef[] {
  return useSheets((s) => s.stacks[s.active] ?? defaultStack(s.active));
}


export function useTopSheet(module: string, view: string): SheetParams | null {
  return useSheets((s) => {
    const st = s.stacks[s.active];
    const top = st?.[st.length - 1];
    return top && top.module === module && top.view === view ? top.params : null;
  });
}

export const sheets = {
  push: (module: string, view: string, params?: SheetParams) => useSheets.getState().push(module, view, params),
  pop: () => useSheets.getState().pop(),
  open: (module: string) => useSheets.getState().open(module),
  openWith: (module: string, intent: SheetParams) => useSheets.getState().openWith(module, intent),
};


export function useIntent(module: string, handler: (intent: SheetParams) => void) {
  const pending = useSheets((s) => s.intents[module]);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!pending) return;
    const i = useSheets.getState().consumeIntent(module);
    if (i) ref.current(i);
  }, [pending, module]);
}
