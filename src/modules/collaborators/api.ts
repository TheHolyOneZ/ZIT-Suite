import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { commands, events, unwrap, type RepoAccess } from "@/core/ipc";
import { useRepoList } from "@/core/data/repos";
import { queryClient } from "@/core/query";
import { useActiveAccount, useScopeKey } from "@/core/store/session";
import { buildIndex, roleRank, type AccessIndex, type Person } from "./model";
import { useAccessPrefs, useAccessUi } from "./store";


export function useScanTargets(): string[] {
  const { data = [] } = useRepoList();
  const includeArchived = useAccessPrefs((s) => s.includeArchived);
  const includeForks = useAccessPrefs((s) => s.includeForks);
  return useMemo(
    () =>
      data
        .filter((r) => r.permissions?.admin && (includeArchived || !r.archived) && (includeForks || !r.fork))
        .map((r) => r.full_name)
        .sort(),
    [data, includeArchived, includeForks],
  );
}

export const scanKey = (scope: string[], targets: string[]) => ["access", "scan", ...scope, targets.length, targets.join("|").length];


let freshNext = false;
export function rescanAccess() {
  freshNext = true;
  return queryClient.invalidateQueries({ queryKey: ["access"] });
}


export function useAccessScan() {
  const scope = useScopeKey();
  const targets = useScanTargets();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    const un = events.accessScanProgress.listen((e) => setProgress(e.payload));
    return () => void un.then((f) => f());
  }, []);
  const q = useQuery({
    queryKey: scanKey(scope, targets),
    queryFn: () => {
      const fresh = freshNext;
      freshNext = false;
      return unwrap(commands.collabScan(targets, fresh));
    },
    enabled: targets.length > 0,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
  return { ...q, targets, progress: q.isFetching ? progress : null };
}

export function useAccessIndex(): { index: AccessIndex; scan: ReturnType<typeof useAccessScan> } {
  const scan = useAccessScan();
  const me = useActiveAccount()?.login ?? "";
  const index = useMemo(() => buildIndex(scan.data ?? [], me), [scan.data, me]);
  return { index, scan };
}

export function useFilteredPeople(people: Person[]): Person[] {
  const f = useAccessUi((s) => s.filter);
  return useMemo(() => {
    const q = f.search.toLowerCase();
    return people
      .map((p) => ({ ...p, grants: p.grants.filter((g) => (!f.minRole || roleRank(g.role) >= roleRank(f.minRole)) && (!f.pendingOnly || g.invite)) }))
      .filter(
        (p) =>
          p.grants.length > 0 &&
          (f.kind === "any" || (f.kind === "bots" ? p.kind === "Bot" : p.kind !== "Bot")) &&
          (!q || p.login.toLowerCase().includes(q) || p.grants.some((g) => g.repo.toLowerCase().includes(q))),
      );
  }, [people, f]);
}

export function useRepoAccess(repo: string) {
  return useQuery({ queryKey: ["access", "repo", repo], queryFn: () => unwrap(commands.collabAccess(repo, false)), staleTime: 15_000 });
}


export async function refreshRepoAccess(repo: string) {
  const fresh = await unwrap(commands.collabAccess(repo, true));
  queryClient.setQueryData(["access", "repo", repo], fresh);
  queryClient.setQueriesData<RepoAccess[]>({ queryKey: ["access", "scan"] }, (d) => d?.map((r) => (r.repo === repo ? fresh : r)));
}
