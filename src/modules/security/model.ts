import type { Alert, AlertKind, Feature, FeatureState, Posture, RepoSecurity, Severity } from "@/core/ipc";

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "unknown"];
export const KINDS: AlertKind[] = ["dependency", "code", "secret"];
export const FEATURES: Feature[] = [
  "dependabot_alerts",
  "security_updates",
  "secret_scanning",
  "push_protection",
  "private_reporting",
  "code_scanning",
];

export const DEFAULT_BASELINE: Feature[] = [
  "dependabot_alerts",
  "security_updates",
  "secret_scanning",
  "push_protection",
  "private_reporting",
];

const rank = (s: Severity) => SEVERITIES.indexOf(s);
export const worse = (a: Severity, b: Severity) => (rank(a) <= rank(b) ? a : b);


export type SlaPreset = "strict" | "standard" | "relaxed";
export const SLA: Record<SlaPreset, Record<Severity, number>> = {
  strict: { critical: 3, high: 14, medium: 45, low: 90, unknown: 90 },
  standard: { critical: 7, high: 30, medium: 90, low: 180, unknown: 180 },
  relaxed: { critical: 30, high: 90, medium: 180, low: 365, unknown: 365 },
};

const DAY = 86_400_000;
export const ageDays = (iso: string, now = Date.now()) =>
  Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));
export const isOverdue = (a: Alert, sla: Record<Severity, number>, now = Date.now()) =>
  a.state === "open" && ageDays(a.created_at, now) > sla[a.severity];

export const postureOf = (p: Posture, f: Feature): FeatureState => p[f];


export interface AlertGroup {
  id: string;
  kind: AlertKind;
  key: string;
  title: string;
  severity: Severity;
  package: string | null;
  ecosystem: string | null;
  patched: string | null;
  items: { repo: string; alert: Alert }[];
  repos: number;
  oldest: string;
  overdue: number;
}

export type SeverityCounts = Record<Severity, number>;
const zero = (): SeverityCounts => ({ critical: 0, high: 0, medium: 0, low: 0, unknown: 0 });

export interface RepoRow {
  repo: string;
  private: boolean;
  archived: boolean;
  posture: Posture;
  counts: SeverityCounts;
  open: number;
  overdue: number;

  gaps: Feature[];
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  error: RepoSecurity["error"];
  partial: AlertKind[];
}


export interface FixPlan {
  id: string;
  package: string;
  ecosystem: string;

  target: string | null;
  severity: Severity;
  alerts: number;

  unfixable: number;
  repos: { repo: string; manifests: string[]; alerts: number }[];
}


export function compareVersions(a: string, b: string): number {
  const pa = a
    .split(/[-+]/)[0]
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
  const pb = b
    .split(/[-+]/)[0]
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function fixPlans(groups: AlertGroup[]): FixPlan[] {
  const plans = new Map<string, FixPlan>();
  for (const g of groups) {
    if (g.kind !== "dependency" || !g.package) continue;
    const id = `${g.ecosystem ?? ""}:${g.package}`;
    let p = plans.get(id);
    if (!p) {
      p = {
        id,
        package: g.package,
        ecosystem: g.ecosystem ?? "",
        target: null,
        severity: g.severity,
        alerts: 0,
        unfixable: 0,
        repos: [],
      };
      plans.set(id, p);
    }
    p.severity = worse(p.severity, g.severity);
    for (const { repo, alert } of g.items) {
      p.alerts++;
      if (!alert.patched) p.unfixable++;
      else if (!p.target || compareVersions(alert.patched, p.target) > 0) p.target = alert.patched;
      let r = p.repos.find((x) => x.repo === repo);
      if (!r) {
        r = { repo, manifests: [], alerts: 0 };
        p.repos.push(r);
      }
      r.alerts++;
      if (alert.location && !r.manifests.includes(alert.location)) r.manifests.push(alert.location);
    }
  }
  return [...plans.values()].sort(
    (a, b) =>
      rank(a.severity) - rank(b.severity) || b.alerts - a.alerts || a.package.localeCompare(b.package),
  );
}

export interface SecurityIndex {
  groups: AlertGroup[];
  fixes: FixPlan[];
  repos: RepoRow[];
  totals: SeverityCounts;
  overdue: number;
  gaps: number;
}


export function scoreOf(counts: SeverityCounts, gaps: number): number {
  const penalty = counts.critical * 25 + counts.high * 10 + counts.medium * 3 + counts.low + gaps * 8;
  return Math.max(0, 100 - penalty);
}
export const gradeOf = (score: number): RepoRow["grade"] =>
  score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";

export function gapsOf(p: Posture, baseline: Feature[]): Feature[] {
  return baseline.filter((f) => p[f] === "off");
}

export function buildIndex(
  scan: RepoSecurity[],
  baseline: Feature[],
  sla: Record<Severity, number>,
  now = Date.now(),
): SecurityIndex {
  const groups = new Map<string, AlertGroup>();
  const totals = zero();
  let overdue = 0;
  let gapCount = 0;
  const repos: RepoRow[] = scan.map((r) => {
    const counts = zero();
    let late = 0;
    for (const a of r.alerts) {
      if (a.state !== "open") continue;
      counts[a.severity]++;
      totals[a.severity]++;
      const od = isOverdue(a, sla, now);
      if (od) late++;
      const id = `${a.kind}:${a.key}`;
      let g = groups.get(id);
      if (!g) {
        g = {
          id,
          kind: a.kind,
          key: a.key,
          title: a.title,
          severity: a.severity,
          package: a.package,
          ecosystem: a.ecosystem,
          patched: a.patched,
          items: [],
          repos: 0,
          oldest: a.created_at,
          overdue: 0,
        };
        groups.set(id, g);
      }
      g.items.push({ repo: r.repo, alert: a });
      g.severity = worse(g.severity, a.severity);
      if (a.created_at < g.oldest) g.oldest = a.created_at;
      if (od) g.overdue++;
      g.patched ??= a.patched;
    }
    overdue += late;
    const gaps = r.error ? [] : gapsOf(r.posture, baseline);
    gapCount += gaps.length ? 1 : 0;
    const open = Object.values(counts).reduce((x, y) => x + y, 0);
    const score = scoreOf(counts, gaps.length);
    return {
      repo: r.repo,
      private: r.private,
      archived: r.archived,
      posture: r.posture,
      counts,
      open,
      overdue: late,
      gaps,
      score,
      grade: gradeOf(score),
      error: r.error,
      partial: r.partial,
    };
  });
  for (const g of groups.values()) g.repos = new Set(g.items.map((i) => i.repo)).size;
  const sorted = [...groups.values()].sort(
    (a, b) =>
      rank(a.severity) - rank(b.severity) ||
      b.items.length - a.items.length ||
      a.title.localeCompare(b.title),
  );
  return {
    groups: sorted,
    fixes: fixPlans(sorted),
    repos: repos.sort((a, b) => a.score - b.score || b.open - a.open || a.repo.localeCompare(b.repo)),
    totals,
    overdue,
    gaps: gapCount,
  };
}


export const REASONS: Record<AlertKind, string[]> = {
  dependency: ["fix_started", "inaccurate", "no_bandwidth", "not_used", "tolerable_risk"],
  code: ["false positive", "won't fix", "used in tests"],
  secret: ["revoked", "false_positive", "wont_fix", "used_in_tests"],
};

export type ReasonKey =
  | "fix_started"
  | "inaccurate"
  | "no_bandwidth"
  | "not_used"
  | "tolerable_risk"
  | "false_positive"
  | "won_t_fix"
  | "wont_fix"
  | "used_in_tests"
  | "revoked";
export const reasonKey = (r: string) => r.replace(/[^a-z]+/g, "_") as ReasonKey;


export function baselinePlan(rows: RepoRow[]): { repo: string; feature: Feature }[] {
  return rows.flatMap((r) => r.gaps.map((feature) => ({ repo: r.repo, feature })));
}

const csvCell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function alertsCsv(groups: AlertGroup[]): string {
  const head = [
    "repo",
    "kind",
    "severity",
    "title",
    "key",
    "package",
    "ecosystem",
    "location",
    "patched",
    "created_at",
    "url",
  ];
  const rows = groups.flatMap((g) =>
    g.items.map(({ repo, alert: a }) => [
      repo,
      a.kind,
      a.severity,
      a.title,
      a.key,
      a.package,
      a.ecosystem,
      a.location,
      a.patched,
      a.created_at,
      a.html_url,
    ]),
  );
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
