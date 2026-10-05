import { useQuery } from "@tanstack/react-query";
import { commands, unwrap } from "@/core/ipc";
import { queryClient } from "@/core/query";

export const useBranchList = (repo: string | null) =>
  useQuery({
    queryKey: ["files", "branches", repo],
    queryFn: () => unwrap(commands.pullsBranches(repo!)),
    enabled: !!repo,
    staleTime: 60_000,
  });

export const useRepoTree = (repo: string | null, branch: string | null) =>
  useQuery({
    queryKey: ["files", "tree", repo, branch],
    queryFn: () => unwrap(commands.filesTree(repo!, branch!, false)),
    enabled: !!repo && !!branch,
    staleTime: 30_000,
  });


export const useBlob = (repo: string | null, sha: string | null) =>
  useQuery({
    queryKey: ["files", "blob", repo, sha],
    queryFn: () => unwrap(commands.filesBlob(repo!, sha!)),
    enabled: !!repo && !!sha,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });

export const useFileHistory = (
  repo: string | null,
  branch: string | null,
  path: string | null,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ["files", "history", repo, branch, path],
    queryFn: () => unwrap(commands.filesHistory(repo!, branch!, path!)),
    enabled: enabled && !!repo && !!branch && !!path,
    staleTime: 30_000,
  });

export async function reloadTree(repo: string, branch: string) {
  const fresh = await unwrap(commands.filesTree(repo, branch, true));
  queryClient.setQueryData(["files", "tree", repo, branch], fresh);
  return fresh;
}
