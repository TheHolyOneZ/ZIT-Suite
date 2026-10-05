import { useQuery } from "@tanstack/react-query";
import { commands, unwrap, type Release, type Run } from "@/core/ipc";
import { queryClient } from "@/core/query";
import { notesFromCommits } from "./ghmodel";

export const ghKey = {
  about: (repo: string) => ["home", "gh", repo, "about"] as const,
  releases: (repo: string) => ["home", "gh", repo, "releases"] as const,
  tags: (repo: string) => ["home", "gh", repo, "tags"] as const,
  workflows: (repo: string) => ["home", "gh", repo, "workflows"] as const,
  runs: (repo: string) => ["home", "gh", repo, "runs"] as const,
};

export const useAbout = (repo: string) =>
  useQuery({
    queryKey: ghKey.about(repo),
    queryFn: () => unwrap(commands.aboutGet(repo, true)),
    staleTime: 30_000,
  });
export const useReleases = (repo: string) =>
  useQuery({
    queryKey: ghKey.releases(repo),
    queryFn: () => unwrap(commands.releasesList(repo, false)),
    staleTime: 15_000,
  });
export const useTags = (repo: string) =>
  useQuery({
    queryKey: ghKey.tags(repo),
    queryFn: () => unwrap(commands.tagsList(repo, false)),
    staleTime: 15_000,
  });
export const useWorkflows = (repo: string) =>
  useQuery({
    queryKey: ghKey.workflows(repo),
    queryFn: () => unwrap(commands.actionsWorkflows(repo, false)),
    staleTime: 30_000,
  });

const active = (r: Run) => r.status !== "completed";

export const useRuns = (repo: string) =>
  useQuery({
    queryKey: ghKey.runs(repo),
    queryFn: () => unwrap(commands.actionsRuns(repo, null, false)),
    staleTime: 5_000,
    refetchInterval: (q) => ((q.state.data ?? []).some(active) ? 8_000 : 60_000),
  });


export async function refreshGh(repo: string, what: "about" | "releases" | "actions") {
  if (what === "about")
    queryClient.setQueryData(ghKey.about(repo), await unwrap(commands.aboutGet(repo, true)));
  if (what === "releases") {
    queryClient.setQueryData(ghKey.releases(repo), await unwrap(commands.releasesList(repo, true)));
    queryClient.setQueryData(ghKey.tags(repo), await unwrap(commands.tagsList(repo, true)));
  }
  if (what === "actions") {
    queryClient.setQueryData(ghKey.runs(repo), await unwrap(commands.actionsRuns(repo, null, true)));
    queryClient.setQueryData(ghKey.workflows(repo), await unwrap(commands.actionsWorkflows(repo, true)));
  }
}


export function patchReleases(
  repo: string,
  change: { upsert?: Release; removeId?: number; removeAsset?: number },
) {
  queryClient.setQueryData<Release[]>(ghKey.releases(repo), (cur = []) => {
    let list = cur
      .filter((r) => r.id !== change.removeId && r.id !== change.upsert?.id)
      .map((r) =>
        change.removeAsset == null
          ? r
          : { ...r, assets: r.assets.filter((a) => a.id !== change.removeAsset) },
      );
    if (change.upsert)
      list = [change.upsert, ...list].sort((a, b) =>
        (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at),
      );
    return list;
  });
  for (const ms of [3000, 8000])
    setTimeout(() => void refreshGh(repo, "releases").catch(() => undefined), ms);
}


export async function writeNotes(
  repo: string,
  tag: string,
  target: string | null,
  previous: string | null,
  labels: { features: string; fixes: string; other: string },
): Promise<{ name: string; body: string }> {
  const n = await unwrap(commands.releaseNotes(repo, tag, target, previous));
  const listsChanges = /^\s*[*-] /m.test(n.body);
  if (listsChanges || !previous || !target) return n;
  const u = await unwrap(commands.releasesUnreleased(repo, previous, target)).catch(() => null);
  const fromCommits = u ? notesFromCommits(u.commits, labels) : "";
  return { name: n.name, body: fromCommits ? `${fromCommits}\n\n${n.body}` : n.body };
}
