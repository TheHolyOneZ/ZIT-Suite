import { useQuery } from "@tanstack/react-query";
import { commands, unwrap } from "@/core/ipc";
import { useRepoList } from "@/core/data/repos";
import { queryClient } from "@/core/query";

export const branchesKey = {
  list: (repo: string) => ["branches", "list", repo] as const,
  protection: (repo: string, branch: string) => ["branches", "protection", repo, branch] as const,
  rulesets: (repo: string) => ["branches", "rulesets", repo] as const,
};

export const useRepoMeta = (repo: string | null) => useRepoList().data?.find((r) => r.full_name === repo);


export function useBranches(repo: string, defaultBranch: string | null) {
  return useQuery({
    queryKey: branchesKey.list(repo),
    queryFn: () => unwrap(commands.branchesList(repo, defaultBranch)),
    staleTime: 30_000,
  });
}

export const useRulesets = (repo: string) =>
  useQuery({
    queryKey: branchesKey.rulesets(repo),
    queryFn: () => unwrap(commands.branchesRulesets(repo)),
    staleTime: 5 * 60_000,
  });

export const useProtection = (repo: string, branch: string) =>
  useQuery({
    queryKey: branchesKey.protection(repo, branch),
    queryFn: () => unwrap(commands.branchesProtection(repo, branch)),
    staleTime: 0,
    retry: false,
  });


export function reloadBranches(repo: string) {
  void queryClient.invalidateQueries({ queryKey: ["branches", "list", repo] });
  setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["branches", "list", repo] }), 2500);
  void queryClient.invalidateQueries({ queryKey: ["files", "branches", repo] });
}
