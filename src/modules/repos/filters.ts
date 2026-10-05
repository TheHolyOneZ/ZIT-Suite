import type { Repo } from "@/core/ipc";
import type { Health, HealthStatus } from "./health";

export type TriState = "any" | "only" | "exclude";
export type Range = [number | null, number | null];

export interface RepoFilter {
  search: string;
  health: HealthStatus[];
  visibility: "all" | "public" | "private";
  languages: string[];
  tags: string[];
  fork: TriState;
  template: TriState;
  hasIssues: boolean;
  stars: Range;
  sizeKb: Range;
  createdAfter: string | null;
  createdBefore: string | null;
}

export const DEFAULT_FILTER: RepoFilter = {
  search: "",
  health: [],
  visibility: "all",
  languages: [],
  tags: [],
  fork: "any",
  template: "any",
  hasIssues: false,
  stars: [null, null],
  sizeKb: [null, null],
  createdAfter: null,
  createdBefore: null,
};

export type SortKey = "name" | "updated" | "created" | "stars" | "size" | "language" | "health" | "issues";
export interface Sort {
  key: SortKey;
  dir: "asc" | "desc";
}

export const NO_LANGUAGE = "∅";

export interface RepoRow {
  repo: Repo;
  health: Health;
  tags: string[];
}

const tri = (state: TriState, v: boolean) => state === "any" || (state === "only" ? v : !v);
const inRange = ([min, max]: Range, v: number) => (min == null || v >= min) && (max == null || v <= max);

export function matches(row: RepoRow, f: RepoFilter): boolean {
  const { repo, health, tags } = row;
  if (f.search) {
    const hay = [repo.full_name, repo.description ?? "", repo.language ?? "", ...(repo.topics ?? []), ...tags]
      .join(" ")
      .toLowerCase();
    if (
      !f.search
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((tok) => hay.includes(tok))
    )
      return false;
  }
  if (f.health.length && !f.health.includes(health.status)) return false;
  if (f.visibility !== "all" && repo.private !== (f.visibility === "private")) return false;
  if (f.languages.length && !f.languages.includes(repo.language ?? NO_LANGUAGE)) return false;
  if (f.tags.length && !f.tags.some((t) => tags.includes(t))) return false;
  if (!tri(f.fork, repo.fork) || !tri(f.template, repo.is_template)) return false;
  if (f.hasIssues && repo.open_issues_count === 0) return false;
  if (!inRange(f.stars, repo.stargazers_count) || !inRange(f.sizeKb, repo.size)) return false;
  if (f.createdAfter && repo.created_at < f.createdAfter) return false;
  if (f.createdBefore && repo.created_at.slice(0, 10) > f.createdBefore) return false;
  return true;
}

const cmp: Record<SortKey, (a: RepoRow, b: RepoRow) => number> = {
  name: (a, b) => a.repo.name.localeCompare(b.repo.name, undefined, { sensitivity: "base" }),
  updated: (a, b) =>
    (a.repo.pushed_at ?? a.repo.updated_at).localeCompare(b.repo.pushed_at ?? b.repo.updated_at),
  created: (a, b) => a.repo.created_at.localeCompare(b.repo.created_at),
  stars: (a, b) => a.repo.stargazers_count - b.repo.stargazers_count,
  size: (a, b) => a.repo.size - b.repo.size,
  issues: (a, b) => a.repo.open_issues_count - b.repo.open_issues_count,
  language: (a, b) => (a.repo.language ?? "~").localeCompare(b.repo.language ?? "~"),
  health: (a, b) => a.health.score - b.health.score,
};

export function applyFilter(rows: RepoRow[], f: RepoFilter, sort: Sort): RepoRow[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  return rows.filter((r) => matches(r, f)).sort((a, b) => cmp[sort.key](a, b) * dir || cmp.name(a, b));
}


export function activeFilterCount(f: RepoFilter): number {
  return (Object.keys(DEFAULT_FILTER) as (keyof RepoFilter)[]).filter(
    (k) => k !== "search" && JSON.stringify(f[k]) !== JSON.stringify(DEFAULT_FILTER[k]),
  ).length;
}
