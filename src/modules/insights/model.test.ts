import { describe, expect, it } from "vitest";
import type { Repo } from "@/core/ipc";
import {
  soundsSensitive,
  countBy,
  levenshtein,
  nearDuplicates,
  normName,
  perYear,
  pushesPerMonth,
  runChecks,
  tidyScore,
} from "./model";

const NOW = Date.parse("2026-10-01T00:00:00Z");
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const repo = (p: Partial<Repo>): Repo => ({
  id: 1,
  name: "app",
  full_name: "o/app",
  owner: { login: "o", avatar_url: "" } as Repo["owner"],
  private: false,
  fork: false,
  archived: false,
  is_template: false,
  description: "x",
  html_url: "",
  homepage: null,
  language: "Rust",
  topics: ["cli"],
  stargazers_count: 0,
  forks_count: 0,
  watchers_count: 0,
  open_issues_count: 0,
  size: 100,
  default_branch: "main",
  created_at: ago(800),
  updated_at: ago(1),
  pushed_at: ago(1),
  visibility: "public",
  permissions: null,
  license: { key: "mit", name: "MIT", spdx_id: "MIT" } as Repo["license"],
  ...p,
});

describe("insights model", () => {
  it("levenshtein + name normalizing", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(normName("My_Project-old")).toBe("myproject");
    expect(normName("ZRename2")).toBe("zrename");
  });

  it("finds near-duplicate names", () => {
    const g = nearDuplicates([
      repo({ name: "Clipboard-Manager", full_name: "o/Clipboard-Manager" }),
      repo({ name: "ZClipboardManager", full_name: "o/ZClipboardManager" }),
      repo({ name: "clipboard_manager_old", full_name: "o/clipboard_manager_old" }),
      repo({ name: "ZWall", full_name: "o/ZWall" }),
      repo({ name: "ZTally", full_name: "o/ZTally" }),
    ]);
    expect(g).toEqual([["o/Clipboard-Manager", "o/ZClipboardManager", "o/clipboard_manager_old"]]);
  });

  it("only flags names that really sound secret", () => {
    expect(soundsSensitive("my-secrets")).toBe(true);
    expect(soundsSensitive("PrivateNotes")).toBe(true);
    expect(soundsSensitive("api-tokens")).toBe(true);
    for (const n of [
      "Zircon-Dumper",
      "ZPassword-Extension",
      "Project-Structure-Mapper-with-Backup-and-Export",
      "Tokenizer",
      "environment-sim",
      "keyboard",
    ])
      expect(soundsSensitive(n), n).toBe(false);
  });

  it("runs the rules", () => {
    const list = [
      repo({ full_name: "o/secret-keys", name: "secret-keys" }),
      repo({ full_name: "o/my-tokens", name: "my-tokens", stargazers_count: 4 }),
      repo({ full_name: "o/old", pushed_at: ago(500) }),
      repo({ full_name: "o/mid", pushed_at: ago(200) }),
      repo({ full_name: "o/empty", size: 0 }),
      repo({ full_name: "o/fresh", size: 0, created_at: ago(2), pushed_at: ago(2) }),
      repo({ full_name: "o/fork", fork: true, created_at: ago(10), pushed_at: ago(10) }),
      repo({ full_name: "o/bare", description: null, topics: [], license: null, default_branch: "master" }),
    ];
    const hits = Object.fromEntries(
      runChecks(list, {}, NOW).map((f) => [f.rule.id, f.repos.map((r) => r.full_name)]),
    );
    expect(hits.sensitivePublic).toEqual(["o/secret-keys"]);
    expect(hits.staleNotArchived).toEqual(["o/old"]);
    expect(hits.dormant).toEqual(["o/mid"]);
    expect(hits.empty).toEqual(["o/empty"]);
    expect(hits.abandonedForks).toEqual(["o/fork"]);
    expect(hits.noDescription).toEqual(["o/bare"]);
    expect(hits.noTopics).toEqual(["o/bare"]);
    expect(hits.noLicense).toEqual(["o/bare"]);
    expect(hits.masterBranch).toEqual(["o/bare"]);

    const f = runChecks(list, { staleNotArchived: ["o/old"] }, NOW);
    expect(f.find((x) => x.rule.id === "staleNotArchived")!.repos).toEqual([]);
    expect(tidyScore(list, f)).toBe(63);
  });

  it("aggregates", () => {
    const list = [
      repo({ created_at: "2023-05-01T00:00:00Z", topics: ["a", "b"] }),
      repo({ created_at: "2025-01-01T00:00:00Z", topics: ["a"] }),
    ];
    expect(perYear(list).map((c) => [c.key, c.count])).toEqual([
      ["2023", 1],
      ["2024", 0],
      ["2025", 1],
    ]);
    expect(countBy(list, (r) => r.topics)).toEqual([
      { key: "a", count: 2 },
      { key: "b", count: 1 },
    ]);
    const p = pushesPerMonth([repo({ pushed_at: "2026-09-15T00:00:00Z" })], 3, new Date(NOW));
    expect(p.map((c) => [c.key, c.count])).toEqual([
      ["2026-08", 0],
      ["2026-09", 1],
      ["2026-10", 0],
    ]);
  });
});
