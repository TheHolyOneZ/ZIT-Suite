import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useInfiniteQuery, useQuery, type InfiniteData } from "@tanstack/react-query";
import { commands, unwrap, type PullSearch, type PullSummary } from "@/core/ipc";
import { queryClient } from "@/core/query";
import { useActiveAccount, useSession } from "@/core/store/session";
import { buildPullQuery, pullKey } from "./query";
import { usePullsUi } from "./store";

export function useEffectivePullQuery() {
  const login = useActiveAccount()?.login ?? "";
  const filter = usePullsUi((s) => s.filter);
  const raw = usePullsUi((s) => s.rawQuery);
  return useMemo(() => (raw !== null ? raw : buildPullQuery(filter, login)), [raw, filter, login]);
}


export function usePullSearch() {
  const account = useSession((s) => s.session?.active);
  const query = useEffectivePullQuery();
  const waiting = usePullsUi(
    (s) => s.rawQuery === null && s.filter.scope.kind === "repo" && !s.filter.scope.repo,
  );
  const q = useInfiniteQuery({
    queryKey: ["pulls", "search", account, query],
    queryFn: ({ pageParam }) => unwrap(commands.pullsSearch(query, pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.has_next ? last.end_cursor : undefined),
    enabled: !!account && !waiting && query.trim().length > 0,
    staleTime: 30_000,
  });
  const pulls = useMemo(() => {
    const seen = new Set<string>();
    const out: PullSummary[] = [];
    for (const p of q.data?.pages ?? [])
      for (const i of p.items) {
        const k = pullKey(i.repo, i.number);
        if (!seen.has(k)) {
          seen.add(k);
          out.push(i);
        }
      }
    return out;
  }, [q.data]);
  return { ...q, pulls, total: q.data?.pages[0]?.total_count ?? 0 };
}


function useListedUpdatedAt(repo: string, number: number): string | null {
  return useSyncExternalStore(
    (cb) => queryClient.getQueryCache().subscribe(cb),
    () => {
      let best: string | null = null;
      for (const [, d] of queryClient.getQueriesData<InfiniteData<PullSearch>>({
        queryKey: ["pulls", "search"],
      }))
        for (const pg of d?.pages ?? [])
          for (const i of pg.items)
            if (i.repo === repo && i.number === number && (!best || i.updated_at > best)) best = i.updated_at;
      return best;
    },
  );
}

export function usePull(repo: string, number: number) {
  const q = useQuery({
    queryKey: ["pulls", "one", repo, number],
    queryFn: () => unwrap(commands.pullsGet(repo, number)),
    staleTime: 10_000,

    refetchInterval: (q) =>
      q.state.data &&
      q.state.data.state === "open" &&
      (q.state.data.mergeable === null || q.state.data.mergeable_state === "unknown")
        ? 3_000
        : false,
  });
  const updated = q.data?.updated_at;
  const listed = useListedUpdatedAt(repo, number);

  useEffect(() => {
    if (updated && listed && Date.parse(listed) > Date.parse(updated))
      void queryClient.invalidateQueries({ queryKey: ["pulls", "one", repo, number] });
  }, [listed, updated, repo, number]);

  const sha = q.data?.head.sha;
  const lastSha = useRef(sha);
  useEffect(() => {
    if (lastSha.current && sha && lastSha.current !== sha)
      for (const k of ["files", "commits", "reviewComments"])
        void queryClient.invalidateQueries({ queryKey: ["pulls", k, repo, number] });
    lastSha.current = sha;
  }, [sha, repo, number]);
  return q;
}

export function useMergeSettings(repo: string) {
  return useQuery({
    queryKey: ["pulls", "mergeSettings", repo],
    queryFn: () => unwrap(commands.pullsMergeSettings(repo)),
    staleTime: 5 * 60_000,
  });
}

export function usePullFiles(repo: string, number: number, enabled = true) {
  return useQuery({
    queryKey: ["pulls", "files", repo, number],
    queryFn: () => unwrap(commands.pullsFiles(repo, number)),
    enabled,
    staleTime: 60_000,
  });
}
export function usePullCommits(repo: string, number: number, enabled = true) {
  return useQuery({
    queryKey: ["pulls", "commits", repo, number],
    queryFn: () => unwrap(commands.pullsCommits(repo, number)),
    enabled,
    staleTime: 60_000,
  });
}
export function usePullReviews(repo: string, number: number) {
  return useQuery({
    queryKey: ["pulls", "reviews", repo, number],
    queryFn: () => unwrap(commands.pullsReviews(repo, number)),
  });
}
export function useReviewComments(repo: string, number: number) {
  return useQuery({
    queryKey: ["pulls", "reviewComments", repo, number],
    queryFn: () => unwrap(commands.pullsReviewComments(repo, number)),
    staleTime: 15_000,
  });
}

export function useChecks(repo: string, sha: string | undefined) {
  return useQuery({
    queryKey: ["pulls", "checks", repo, sha],
    queryFn: () => unwrap(commands.pullsChecks(repo, sha!)),
    enabled: !!sha,

    refetchInterval: (q) => {
      const runs = q.state.data;
      if (runs?.some((c) => c.status !== "completed")) return 10_000;
      if (runs && runs.length === 0 && q.state.dataUpdateCount < 12) return 10_000;
      return false;
    },
  });
}
export function useBranches(repo: string | null) {
  return useQuery({
    queryKey: ["branches", repo],
    queryFn: () => unwrap(commands.pullsBranches(repo!)),
    enabled: !!repo,
    staleTime: 60_000,
  });
}


export async function refreshPull(repo: string, number: number) {
  await queryClient.invalidateQueries({ queryKey: ["pulls", "one", repo, number] });
  await queryClient.invalidateQueries({ queryKey: ["pulls", "reviews", repo, number] });
  void queryClient.invalidateQueries({ queryKey: ["pulls", "mergeSettings", repo] });
  const fresh = await commands.pullsGet(repo, number);
  if (fresh.status !== "ok") return;
  const p = fresh.data;
  queryClient.setQueriesData<InfiniteData<PullSearch>>({ queryKey: ["pulls", "search"] }, (d) =>
    d
      ? {
          ...d,
          pages: d.pages.map((pg) => ({
            ...pg,
            items: pg.items.map((i) =>
              i.repo === repo && i.number === number
                ? {
                    ...i,
                    title: p.title,
                    state: p.merged ? "MERGED" : p.state === "open" ? "OPEN" : "CLOSED",
                    is_draft: p.draft,
                    labels: p.labels,
                    assignees: p.assignees,
                    mergeable: p.mergeable === false ? "CONFLICTING" : p.mergeable ? "MERGEABLE" : "UNKNOWN",
                  }
                : i,
            ),
          })),
        }
      : d,
  );
}
