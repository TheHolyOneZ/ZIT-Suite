import { create } from "zustand";
import type { Account, Session } from "@/bindings";

interface SessionState {
  session: Session | null;

  org: string | null;

  addingAccount: boolean;
  setSession: (s: Session) => void;
  setOrg: (org: string | null) => void;
  setAddingAccount: (v: boolean) => void;
}

export const useSession = create<SessionState>()((set) => ({
  session: null,
  org: null,
  addingAccount: false,
  setSession: (session) =>
    set((s) => ({ session, org: s.session?.active === session.active ? s.org : null })),
  setOrg: (org) => set({ org }),
  setAddingAccount: (addingAccount) => set({ addingAccount }),
}));

export function useActiveAccount(): Account | null {
  return useSession((s) => s.session?.accounts.find((a) => a.id === s.session?.active) ?? null);
}


export function useScopeKey(): [string, string] {
  const account = useSession((s) => s.session?.active ?? "none");
  const org = useSession((s) => s.org ?? "~");
  return [account, org];
}
