import { describe, expect, it } from "vitest";
import type { Repo } from "@/core/ipc";
import { condComplete, matches, toRule } from "./custom";
import { runChecks } from "./model";

const NOW = Date.parse("2026-10-01T00:00:00Z");
const repo = (p: Partial<Repo>): Repo =>
  ({
    name: "demo-app",
    full_name: "me/demo-app",
    private: false,
    fork: false,
    archived: false,
    is_template: false,
    description: null,
    homepage: null,
    language: "Rust",
    topics: ["cli", "tool"],
    stargazers_count: 3,
    forks_count: 0,
    open_issues_count: 0,
    size: 2048,
    pushed_at: "2026-09-01T00:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
    default_branch: "main",
    license: null,
    ...p,
  }) as unknown as Repo;

describe("custom rules", () => {
  it("evaluates each kind of condition", () => {
    const r = repo({});
    expect(matches(r, { field: "pushedDays", op: "gt", value: "20" }, NOW)).toBe(true);
    expect(matches(r, { field: "pushedDays", op: "lt", value: "20" }, NOW)).toBe(false);
    expect(matches(r, { field: "sizeMb", op: "gt", value: "1.5" }, NOW)).toBe(true);
    expect(matches(r, { field: "hasDescription", op: "no", value: "" }, NOW)).toBe(true);
    expect(matches(r, { field: "language", op: "is", value: "rust" }, NOW)).toBe(true);
    expect(matches(r, { field: "name", op: "contains", value: "DEMO" }, NOW)).toBe(true);
    expect(matches(r, { field: "topic", op: "is", value: "cli" }, NOW)).toBe(true);
    expect(matches(r, { field: "topic", op: "notContains", value: "web" }, NOW)).toBe(true);
  });

  it("needs complete conditions and all of them", () => {
    expect(condComplete({ field: "stars", op: "gt", value: "x" })).toBe(false);
    expect(condComplete({ field: "fork", op: "yes", value: "" })).toBe(true);
    const rule = toRule({
      id: "custom:1",
      name: "Old demos",
      severity: "info",
      fix: "archive",
      conds: [
        { field: "name", op: "contains", value: "demo" },
        { field: "pushedDays", op: "gt", value: "60" },
      ],
    });
    const f = runChecks(
      [repo({}), repo({ name: "demo-old", full_name: "me/demo-old", pushed_at: "2026-01-01T00:00:00Z" })],
      {},
      NOW,
      [rule],
    );
    const hit = f.find((x) => x.rule.id === "custom:1")!;
    expect(hit.repos.map((r) => r.name)).toEqual(["demo-old"]);
    expect(
      toRule({ id: "custom:2", name: "empty", severity: "info", fix: null, conds: [] }).test(repo({}), NOW),
    ).toBe(false);
  });
});
