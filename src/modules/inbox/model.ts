import type { Thread } from "@/core/ipc";
import type { Glyph, Tone } from "@/ui";


export const REASONS: Record<string, { rank: number; glyph: Glyph; tone: Tone }> = {
  review_requested: { rank: 0, glyph: "open", tone: "accent" },
  security_alert: { rank: 0, glyph: "warn", tone: "danger" },
  mention: { rank: 1, glyph: "info", tone: "accent" },
  team_mention: { rank: 1, glyph: "info", tone: "info" },
  assign: { rank: 1, glyph: "pending", tone: "accent" },
  approval_requested: { rank: 1, glyph: "pending", tone: "warn" },
  invitation: { rank: 2, glyph: "open", tone: "info" },
  author: { rank: 3, glyph: "equal", tone: "idle" },
  comment: { rank: 3, glyph: "equal", tone: "idle" },
  state_change: { rank: 4, glyph: "skip", tone: "idle" },
  ci_activity: { rank: 4, glyph: "running", tone: "idle" },
  manual: { rank: 4, glyph: "equal", tone: "idle" },
  subscribed: { rank: 5, glyph: "void", tone: "idle" },
};
export const reasonOf = (r: string) =>
  REASONS[r] ?? { rank: 5, glyph: "void" as Glyph, tone: "idle" as Tone };
type ReasonKey =
  | "review_requested"
  | "security_alert"
  | "mention"
  | "team_mention"
  | "assign"
  | "approval_requested"
  | "invitation"
  | "author"
  | "comment"
  | "state_change"
  | "ci_activity"
  | "manual"
  | "subscribed"
  | "other";

export const reasonKey = (r: string) => (r in REASONS ? r : "other") as ReasonKey;

export const KINDS = [
  "PullRequest",
  "Issue",
  "Release",
  "Commit",
  "Discussion",
  "CheckSuite",
  "RepositoryVulnerabilityAlert",
] as const;
export const kindKey = (k: string) =>
  ((KINDS as readonly string[]).includes(k) ? k : "Other") as (typeof KINDS)[number] | "Other";


export const isUrgent = (t: Thread) => t.unread && reasonOf(t.reason).rank <= 1;

export type GroupBy = "none" | "repo" | "reason";
export interface Group {
  key: string;
  threads: Thread[];
  unread: number;
}

export function groupThreads(threads: Thread[], by: GroupBy): Group[] {
  if (by === "none") return [{ key: "", threads, unread: threads.filter((t) => t.unread).length }];
  const map = new Map<string, Thread[]>();
  for (const t of threads) {
    const k = by === "repo" ? t.repo : t.reason;
    map.set(k, [...(map.get(k) ?? []), t]);
  }
  const groups = [...map.entries()].map(([key, ts]) => ({
    key,
    threads: ts,
    unread: ts.filter((t) => t.unread).length,
  }));
  return by === "reason"
    ? groups.sort(
        (a, b) => reasonOf(a.key).rank - reasonOf(b.key).rank || b.threads.length - a.threads.length,
      )
    : groups.sort(
        (a, b) => b.unread - a.unread || b.threads.length - a.threads.length || a.key.localeCompare(b.key),
      );
}

export interface InboxFilter {
  search: string;
  reasons: string[];
  kinds: string[];
  repo: string | null;

  owner?: string | null;
}

export function filterThreads(threads: Thread[], f: InboxFilter): Thread[] {
  const q = f.search.trim().toLowerCase();
  return threads.filter(
    (t) =>
      (!f.reasons.length || f.reasons.includes(t.reason)) &&
      (!f.kinds.length || f.kinds.includes(kindKey(t.kind))) &&
      (!f.repo || t.repo === f.repo) &&
      (!f.owner || t.repo.split("/")[0].toLowerCase() === f.owner.toLowerCase()) &&
      (!q || t.title.toLowerCase().includes(q) || t.repo.toLowerCase().includes(q)),
  );
}


export function noisiest(threads: Thread[], n = 5): { repo: string; count: number }[] {
  const m = new Map<string, number>();
  for (const t of threads) m.set(t.repo, (m.get(t.repo) ?? 0) + 1);
  return [...m.entries()]
    .map(([repo, count]) => ({ repo, count }))
    .sort((a, b) => b.count - a.count || a.repo.localeCompare(b.repo))
    .slice(0, n);
}


export function newlyUrgent(prev: Thread[] | undefined, next: Thread[]): Thread[] {
  if (!prev) return [];
  const seen = new Map(prev.map((t) => [t.id, t.updated_at]));
  return next.filter((t) => isUrgent(t) && seen.get(t.id) !== t.updated_at);
}
