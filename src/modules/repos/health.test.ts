import { describe, expect, it } from "vitest";
import type { Repo } from "@/core/ipc";
import { computeHealth } from "./health";

const NOW = Date.parse("2026-10-01T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const T = { activeDays: 30, dormantDays: 180 };

export function repo(p: Partial<Repo> = {}): Repo {
  return {
    id: 1,
    name: "r",
    full_name: "o/r",
    owner: { login: "o", avatar_url: "" },
    private: false,
    fork: false,
    archived: false,
    is_template: false,
    description: null,
    html_url: "",
    homepage: null,
    language: "Rust",
    topics: [],
    stargazers_count: 0,
    forks_count: 0,
    watchers_count: 0,
    open_issues_count: 0,
    size: 100,
    default_branch: "main",
    created_at: daysAgo(400),
    updated_at: daysAgo(1),
    pushed_at: daysAgo(1),
    visibility: "public",
    permissions: { admin: true, push: true, pull: true },
    license: null,
    ...p,
  };
}

describe("computeHealth", () => {
  it("classifies by days since last push", () => {
    expect(computeHealth(repo({ pushed_at: daysAgo(10) }), T, NOW).status).toBe("active");
    expect(computeHealth(repo({ pushed_at: daysAgo(90) }), T, NOW).status).toBe("dormant");
    expect(computeHealth(repo({ pushed_at: daysAgo(400) }), T, NOW).status).toBe("dead");
  });

  it("archived and empty take precedence", () => {
    expect(computeHealth(repo({ archived: true, size: 0 }), T, NOW).status).toBe("archived");
    expect(computeHealth(repo({ size: 0 }), T, NOW).status).toBe("empty");
  });

  it("respects custom thresholds", () => {
    expect(
      computeHealth(repo({ pushed_at: daysAgo(10) }), { activeDays: 7, dormantDays: 14 }, NOW).status,
    ).toBe("dormant");
  });

  it("scores stars, description and issue load, clamped to 0–100", () => {
    const base = computeHealth(repo(), T, NOW).score;
    expect(computeHealth(repo({ stargazers_count: 1000, description: "x" }), T, NOW).score).toBeGreaterThan(
      base,
    );
    expect(computeHealth(repo({ open_issues_count: 50 }), T, NOW).score).toBe(base - 5);
    expect(
      computeHealth(
        repo({ stargazers_count: 1e9, description: "x", license: { spdx_id: "MIT", name: "MIT" } }),
        T,
        NOW,
      ).score,
    ).toBeLessThanOrEqual(100);
  });
});
