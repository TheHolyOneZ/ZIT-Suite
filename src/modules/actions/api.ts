import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { commands, events, unwrap, type Job } from "@/core/ipc";
import { useRepoList } from "@/core/data/repos";
import { queryClient } from "@/core/query";
import { useScopeKey } from "@/core/store/session";

export const actionsKey = {
  board: (scope: readonly unknown[], days: number, n: number) =>
    ["actions", "board", ...scope, days, n] as const,
  jobs: (repo: string, run: number) => ["actions", "jobs", repo, run] as const,
  artifacts: (repo: string, run: number) => ["actions", "artifacts", repo, run] as const,
  log: (repo: string, job: number) => ["actions", "log", repo, job] as const,
};


export function useBoardRepos(days: number) {
  const { data = [] } = useRepoList();
  return useMemo(() => {
    const since = days ? Date.now() - days * 86_400_000 : 0;
    return data
      .filter((r) => !r.archived && (!since || (r.pushed_at && Date.parse(r.pushed_at) >= since)))
      .map((r) => r.full_name)
      .sort();
  }, [data, days]);
}


export function useBoard(repos: string[], days: number) {
  const scope = useScopeKey();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    const un = events.actionsProgress.listen((e) => setProgress(e.payload));
    return () => void un.then((f) => f());
  }, []);
  const q = useQuery({
    queryKey: actionsKey.board(scope, days, repos.length),
    queryFn: () => unwrap(commands.actionsOverview(repos, false)),
    enabled: repos.length > 0,
    staleTime: 20_000,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((r) => r.runs.some((x) => x.status !== "completed")) ? 15_000 : 120_000,
  });
  return { ...q, progress };
}

export async function refreshBoard(repos: string[], key: readonly unknown[]) {
  queryClient.setQueryData(key, await unwrap(commands.actionsOverview(repos, true)));
}

const live = (jobs: Job[] | undefined) => (jobs ?? []).some((j) => j.status !== "completed");

export const useJobs = (repo: string, run: number, runLive: boolean) =>
  useQuery({
    queryKey: actionsKey.jobs(repo, run),
    queryFn: () => unwrap(commands.actionsJobs(repo, run, false)),
    staleTime: 3_000,
    refetchInterval: (q) => (runLive || live(q.state.data) ? 5_000 : false),
  });

export const useArtifacts = (repo: string, run: number, done: boolean) =>
  useQuery({
    queryKey: [...actionsKey.artifacts(repo, run), done],
    queryFn: () => unwrap(commands.actionsArtifacts(repo, run, false)),
    staleTime: 30_000,
  });


export const useJobLog = (repo: string, job: number | null, finished: boolean) =>
  useQuery({
    queryKey: actionsKey.log(repo, job ?? 0),
    queryFn: () => unwrap(commands.actionsJobLog(repo, job!)),
    enabled: job != null && finished,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });
