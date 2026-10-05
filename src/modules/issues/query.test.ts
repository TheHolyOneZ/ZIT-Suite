import { describe, expect, it } from "vitest";
import {
  buildQuery,
  DEFAULT_ISSUE_FILTER,
  parseQuery,
  tokenize,
  viewFilter,
  type IssueFilter,
} from "./query";

const NOW = Date.parse("2026-10-01T00:00:00Z");
const f = (p: Partial<IssueFilter>): IssueFilter => ({
  ...DEFAULT_ISSUE_FILTER,
  labels: [],
  excludeLabels: [],
  ...p,
});

describe("buildQuery", () => {
  it("defaults to open issues in my repos", () => {
    expect(buildQuery(DEFAULT_ISSUE_FILTER, "me", NOW)).toBe("is:issue is:open user:me");
  });
  it("quotes multi-word labels and milestones, handles negation and none", () => {
    const q = buildQuery(
      f({
        scope: { kind: "repo", repo: "o/r" },
        labels: ["good first issue"],
        excludeLabels: ["wontfix"],
        assignee: "none",
        milestone: "v1 beta",
      }),
      "me",
      NOW,
    );
    expect(q).toBe(
      'is:issue is:open repo:o/r label:"good first issue" -label:wontfix no:assignee milestone:"v1 beta"',
    );
  });
  it("adds closed reason only for closed/all states", () => {
    expect(buildQuery(f({ state: "open", reason: "not_planned" }), "me", NOW)).not.toContain("reason:");
    expect(buildQuery(f({ state: "closed", reason: "not_planned" }), "me", NOW)).toContain(
      'reason:"not planned"',
    );
  });
  it("turns stale days into an updated:< date", () => {
    expect(buildQuery(f({ staleDays: 30 }), "me", NOW)).toContain("updated:<2026-09-01");
  });
});

describe("parseQuery", () => {
  it("round-trips everything buildQuery produces", () => {
    const original = f({
      scope: { kind: "org", org: "acme" },
      state: "closed",
      reason: "completed",
      labels: ["bug", "needs triage"],
      excludeLabels: ["duplicate"],
      assignee: "@me",
      author: "octocat",
      milestone: "none",
      staleDays: 30,
      text: "crash on start",
    });
    expect(parseQuery(buildQuery(original, "me", NOW), "me", NOW)).toEqual(original);
  });
  it("keeps unknown qualifiers in extra", () => {
    const p = parseQuery("is:issue language:rust -author:bot comments:>5 flaky", "me", NOW);
    expect(p.extra).toBe("language:rust -author:bot comments:>5");
    expect(p.text).toBe("flaky");
    expect(p.scope).toEqual({ kind: "everywhere" });
  });
  it("recognizes user:<login> as 'mine'", () => {
    expect(parseQuery("user:me is:open", "me", NOW).scope).toEqual({ kind: "mine" });
  });
});

describe("tokenize / views", () => {
  it("keeps quoted values together", () => {
    expect(tokenize('label:"a b" "exact phrase" x')).toEqual(['label:"a b"', '"exact phrase"', "x"]);
  });
  it("built-in views produce valid queries", () => {
    expect(buildQuery(viewFilter("assigned"), "me", NOW)).toBe("is:issue is:open assignee:@me");
    expect(buildQuery(viewFilter("unassigned"), "me", NOW)).toBe("is:issue is:open user:me no:assignee");
  });
});
