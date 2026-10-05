import type { RepoReleases } from "@/core/ipc";
import { nextVersions } from "@/modules/home/ghmodel";

export type Bump = "patch" | "minor" | "major";


export function suggestBump(messages: string[]): Bump {
  if (messages.some((m) => /^\w+(\([^)]*\))?!:/.test(m) || /BREAKING[ -]CHANGE/.test(m))) return "major";
  if (messages.some((m) => /^feat(ure)?(\([^)]*\))?:/i.test(m) || /^add(ed)?\b/i.test(m))) return "minor";
  return "patch";
}


export const nextTag = (tags: string[], bump: Bump) =>
  nextVersions(tags.map((name) => ({ name, sha: "" })))[bump];

export type BoardFilter = "all" | "waiting" | "never";


export function sortBoard(rows: RepoReleases[]): RepoReleases[] {
  const rank = (r: RepoReleases) => ((r.since ?? 0) > 0 ? 0 : r.releases === 0 ? 1 : 2);
  return [...rows].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (b.since ?? 0) - (a.since ?? 0) ||
      (b.latest?.published_at ?? "").localeCompare(a.latest?.published_at ?? "") ||
      a.repo.localeCompare(b.repo),
  );
}

export const isWaiting = (r: RepoReleases) => (r.since ?? 0) > 0;
