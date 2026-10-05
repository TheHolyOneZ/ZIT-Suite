import { useQuery } from "@tanstack/react-query";
import { commands, unwrap } from "@/core/ipc";
import { queryClient } from "@/core/query";
import { useScopeKey, useSession } from "@/core/store/session";

let freshNext = false;


export function refreshRepos() {
  freshNext = true;
  return queryClient.invalidateQueries({ queryKey: ["repos"] });
}

export function useRepoList() {
  const scope = useScopeKey();
  const org = useSession((s) => s.org);
  return useQuery({
    queryKey: ["repos", ...scope],
    queryFn: () => {
      const fresh = freshNext;
      freshNext = false;
      return unwrap(commands.reposList(org, fresh));
    },

    refetchInterval: 60_000,
  });
}
