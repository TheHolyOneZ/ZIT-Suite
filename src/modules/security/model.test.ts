import { describe, expect, it } from "vitest";
import type { Alert, Posture, RepoSecurity } from "@/core/ipc";
import {
  alertsCsv,
  baselinePlan,
  buildIndex,
  compareVersions,
  gapsOf,
  gradeOf,
  isOverdue,
  reasonKey,
  scoreOf,
  SLA,
} from "./model";

const NOW = Date.parse("2026-10-01T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const alert = (p: Partial<Alert>): Alert => ({
  kind: "dependency",
  number: 1,
  state: "open",
  severity: "high",
  key: "GHSA-1",
  title: "Prototype pollution",
  description: null,
  package: "lodash",
  ecosystem: "npm",
  location: "package-lock.json",
  vulnerable_range: "< 4.17.21",
  patched: "4.17.21",
  ghsa: "GHSA-1",
  cve: null,
  cvss: null,
  tool: null,
  validity: null,
  push_protection_bypassed: false,
  reason: null,
  comment: null,
  html_url: "u",
  created_at: daysAgo(1),
  updated_at: null,
  closed_at: null,
  ...p,
});

const posture = (p: Partial<Posture> = {}): Posture => ({
  dependabot_alerts: "on",
  security_updates: "off",
  secret_scanning: "unavailable",
  push_protection: "unavailable",
  private_reporting: "unavailable",
  code_scanning: "unavailable",
  ...p,
});

const repo = (name: string, alerts: Alert[], p?: Partial<Posture>): RepoSecurity => ({
  repo: name,
  private: true,
  archived: false,
  posture: posture(p),
  alerts,
  partial: [],
  error: null,
});

describe("security model", () => {
  it("groups the same advisory across repos, worst severity first", () => {
    const idx = buildIndex(
      [
        repo("o/a", [
          alert({ number: 1 }),
          alert({ number: 2, key: "rule", kind: "code", severity: "low", title: "x" }),
        ]),
        repo("o/b", [alert({ number: 7, severity: "critical", created_at: daysAgo(40) })]),
        repo("o/c", [alert({ number: 3, state: "dismissed" })]),
      ],
      ["dependabot_alerts", "security_updates"],
      SLA.standard,
      NOW,
    );
    expect(idx.groups.map((g) => g.id)).toEqual(["dependency:GHSA-1", "code:rule"]);
    const g = idx.groups[0];
    expect([g.severity, g.repos, g.items.length, g.overdue]).toEqual(["critical", 2, 2, 1]);
    expect(idx.totals.critical + idx.totals.high + idx.totals.low).toBe(3);

    expect(idx.repos.find((r) => r.repo === "o/c")!.open).toBe(0);
    expect(idx.gaps).toBe(3);
    expect(idx.repos[0].repo).toBe("o/b");
  });

  it("only counts features GitHub offers as gaps", () => {
    expect(gapsOf(posture(), ["dependabot_alerts", "security_updates", "secret_scanning"])).toEqual([
      "security_updates",
    ]);
    const rows = buildIndex(
      [repo("o/a", [], { security_updates: "on" }), repo("o/b", [])],
      ["security_updates"],
      SLA.standard,
      NOW,
    ).repos;
    expect(baselinePlan(rows)).toEqual([{ repo: "o/b", feature: "security_updates" }]);
  });

  it("scores and grades", () => {
    expect(scoreOf({ critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }, 0)).toBe(100);
    expect(scoreOf({ critical: 1, high: 1, medium: 0, low: 0, unknown: 0 }, 1)).toBe(57);
    expect([gradeOf(95), gradeOf(80), gradeOf(60), gradeOf(45), gradeOf(10)]).toEqual([
      "A",
      "B",
      "C",
      "D",
      "F",
    ]);
  });

  it("overdue follows the SLA preset", () => {
    const a = alert({ severity: "critical", created_at: daysAgo(5) });
    expect(isOverdue(a, SLA.strict, NOW)).toBe(true);
    expect(isOverdue(a, SLA.standard, NOW)).toBe(false);
    expect(isOverdue({ ...a, state: "dismissed" }, SLA.strict, NOW)).toBe(false);
  });

  it("reason keys and CSV", () => {
    expect(reasonKey("won't fix")).toBe("won_t_fix");
    expect(reasonKey("used in tests")).toBe("used_in_tests");
    const csv = alertsCsv(
      buildIndex([repo("o/a", [alert({ title: 'say "hi", ok' })])], [], SLA.standard, NOW).groups,
    );
    expect(csv.split("\n")[1]).toContain('"say ""hi"", ok"');
  });

  it("fix plans pick the highest patched version per package", () => {
    expect(compareVersions("4.18.0", "4.17.21")).toBeGreaterThan(0);
    expect(compareVersions("1.2.6", "1.2.10")).toBeLessThan(0);
    const idx = buildIndex(
      [
        repo("o/a", [
          alert({ number: 1, key: "G1", patched: "4.17.21" }),
          alert({ number: 2, key: "G2", patched: "4.18.0", severity: "medium" }),
        ]),
        repo("o/b", [
          alert({ number: 5, key: "G1", patched: "4.17.21", location: "web/package-lock.json" }),
          alert({ number: 6, key: "G3", package: "minimist", patched: null }),
        ]),
      ],
      [],
      SLA.standard,
      NOW,
    );
    const lodash = idx.fixes.find((f) => f.package === "lodash")!;
    expect([lodash.target, lodash.alerts, lodash.repos.length, lodash.unfixable]).toEqual([
      "4.18.0",
      3,
      2,
      0,
    ]);
    expect(idx.fixes.find((f) => f.package === "minimist")).toMatchObject({ target: null, unfixable: 1 });
  });
});
