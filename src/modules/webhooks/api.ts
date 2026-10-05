import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { commands, events, unwrap, type HookHealth, type RepoHooks } from "@/core/ipc";
import { useRepoList } from "@/core/data/repos";
import { queryClient } from "@/core/query";
import { useScopeKey } from "@/core/store/session";
import { buildIndex, healthKey, hookState, urlKey, type Endpoint, type HookIndex } from "./model";
import { useHooksPrefs, useHooksUi } from "./store";


export function useHookTargets(): string[] {
  const { data = [] } = useRepoList();
  const includeArchived = useHooksPrefs((s) => s.includeArchived);
  const includeForks = useHooksPrefs((s) => s.includeForks);
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
  "hooks",
  "scan",
  ...scope,
  targets.length,
  targets.join("|").length,
];


let freshNext = false;
export function rescanHooks() {
  freshNext = true;
  return queryClient.invalidateQueries({ queryKey: ["hooks", "scan"] });
}

function useProgress(
  listen: typeof events.hooksScanProgress | typeof events.hooksHealthProgress,
  active: boolean,
) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    const un = listen.listen((e) => setProgress(e.payload));
    return () => void un.then((f) => f());
  }, [listen]);
  return active ? progress : null;
}

export function useHookScan() {
  const scope = useScopeKey();
  const targets = useHookTargets();
  const q = useQuery({
    queryKey: scanKey(scope, targets),
    queryFn: () => {
      const fresh = freshNext;
      freshNext = false;
      return unwrap(commands.hooksScan(targets, fresh));
    },
    enabled: targets.length > 0,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
  const progress = useProgress(events.hooksScanProgress, q.isFetching);
  return { ...q, targets, progress };
}

export function useHookIndex(): { index: HookIndex; scan: ReturnType<typeof useHookScan> } {
  const scan = useHookScan();
  const index = useMemo(() => buildIndex(scan.data ?? []), [scan.data]);
  return { index, scan };
}


export function useFilteredEndpoints(endpoints: Endpoint[]): Endpoint[] {
  const f = useHooksUi((s) => s.filter);
  return useMemo(() => {
    const q = f.search.toLowerCase();
    return endpoints
      .map((e) => ({
        ...e,
        hooks: e.hooks.filter(
          (h) =>
            (!f.state || hookState(h.hook) === f.state) &&
            (!f.event || h.hook.events.includes(f.event) || h.hook.events.includes("*")),
        ),
      }))
      .filter(
        (e) =>
          e.hooks.length > 0 &&
          (!q || e.url.toLowerCase().includes(q) || e.hooks.some((h) => h.repo.toLowerCase().includes(q))),
      );
  }, [endpoints, f]);
}


export function useEndpoint(key: string): Endpoint | undefined {
  const { index } = useHookIndex();
  return index.endpoints.find((e) => e.key === key);
}

export function useRepoHooks(repo: string) {
  return useQuery({
    queryKey: ["hooks", "repo", repo],
    queryFn: () => unwrap(commands.hooksList(repo, false)),
    staleTime: 15_000,
  });
}


export async function refreshRepoHooks(repo: string) {
  const fresh = await unwrap(commands.hooksList(repo, true));
  queryClient.setQueryData(["hooks", "repo", repo], fresh);
  queryClient.setQueriesData<RepoHooks[]>({ queryKey: ["hooks", "scan"] }, (d) =>
    d?.map((r) => (r.repo === repo ? fresh : r)),
  );
  return fresh;
}

export const deliveriesKey = (repo: string, id: number) => ["hooks", "deliveries", repo, id];


export function useDeliveries(repo: string, id: number) {
  return useInfiniteQuery({
    queryKey: deliveriesKey(repo, id),
    queryFn: ({ pageParam }) => unwrap(commands.hooksDeliveries(repo, id, pageParam, pageParam == null)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next ?? undefined,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export function useDelivery(repo: string, id: number, deliveryId: string) {
  return useQuery({
    queryKey: ["hooks", "delivery", repo, id, deliveryId],
    queryFn: () => unwrap(commands.hooksDelivery(repo, id, deliveryId)),
    staleTime: Infinity,
  });
}


export function useHookHealth(index: HookIndex) {
  const depth = useHooksPrefs((s) => s.healthDepth);
  const [requested, setRequested] = useState(false);
  const targets = useMemo(
    () => index.repos.flatMap((r) => r.hooks.map((h) => ({ repo: r.repo, id: h.id }))),
    [index],
  );
  const key = ["hooks", "health", depth, targets.map((t) => healthKey(t.repo, t.id)).join("|")];
  const cached = queryClient.getQueryData<HookHealth[]>(key);
  const q = useQuery({
    queryKey: key,
    queryFn: () => unwrap(commands.hooksHealth(targets, depth)),
    enabled: (requested || !!cached) && targets.length > 0,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
  });
  const map = useMemo(
    () => (q.data ? new Map(q.data.map((h) => [healthKey(h.repo, h.id), h])) : undefined),
    [q.data],
  );
  const progress = useProgress(events.hooksHealthProgress, q.isFetching);
  const run = () => (q.data ? q.refetch() : setRequested(true));
  return { ...q, map, run, progress, targets: targets.length };
}

export { urlKey };
