import { useMemo } from "react";
import { useInfiniteQuery, useQuery, type InfiniteData } from "@tanstack/react-query";
import { commands, unwrap, type Issue, type IssueSearch } from "@/core/ipc";
import { queryClient } from "@/core/query";
import { useActiveAccount, useSession } from "@/core/store/session";
import { buildQuery, issueKey } from "./query";
import { useIssuesPrefs, useIssuesUi } from "./store";

const PER_PAGE = 50;

export const SEARCH_CAP = 1000;


export function useEffectiveQuery() {
  const login = useActiveAccount()?.login ?? "";
  const filter = useIssuesUi((s) => s.filter);
  const raw = useIssuesUi((s) => s.rawQuery);
  return useMemo(() => (raw !== null ? raw : buildQuery(filter, login)), [raw, filter, login]);
}

export function useIssueSearch() {
  const account = useSession((s) => s.session?.active);
  const query = useEffectiveQuery();
  const sort = useIssuesPrefs((s) => s.sort);
  const order = useIssuesPrefs((s) => s.order);

  const waiting = useIssuesUi(
    (s) => s.rawQuery === null && s.filter.scope.kind === "repo" && !s.filter.scope.repo,
  );
  const q = useInfiniteQuery({
    queryKey: ["issues", "search", account, query, sort, order],
    queryFn: ({ pageParam }) => unwrap(commands.issuesSearch(query, sort, order, pageParam)),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => {
      const loaded = pages.length * PER_PAGE;
      return loaded < Math.min(last.total_count, SEARCH_CAP) ? pages.length + 1 : undefined;
    },
    enabled: !!account && !waiting && query.trim().length > 0,
    staleTime: 30_000,
  });
  const issues = useMemo(() => {
    const seen = new Set<string>();
    const out: Issue[] = [];
    for (const p of q.data?.pages ?? [])
      for (const i of p.items) {
        const k = issueKey(i.repo, i.number);
        if (!seen.has(k)) {
          seen.add(k);
          out.push(i);
        }
      }
    return out;
  }, [q.data]);
  return {
    ...q,
    issues,
    total: q.data?.pages[0]?.total_count ?? 0,
    incomplete: q.data?.pages.some((p) => p.incomplete_results) ?? false,
  };
}

export function useIssue(repo: string | null, number: number | null, initial?: Issue) {
  return useQuery({
    queryKey: ["issues", "one", repo, number],
    queryFn: () => unwrap(commands.issuesGet(repo!, number!)),
    enabled: !!repo && !!number,
    initialData: initial,
    staleTime: 15_000,
  });
}

export function useComments(repo: string | null, number: number | null) {
  return useQuery({
    queryKey: ["issues", "comments", repo, number],
    queryFn: () => unwrap(commands.issuesComments(repo!, number!)),
    enabled: !!repo && !!number,
  });
}

export function useLabels(repo: string | null) {
  return useQuery({
    queryKey: ["labels", repo],
    queryFn: () => unwrap(commands.labelsList(repo!)),
    enabled: !!repo,
    staleTime: 5 * 60_000,
  });
}

export function useMilestones(repo: string | null, filter: "open" | "closed" | "all" = "open") {
  return useQuery({
    queryKey: ["milestones", repo, filter],
    queryFn: () => unwrap(commands.milestonesList(repo!, filter)),
    enabled: !!repo,
    staleTime: 5 * 60_000,
  });
}

export function useAssignable(repo: string | null) {
  return useQuery({
    queryKey: ["assignable", repo],
    queryFn: () => unwrap(commands.issuesAssignable(repo!)),
    enabled: !!repo,
    staleTime: 10 * 60_000,
  });
}


export function putIssue(issue: Issue) {
  queryClient.setQueryData(["issues", "one", issue.repo, issue.number], issue);

  void queryClient.invalidateQueries({ queryKey: ["milestones", issue.repo] });
  queryClient.setQueriesData<InfiniteData<IssueSearch>>({ queryKey: ["issues", "search"] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            items: p.items.map((i) => (i.repo === issue.repo && i.number === issue.number ? issue : i)),
          })),
        }
      : data,
  );
}


export async function refreshIssues(keys: { repo: string; number: number }[]) {
  await Promise.all(
    keys.map(async ({ repo, number }) => {
      const r = await commands.issuesGet(repo, number);
      if (r.status === "ok") putIssue(r.data);
    }),
  );
}
