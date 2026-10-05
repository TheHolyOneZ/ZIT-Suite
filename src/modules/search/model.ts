import type { SearchKind } from "@/core/ipc";

export const KINDS: SearchKind[] = ["repos", "code", "issues", "commits", "users"];


export type SortKey =
  | "best-match"
  | "stars"
  | "forks"
  | "updated"
  | "created"
  | "comments"
  | "reactions"
  | "author-date"
  | "committer-date"
  | "followers"
  | "repositories"
  | "joined";
export const SORTS: Record<SearchKind, SortKey[]> = {
  repos: ["best-match", "stars", "forks", "updated"],
  code: ["best-match"],
  issues: ["best-match", "created", "updated", "comments", "reactions"],
  commits: ["best-match", "author-date", "committer-date"],
  users: ["best-match", "followers", "repositories", "joined"],
};


export const HINTS: Record<SearchKind, string[]> = {
  repos: ["language:rust", "stars:>100", "pushed:>2026-01-01", "topic:cli", "archived:false", "is:public"],
  code: ["language:typescript", "path:src/", "extension:rs", "filename:Cargo.toml", "symbol:main"],
  issues: [
    "is:open",
    "is:pr",
    "is:issue",
    "author:@me",
    "assignee:@me",
    "review-requested:@me",
    "label:bug",
    "no:assignee",
  ],
  commits: ["author:@me", "committer-date:>2026-01-01", "merge:false"],
  users: ["type:user", "type:org", "followers:>100", "location:berlin", "language:rust"],
};


export function scoped(q: string, kind: SearchKind, mine: boolean, login: string | null): string {
  if (!mine || !login || kind === "users") return q.trim();
  const qual = kind === "issues" ? `involves:${login}` : `user:${login}`;
  return q.includes(qual) ? q.trim() : `${q.trim()} ${qual}`.trim();
}


export function toggleHint(q: string, hint: string): string {
  const parts = q.split(/\s+/).filter(Boolean);
  return parts.includes(hint) ? parts.filter((p) => p !== hint).join(" ") : [...parts, hint].join(" ");
}


export function runs(text: string, matches: [number, number][]): { text: string; hit: boolean }[] {
  const chars = [...text];
  const out: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const [a, b] of [...matches].sort((x, y) => x[0] - y[0])) {
    if (a < at) continue;
    if (a > at) out.push({ text: chars.slice(at, a).join(""), hit: false });
    out.push({ text: chars.slice(a, b).join(""), hit: true });
    at = b;
  }
  if (at < chars.length) out.push({ text: chars.slice(at).join(""), hit: false });
  return out;
}


export const remember = (list: { kind: SearchKind; q: string }[], next: { kind: SearchKind; q: string }) =>
  [next, ...list.filter((x) => !(x.kind === next.kind && x.q === next.q))].slice(0, 12);
