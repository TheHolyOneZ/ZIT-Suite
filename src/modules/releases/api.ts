import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { commands, events, unwrap } from "@/core/ipc";
import { useRepoList } from "@/core/data/repos";
import { queryClient } from "@/core/query";
import { useScopeKey } from "@/core/store/session";

export interface Target {
  repo: string;
  branch: string;
}


export function useBoardTargets(days: number): Target[] {
  const { data = [] } = useRepoList();
  return useMemo(() => {
    const since = days ? Date.now() - days * 86_400_000 : 0;
    return data
      .filter(
        (r) =>
          !r.archived &&
          r.permissions?.push &&
          r.default_branch &&
          (!since || (r.pushed_at && Date.parse(r.pushed_at) >= since)),
      )
      .map((r) => ({ repo: r.full_name, branch: r.default_branch! }))
      .sort((a, b) => a.repo.localeCompare(b.repo));
  }, [data, days]);
}

const boardKey = (scope: readonly unknown[], targets: Target[]) =>
  ["releases", "board", ...scope, targets.map((t) => t.repo).join(",")] as const;

export function useBoard(targets: Target[]) {
  const scope = useScopeKey();
  const key = boardKey(scope, targets);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    const un = events.releasesProgress.listen((e) => setProgress(e.payload));
    return () => void un.then((f) => f());
  }, []);
  const q = useQuery({
    queryKey: key,
    queryFn: () => unwrap(commands.releasesOverview(targets, false)),
    enabled: targets.length > 0,
    staleTime: 5 * 60_000,
    gcTime: Infinity,
  });
  const refresh = async () =>
    queryClient.setQueryData(key, await unwrap(commands.releasesOverview(targets, true)));
  return { ...q, progress, refresh };
}

export const reloadBoard = () => void queryClient.invalidateQueries({ queryKey: ["releases", "board"] });


export const useUnreleased = (repo: string, base: string | null, head: string | null) =>
  useQuery({
    queryKey: ["releases", "unreleased", repo, base, head],
    queryFn: () => unwrap(commands.releasesUnreleased(repo, base!, head!)),
    enabled: !!base && !!head,
    staleTime: 60_000,
  });
