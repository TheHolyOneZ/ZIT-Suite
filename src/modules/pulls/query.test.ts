import { describe, expect, it } from "vitest";
import {
  buildPullQuery,
  DEFAULT_PULL_FILTER,
  parsePullQuery,
  pullViewFilter,
  type PullFilter,
} from "./query";

const NOW = Date.parse("2026-10-01T00:00:00Z");
const f = (p: Partial<PullFilter>): PullFilter => ({
  ...DEFAULT_PULL_FILTER,
  labels: [],
  excludeLabels: [],
  ...p,
});

describe("buildPullQuery", () => {
  it("uses is:pr and PR qualifiers", () => {
    expect(buildPullQuery(DEFAULT_PULL_FILTER, "me", NOW)).toBe("is:pr is:open user:me sort:updated-desc");
    expect(buildPullQuery(f({ review: "approved", checks: "failure", draft: "ready" }), "me", NOW)).toBe(
      "is:pr is:open user:me review:approved status:failure draft:false sort:updated-desc",
    );
  });
  it("merged state becomes is:merged", () => {
    expect(buildPullQuery(f({ state: "merged" }), "me", NOW)).toBe(
      "is:pr is:merged user:me sort:updated-desc",
    );
  });
  it("keeps free text last", () => {
    expect(buildPullQuery(f({ text: "fix crash", review: "none" }), "me", NOW)).toBe(
      "is:pr is:open user:me review:none sort:updated-desc fix crash",
    );
  });
  it("views", () => {
    expect(buildPullQuery(pullViewFilter("reviewRequested"), "me", NOW)).toBe(
      "is:pr is:open review-requested:@me sort:updated-desc",
    );
  });
});

describe("parsePullQuery", () => {
  it("round-trips", () => {
    const original = f({
      scope: { kind: "repo", repo: "o/r" },
      state: "merged",
      review: "changes_requested",
      checks: "pending",
      draft: "draft",
      reviewRequested: "@me",
      labels: ["bug"],
      text: "x",
      sort: "created",
    });
    expect(parsePullQuery(buildPullQuery(original, "me", NOW), "me", NOW)).toEqual(original);
  });
});
