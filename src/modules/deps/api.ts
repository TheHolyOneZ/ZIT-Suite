import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { commands, events, unwrap, type DepsTarget, type Latest } from "@/core/ipc";
import { useRepoList } from "@/core/data/repos";
import { queryClient } from "@/core/query";
import { useScopeKey } from "@/core/store/session";
import { keyOf } from "./model";


export function useTargets(days: number, forks: boolean): DepsTarget[] {
  const { data = [] } = useRepoList();
  return useMemo(() => {
    const since = days ? Date.now() - days * 86_400_000 : 0;
    return data
      .filter(
        (r) =>
          !r.archived &&
          r.default_branch &&
          (forks || !r.fork) &&
          (!since || (r.pushed_at && Date.parse(r.pushed_at) >= since)),
      )
      .map((r) => ({ repo: r.full_name, branch: r.default_branch! }))
      .sort((a, b) => a.repo.localeCompare(b.repo));
  }, [data, days, forks]);
}

export function useProgress() {
  const [p, setP] = useState<{ phase: string; done: number; total: number } | null>(null);
  useEffect(() => {
    const un = events.depsProgress.listen((e) => setP(e.payload));
    return () => void un.then((f) => f());
  }, []);
  return p;
}

const scanKey = (scope: readonly unknown[], targets: DepsTarget[]) =>
  ["deps", "scan", ...scope, targets.map((t) => t.repo).join(",")] as const;

export function useScan(targets: DepsTarget[], enabled: boolean) {
  const scope = useScopeKey();
  const key = scanKey(scope, targets);
  const q = useQuery({
    queryKey: key,
    queryFn: () => unwrap(commands.depsScan(targets, false)),
    enabled: enabled && targets.length > 0,
    staleTime: 10 * 60_000,
    gcTime: Infinity,
  });
  const rescan = async () => queryClient.setQueryData(key, await unwrap(commands.depsScan(targets, true)));
  return { ...q, rescan };
}


export function useLatest() {
  return useQuery({
    queryKey: ["deps", "latest"],
    queryFn: () => new Map<string, Latest>(),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export async function checkLatest(packages: { ecosystem: string; name: string }[]) {
  const answers = await unwrap(commands.depsLatest(packages));
  queryClient.setQueryData<Map<string, Latest>>(["deps", "latest"], (cur) => {
    const next = new Map(cur ?? []);
    for (const a of answers) next.set(keyOf(a.ecosystem, a.name), a);
    return next;
  });
  return answers;
}
