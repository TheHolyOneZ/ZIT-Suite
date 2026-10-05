import { describe, expect, it } from "vitest";
import type { RemoteBranch } from "@/core/ipc";
import { factsOf, filterBranches, sortBranches, validBranchName } from "./model";

const NOW = Date.parse("2026-10-04T00:00:00Z");
const b = (p: Partial<RemoteBranch>): RemoteBranch => ({
  name: "x",
  sha: "abc",
  date: "2026-10-01T00:00:00Z",
  message: "msg",
  author: "A",
  author_login: "a",
  protected: false,
  rule: null,
  prs: 0,
  pr: null,
  ahead: 1,
  behind: 0,
  ...p,
});

describe("branch facts", () => {
  it("knows default, stale, merged and removable", () => {
    expect(factsOf(b({ name: "main", ahead: 0 }), "main", 90, NOW)).toMatchObject({
      isDefault: true,
      merged: false,
      stale: false,
      removable: false,
    });
    expect(factsOf(b({ date: "2026-01-01T00:00:00Z" }), "main", 90, NOW)).toMatchObject({
      stale: true,
      merged: false,
    });
    expect(factsOf(b({ ahead: 0 }), "main", 90, NOW)).toMatchObject({ merged: true, removable: true });
    expect(factsOf(b({ ahead: 0, prs: 1 }), "main", 90, NOW).removable).toBe(false);
    expect(factsOf(b({ ahead: 0, protected: true }), "main", 90, NOW).removable).toBe(false);
  });
  it("filters and sorts", () => {
    const list = [
      b({ name: "old", date: "2026-01-01T00:00:00Z" }),
      b({ name: "main" }),
      b({ name: "done", ahead: 0, date: "2026-10-03T00:00:00Z" }),
    ];
    const f = (x: RemoteBranch) => factsOf(x, "main", 90, NOW);
    expect(filterBranches(list, "stale", "", f).map((x) => x.name)).toEqual(["old"]);
    expect(filterBranches(list, "merged", "", f).map((x) => x.name)).toEqual(["done"]);
    expect(filterBranches(list, "all", "DON", f).map((x) => x.name)).toEqual(["done"]);
    expect(sortBranches(list, "main").map((x) => x.name)).toEqual(["main", "done", "old"]);
  });
  it("validates names like git", () => {
    for (const ok of ["main", "feature/x", "fix-1.2"]) expect(validBranchName(ok)).toBe(true);
    for (const bad of ["", "-x", "a..b", "a b", "x.lock", "a//b", "x/", "a~1", "@", "a@{b"])
      expect(validBranchName(bad)).toBe(false);
  });
});
