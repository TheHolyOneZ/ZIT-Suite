import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { commands, events, unwrap, type RepoSecurity } from "@/core/ipc";
import { useRepoList } from "@/core/data/repos";
import { queryClient } from "@/core/query";
import { useScopeKey } from "@/core/store/session";
import { buildIndex, SLA, type SecurityIndex } from "./model";
import { useSecurityPrefs } from "./store";


export function useSecurityTargets(): string[] {
  const { data = [] } = useRepoList();
  const includeArchived = useSecurityPrefs((s) => s.includeArchived);
  const includeForks = useSecurityPrefs((s) => s.includeForks);
  return useMemo(
    () =>
      data
        .filter((r) => r.permissions?.admin && (includeArchived || !r.archived) && (includeForks || !r.fork))
        .map((r) => r.full_name)
        .sort(),
    [data, includeArchived, includeForks],
  );
}

const scanKey = (scope: string[], targets: string[]) => [
  "security",
  "scan",
  ...scope,
  targets.length,
  targets.join("|").length,
];


let freshNext = false;
export function rescanSecurity() {
  freshNext = true;
  return queryClient.invalidateQueries({ queryKey: ["security", "scan"] });
}

export function useSecurityScan() {
  const scope = useScopeKey();
  const targets = useSecurityTargets();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    const un = events.securityScanProgress.listen((e) => setProgress(e.payload));
    return () => void un.then((f) => f());
  }, []);
  const q = useQuery({
    queryKey: scanKey(scope, targets),
    queryFn: () => {
      const fresh = freshNext;
      freshNext = false;
      return unwrap(commands.securityScan(targets, fresh));
    },
    enabled: targets.length > 0,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
  return { ...q, targets, progress: q.isFetching ? progress : null };
}

export function useSecurityIndex(): { index: SecurityIndex; scan: ReturnType<typeof useSecurityScan> } {
  const scan = useSecurityScan();
  const baseline = useSecurityPrefs((s) => s.baseline);
  const sla = useSecurityPrefs((s) => s.sla);
  const index = useMemo(() => buildIndex(scan.data ?? [], baseline, SLA[sla]), [scan.data, baseline, sla]);
  return { index, scan };
}


export function useRepoSecurity(repo: string, closed: boolean) {
  return useQuery({
    queryKey: ["security", "repo", repo, closed],
    queryFn: () => unwrap(commands.securityRepo(repo, closed, false)),
    staleTime: 15_000,
  });
}


export async function refreshRepoSecurity(repo: string) {
  const fresh = await unwrap(commands.securityRepo(repo, false, true));
  queryClient.setQueriesData<RepoSecurity[]>({ queryKey: ["security", "scan"] }, (d) =>
    d?.map((r) => (r.repo === repo ? fresh : r)),
  );
  void queryClient.invalidateQueries({ queryKey: ["security", "repo", repo] });
  return fresh;
}
