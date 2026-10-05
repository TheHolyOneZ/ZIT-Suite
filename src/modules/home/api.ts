import { useQuery } from "@tanstack/react-query";
import { commands, unwrap, type SyncState } from "@/core/ipc";
import { queryClient } from "@/core/query";

export const homeKey = {
  list: ["home", "list"] as const,
  status: (id: string) => ["home", "status", id] as const,
  sync: (id: string) => ["home", "sync", id] as const,
  history: (id: string) => ["home", "history", id] as const,
  branches: (id: string) => ["home", "branches", id] as const,
  tree: (id: string, dir: string) => ["home", "tree", id, dir] as const,
  suggestions: (id: string) => ["home", "suggestions", id] as const,
  gitignore: (id: string) => ["home", "gitignore", id] as const,
};

export function useWorkspaces() {
  return useQuery({ queryKey: homeKey.list, queryFn: () => commands.wsList() });
}


export function useStatus(id: string) {
  return useQuery({
    queryKey: homeKey.status(id),
    queryFn: () => unwrap(commands.wsStatus(id)),
    staleTime: 3_000,
  });
}


export function useSync(id: string, enabled = true) {
  return useQuery({
    queryKey: homeKey.sync(id),
    queryFn: () => unwrap(commands.wsSync(id, true, null)),
    enabled,
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
}

export function useHistory(id: string) {
  return useQuery({
    queryKey: homeKey.history(id),
    queryFn: () => unwrap(commands.wsHistory(id, 200)),
    staleTime: 5_000,
  });
}

export function useBranches(id: string, enabled = true) {
  return useQuery({
    queryKey: homeKey.branches(id),
    queryFn: () => unwrap(commands.wsBranches(id)),
    enabled,
    staleTime: 5_000,
  });
}

export function useTree(id: string, dir: string, enabled = true) {
  return useQuery({
    queryKey: homeKey.tree(id, dir),
    queryFn: () => unwrap(commands.wsTree(id, dir)),
    enabled,
    staleTime: 5_000,
  });
}

export function useSuggestions(id: string) {
  return useQuery({
    queryKey: homeKey.suggestions(id),
    queryFn: () => unwrap(commands.wsSuggestions(id)),
    staleTime: 10_000,
  });
}

export function useGitignore(id: string, enabled: boolean) {
  return useQuery({
    queryKey: homeKey.gitignore(id),
    queryFn: () => unwrap(commands.wsGitignore(id)),
    enabled,
  });
}


export function refreshLocal(id: string) {
  for (const k of [
    homeKey.status(id),
    homeKey.history(id),
    homeKey.branches(id),
    homeKey.suggestions(id),
    homeKey.gitignore(id),
  ])
    void queryClient.invalidateQueries({ queryKey: k });
  void queryClient.invalidateQueries({ queryKey: ["home", "tree", id] });
  void recompare(id);
}


async function recompare(id: string) {
  const prev = queryClient.getQueryData<SyncState>(homeKey.sync(id));
  if (!prev) return;
  const r = await commands.wsSync(id, false, prev.reference?.branch ?? null);
  if (r.status !== "ok") return;
  queryClient.setQueryData<SyncState>(
    homeKey.sync(id),
    (cur) =>
      cur && {
        ...r.data,

        push:
          r.data.push && cur.push
            ? { ...r.data.push, missing: cur.push.missing, renamed_to: cur.push.renamed_to }
            : r.data.push,
        reference: r.data.reference
          ? {
              ...r.data.reference,
              missing: cur.reference?.missing ?? false,
              renamed_to: cur.reference?.renamed_to ?? null,
            }
          : cur.reference,
        checked_at: cur.checked_at,
      },
  );
}


export const refreshWorkspaces = () => void queryClient.invalidateQueries({ queryKey: homeKey.list });

export function refreshAll(id: string) {
  refreshLocal(id);
  void queryClient.invalidateQueries({ queryKey: homeKey.sync(id) });
}

export const refreshList = () => queryClient.invalidateQueries({ queryKey: homeKey.list });
