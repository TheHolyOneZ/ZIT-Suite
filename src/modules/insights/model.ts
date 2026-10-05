import type { QueueAction, Repo } from "@/core/ipc";

const DAY = 86_400_000;
export const daysSince = (iso: string | null, now = Date.now()) =>
  iso ? Math.floor((now - Date.parse(iso)) / DAY) : Infinity;


export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}


export const normName = (n: string) =>
  n
    .toLowerCase()
    .replace(/[-_.\s]+/g, "")
    .replace(/(old|copy|backup|bak|new|v\d+|\d+)$/, "");


export function nearDuplicates(repos: Repo[]): string[][] {
  const names = repos.map((r) => ({ full: r.full_name, n: normName(r.name) })).filter((x) => x.n.length >= 4);
  const parent = names.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i].n,
        b = names[j].n;
      if (Math.abs(a.length - b.length) > 2) continue;
      const limit = Math.min(a.length, b.length) >= 8 ? 2 : 1;
      if (a === b || levenshtein(a, b) <= limit) parent[find(i)] = find(j);
    }
  const groups = new Map<number, string[]>();
  names.forEach((x, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), x.full]));
  return [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort());
}

export type Severity = "critical" | "warning" | "info";
export type FixKind = "archive" | "set_private" | "delete";

export interface Rule {
  id: string;

  name?: string;
  severity: Severity;
  test: (r: Repo, now: number) => boolean;

  fix?: FixKind;
}


const SENSITIVE_WORDS = new Set([
  "secret",
  "secrets",
  "token",
  "tokens",
  "credential",
  "credentials",
  "creds",
  "apikey",
  "apikeys",
  "env",
  "dotenv",
  "private",
  "internal",
  "confidential",
  "leak",
  "leaked",
  "leaks",
]);

export const nameWords = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
export const soundsSensitive = (name: string) => nameWords(name).some((w) => SENSITIVE_WORDS.has(w));

export const RULES: Rule[] = [

  {
    id: "sensitivePublic",
    severity: "warning",
    fix: "set_private",
    test: (r) => !r.private && !r.archived && r.stargazers_count === 0 && soundsSensitive(r.name),
  },
  {
    id: "staleNotArchived",
    severity: "warning",
    fix: "archive",
    test: (r, now) => !r.archived && r.size > 0 && daysSince(r.pushed_at, now) > 365,
  },
  {
    id: "dormant",
    severity: "info",
    fix: "archive",
    test: (r, now) =>
      !r.archived && r.size > 0 && daysSince(r.pushed_at, now) > 180 && daysSince(r.pushed_at, now) <= 365,
  },

  {
    id: "empty",
    severity: "warning",
    fix: "delete",
    test: (r, now) => r.size === 0 && !r.archived && daysSince(r.created_at, now) > 14,
  },
  {
    id: "abandonedForks",
    severity: "info",
    fix: "delete",
    test: (r) =>
      r.fork && !r.archived && !!r.pushed_at && Date.parse(r.pushed_at) <= Date.parse(r.created_at) + 60_000,
  },
  { id: "noDescription", severity: "info", test: (r) => !r.archived && !r.fork && !r.description?.trim() },
  {
    id: "noTopics",
    severity: "info",
    test: (r) => !r.archived && !r.fork && !r.private && !(r.topics ?? []).length,
  },
  {
    id: "noLicense",
    severity: "warning",
    test: (r) => !r.archived && !r.fork && !r.private && r.size > 0 && !r.license,
  },
  { id: "manyIssues", severity: "warning", test: (r) => !r.archived && r.open_issues_count >= 20 },
  { id: "oversized", severity: "warning", test: (r) => r.size >= 500 * 1024 },
  {
    id: "largePublic",
    severity: "info",
    test: (r) => !r.private && r.size >= 100 * 1024 && r.size < 500 * 1024,
  },
  {
    id: "masterBranch",
    severity: "info",
    test: (r) => !r.archived && !r.fork && r.default_branch === "master",
  },
];

export const fixAction = (k: FixKind): QueueAction => ({ kind: k }) as QueueAction;

export interface Finding {
  rule: Rule;
  repos: Repo[];
}


export function runChecks(
  repos: Repo[],
  dismissed: Record<string, string[]>,
  now = Date.now(),
  extra: Rule[] = [],
): Finding[] {
  return [...RULES, ...extra].map((rule) => ({
    rule,
    repos: repos.filter((r) => rule.test(r, now) && !(dismissed[rule.id] ?? []).includes(r.full_name)),
  }));
}


export function tidyScore(repos: Repo[], findings: Finding[]): number {
  if (!repos.length) return 100;
  const bad = new Set(
    findings.filter((f) => f.rule.severity !== "info").flatMap((f) => f.repos.map((r) => r.full_name)),
  );
  return Math.round(((repos.length - bad.size) / repos.length) * 100);
}


export interface Count {
  key: string;
  count: number;
}

export function countBy<T>(
  items: T[],
  key: (t: T) => string | string[] | null | undefined,
  top = Infinity,
): Count[] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    for (const x of Array.isArray(k) ? k : [k]) if (x) m.set(x, (m.get(x) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, top);
}


export function perYear(repos: Repo[]): Count[] {
  const c = countBy(repos, (r) => r.created_at.slice(0, 4));
  if (!c.length) return [];
  const years = c.map((x) => Number(x.key));
  const out: Count[] = [];
  for (let y = Math.min(...years); y <= Math.max(...years); y++)
    out.push({ key: String(y), count: c.find((x) => x.key === String(y))?.count ?? 0 });
  return out;
}


export function pushesPerMonth(repos: Repo[], months = 24, now = new Date()): Count[] {
  const out: Count[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({ key: d.toISOString().slice(0, 7), count: 0 });
  }
  for (const r of repos) {
    const m = r.pushed_at?.slice(0, 7);
    const slot = out.find((x) => x.key === m);
    if (slot) slot.count++;
  }
  return out;
}
