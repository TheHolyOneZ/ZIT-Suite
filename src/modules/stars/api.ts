import { useQuery } from "@tanstack/react-query";
import { commands, unwrap, type Starred } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { queryClient } from "@/core/query";
import { useScopeKey } from "@/core/store/session";

export function useStars() {
  const scope = useScopeKey();
  return useQuery({ queryKey: ["stars", ...scope, "list"], queryFn: () => unwrap(commands.starsList()), staleTime: 5 * 60_000 });
}

export function useStarLists() {
  const scope = useScopeKey();
  return useQuery({ queryKey: ["stars", ...scope, "lists"], queryFn: () => unwrap(commands.starLists()), staleTime: 5 * 60_000, retry: false });
}

export const refreshStars = () => queryClient.invalidateQueries({ queryKey: ["stars"] });


export async function unstar(repos: string[]): Promise<number> {
  const snap = queryClient.getQueriesData<Starred[]>({ queryKey: ["stars"] });
  const hit = new Set(repos);
  queryClient.setQueriesData<Starred[]>({ queryKey: ["stars"], predicate: (q) => q.queryKey.at(-1) === "list" }, (d) => d?.filter((s) => !hit.has(s.repo)));
  try {
    const failed = await unwrap(commands.starsSet(repos, false));
    if (failed.length) for (const [k, v] of snap) queryClient.setQueryData(k, v);
    return repos.length - failed.length;
  } catch (e) {
    for (const [k, v] of snap) queryClient.setQueryData(k, v);
    toastError(e);
    return 0;
  }
}
