import { describe, expect, it } from "vitest";
import type { Environment, RepoSecrets } from "@/core/ipc";
import { ageDays, buildIndex, configKey, configOf, validName } from "./model";

const NOW = Date.parse("2026-10-04T00:00:00Z");
const env = (name: string, p: Partial<Environment> = {}): Environment => ({
  name,
  html_url: "",
  created_at: "",
  updated_at: "",
  wait_timer: 0,
  reviewers: [],
  prevent_self_review: false,
  branch_policy: "all",
  patterns: [],
  can_admins_bypass: true,
  ...p,
});
const meta = (name: string, updated_at: string) => ({ name, created_at: updated_at, updated_at });
const vr = (name: string, value: string) => ({
  name,
  value,
  created_at: "",
  updated_at: "2026-09-01T00:00:00Z",
});

const scan: RepoSecrets[] = [
  {
    repo: "o/a",
    secrets: [meta("NPM_TOKEN", "2025-01-01T00:00:00Z"), meta("SENTRY", "2026-09-30T00:00:00Z")],
    variables: [vr("REGION", "eu")],
    environments: [
      {
        env: env("production", { wait_timer: 5 }),
        secrets: [meta("DEPLOY_KEY", "2026-09-01T00:00:00Z")],
        variables: [vr("REGION", "eu")],
      },
    ],
    error: null,
  },
  {
    repo: "o/b",
    secrets: [meta("NPM_TOKEN", "2026-09-01T00:00:00Z")],
    variables: [vr("REGION", "us")],
    environments: [{ env: env("production"), secrets: [], variables: [] }],
    error: null,
  },
  { repo: "o/c", secrets: [], variables: [], environments: [], error: null },
];

describe("secrets model", () => {
  it("groups secrets by name across repos and environments, stale first", () => {
    const idx = buildIndex(scan, 180, NOW);
    expect(idx.secrets[0]).toMatchObject({ name: "NPM_TOKEN", stale: 1, oldest: "2025-01-01T00:00:00Z" });
    expect(idx.secrets[0].places.map((p) => p.repo)).toEqual(["o/a", "o/b"]);
    expect(idx.secrets.find((s) => s.name === "DEPLOY_KEY")?.places[0]).toMatchObject({
      repo: "o/a",
      env: "production",
    });
  });

  it("detects variable drift and environment config drift", () => {
    const idx = buildIndex(scan, 180, NOW);
    expect(idx.variables[0].values).toEqual([
      { value: "eu", count: 2 },
      { value: "us", count: 1 },
    ]);
    expect(idx.environments[0]).toMatchObject({ name: "production", configs: 2 });
    expect(idx.repos.map((r) => r.repo)).toEqual(["o/a", "o/b", "o/c"]);
    expect(idx.repos[0]).toMatchObject({ secrets: 3, variables: 2, environments: 1 });
  });

  it("normalizes environment configs like the backend", () => {
    const a = configOf(
      env("p", {
        reviewers: [
          { kind: "User", name: "Octo", id: 1 },
          { kind: "Team", name: "ops", id: 2 },
        ],
        branch_policy: "custom",
        patterns: ["main"],
      }),
    );
    expect(a.reviewers).toEqual(["Octo"]);
    expect(configKey(a)).toBe(configKey({ ...a, reviewers: ["@octo"], patterns: [" main", "main"] }));
    expect(configKey({ ...a, branch_policy: "all", patterns: ["x"] })).toBe(
      configKey({ ...a, branch_policy: "all", patterns: [] }),
    );
  });

  it("validates names and computes age", () => {
    expect(validName("NPM_TOKEN") && validName("_x")).toBe(true);
    expect(validName("1A") || validName("GITHUB_TOKEN") || validName("A-B") || validName("")).toBe(false);
    expect(ageDays("2026-09-04T00:00:00Z", NOW)).toBe(30);
  });
});

describe("usage finder", () => {
  it("finds secrets and vars in workflow text", async () => {
    const { findUses } = await import("./model");
    const yml =
      "env:\n  T: ${{ secrets.NPM_TOKEN }}\n  U: ${{ secrets['npm_token'] }}\n  V: ${{ secrets.NPM_TOKEN_OLD }}\n  W: ${{ vars.NPM_TOKEN }}\n";
    expect(findUses(yml, "secrets", "NPM_TOKEN")).toEqual([2, 3]);
    expect(findUses(yml, "vars", "npm_token")).toEqual([5]);
  });
});
