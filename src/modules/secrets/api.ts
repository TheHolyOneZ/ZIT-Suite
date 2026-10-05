import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { commands, events, unwrap, type RepoSecrets } from "@/core/ipc";
import { useRepoList } from "@/core/data/repos";
import { queryClient } from "@/core/query";
import { useScopeKey } from "@/core/store/session";
import { buildIndex, type SecretsIndex } from "./model";
import { useSecretsPrefs } from "./store";


export function useSecretTargets(): string[] {
  const { data = [] } = useRepoList();
  const includeArchived = useSecretsPrefs((s) => s.includeArchived);
  const includeForks = useSecretsPrefs((s) => s.includeForks);
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
  "secrets",
  "scan",
  ...scope,
  targets.length,
  targets.join("|").length,
];


let freshNext = false;
export function rescanSecrets() {
  freshNext = true;
  return queryClient.invalidateQueries({ queryKey: ["secrets", "scan"] });
}

export function useSecretsScan() {
  const scope = useScopeKey();
  const targets = useSecretTargets();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    const un = events.secretsScanProgress.listen((e) => setProgress(e.payload));
    return () => void un.then((f) => f());
  }, []);
  const q = useQuery({
    queryKey: scanKey(scope, targets),
    queryFn: () => {
      const fresh = freshNext;
      freshNext = false;
      return unwrap(commands.secretsScan(targets, fresh));
    },
    enabled: targets.length > 0,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
  return { ...q, targets, progress: q.isFetching ? progress : null };
}

export function useSecretsIndex(): { index: SecretsIndex; scan: ReturnType<typeof useSecretsScan> } {
  const scan = useSecretsScan();
  const staleDays = useSecretsPrefs((s) => s.staleDays);
  const index = useMemo(() => buildIndex(scan.data ?? [], staleDays), [scan.data, staleDays]);
  return { index, scan };
}

export function useRepoSecrets(repo: string) {
  return useQuery({
    queryKey: ["secrets", "repo", repo],
    queryFn: () => unwrap(commands.secretsRepo(repo, false)),
    staleTime: 15_000,
  });
}


export async function refreshRepoSecrets(repo: string) {
  const fresh = await unwrap(commands.secretsRepo(repo, true));
  queryClient.setQueryData(["secrets", "repo", repo], fresh);
  queryClient.setQueriesData<RepoSecrets[]>({ queryKey: ["secrets", "scan"] }, (d) =>
    d?.map((r) => (r.repo === repo ? fresh : r)),
  );
  return fresh;
}
