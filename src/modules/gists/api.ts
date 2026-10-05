import { useQuery } from "@tanstack/react-query";
import { commands, unwrap, type Gist } from "@/core/ipc";
import { queryClient } from "@/core/query";
import { useScopeKey } from "@/core/store/session";

let freshNext = false;
export const gistsKey = (scope: string[], starred: boolean) => [
  "gists",
  ...scope,
  starred ? "starred" : "mine",
];

export function useGists(starred: boolean) {
  const scope = useScopeKey();
  return useQuery({
    queryKey: gistsKey(scope, starred),
    queryFn: () => {
      const f = freshNext;
      freshNext = false;
      return unwrap(commands.gistsList(starred, f));
    },
    staleTime: 60_000,
  });
}

export function refreshGists() {
  freshNext = true;
  return queryClient.invalidateQueries({ queryKey: ["gists"] });
}


export const useGist = (id: string, rev: string | null) =>
  useQuery({
    queryKey: ["gist", id, rev ?? "head"],
    queryFn: () => unwrap(commands.gistGet(id, rev)),
    staleTime: 30_000,
  });

export const useRevisions = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: ["gist", id, "revisions"],
    queryFn: () => unwrap(commands.gistRevisions(id)),
    enabled,
    staleTime: 30_000,
  });


export function putGist(g: Gist) {
  queryClient.setQueryData(["gist", g.id, "head"], g);
  queryClient.setQueriesData<Gist[]>({ queryKey: ["gists"] }, (d) =>
    d?.map((x) => (x.id === g.id ? { ...g, files: g.files.map((f) => ({ ...f, content: null })) } : x)),
  );
  void queryClient.invalidateQueries({ queryKey: ["gist", g.id, "revisions"] });
}

export function dropGist(id: string) {
  queryClient.setQueriesData<Gist[]>({ queryKey: ["gists"] }, (d) => d?.filter((x) => x.id !== id));
}
