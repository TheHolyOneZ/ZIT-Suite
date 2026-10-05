import { describe, expect, it } from "vitest";
import type { RepoReleases } from "@/core/ipc";
import { nextTag, sortBoard, suggestBump } from "./model";

describe("bump suggestion", () => {
  it("reads conventional commits", () => {
    expect(suggestBump(["fix: typo", "chore: deps"])).toBe("patch");
    expect(suggestBump(["fix: typo", "feat(ui): dark mode"])).toBe("minor");
    expect(suggestBump(["feat!: new config format"])).toBe("major");
    expect(suggestBump(["refactor: x\n\nBREAKING CHANGE: y"])).toBe("major");
    expect(suggestBump(["Add export button"])).toBe("minor");
  });
  it("finds the next tag", () => {
    expect(nextTag(["v1.2.3", "v1.10.0", "v1.9.9"], "patch")).toBe("v1.10.1");
    expect(nextTag(["1.0.0"], "major")).toBe("2.0.0");
    expect(nextTag([], "minor")).toBe("v0.1.0");
  });
});

const row = (repo: string, releases: number, since: number | null, at = "2026-01-01"): RepoReleases => ({
  repo,
  branch: "main",
  releases,
  drafts: 0,
  latest: releases ? { tag: "v1", name: null, published_at: at, prerelease: false, html_url: "" } : null,
  downloads: 0,
  tags: [],
  since,
  since_tag: null,
  error: null,
});

describe("board order", () => {
  it("puts waiting repos first, most commits first", () => {
    expect(
      sortBoard([
        row("a/done", 3, 0),
        row("a/never", 0, null),
        row("a/some", 2, 4),
        row("a/many", 1, 30),
      ]).map((r) => r.repo),
    ).toEqual(["a/many", "a/some", "a/never", "a/done"]);
  });
});
