import { describe, expect, it } from "vitest";
import { activeFilterCount, applyFilter, DEFAULT_FILTER, type RepoRow } from "./filters";
import { repo } from "./health.test";

const row = (
  p: Parameters<typeof repo>[0],
  health: RepoRow["health"]["status"] = "active",
  tags: string[] = [],
): RepoRow => ({
  repo: repo(p),
  health: { status: health, score: 50, daysSincePush: 1 },
  tags,
});

const rows = [
  row({
    name: "alpha",
    full_name: "me/alpha",
    language: "Rust",
    stargazers_count: 10,
    description: "cli tool",
  }),
  row({ name: "beta", full_name: "me/beta", language: "TypeScript", private: true, fork: true }, "dead", [
    "delete",
  ]),
  row(
    {
      name: "gamma",
      full_name: "me/gamma",
      language: null,
      open_issues_count: 3,
      created_at: "2020-01-01T00:00:00Z",
    },
    "archived",
  ),
];
const sort = { key: "name", dir: "asc" } as const;
const names = (f: Partial<typeof DEFAULT_FILTER>) =>
  applyFilter(rows, { ...DEFAULT_FILTER, ...f }, sort).map((r) => r.repo.name);

describe("applyFilter", () => {
  it("returns everything by default, sorted", () => expect(names({})).toEqual(["alpha", "beta", "gamma"]));
  it("search matches name, description and tags (all tokens)", () => {
    expect(names({ search: "cli" })).toEqual(["alpha"]);
    expect(names({ search: "delete" })).toEqual(["beta"]);
    expect(names({ search: "alpha tool" })).toEqual(["alpha"]);
    expect(names({ search: "alpha nope" })).toEqual([]);
  });
  it("filters health, visibility, language, forks", () => {
    expect(names({ health: ["dead", "archived"] })).toEqual(["beta", "gamma"]);
    expect(names({ visibility: "private" })).toEqual(["beta"]);
    expect(names({ languages: ["∅"] })).toEqual(["gamma"]);
    expect(names({ fork: "exclude" })).toEqual(["alpha", "gamma"]);
    expect(names({ fork: "only" })).toEqual(["beta"]);
  });
  it("filters ranges, issues and dates", () => {
    expect(names({ stars: [5, null] })).toEqual(["alpha"]);
    expect(names({ hasIssues: true })).toEqual(["gamma"]);
    expect(names({ createdBefore: "2021-01-01" })).toEqual(["gamma"]);
  });
  it("sorts descending with name tiebreak", () => {
    expect(applyFilter(rows, DEFAULT_FILTER, { key: "stars", dir: "desc" }).map((r) => r.repo.name)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });
  it("counts active filters, ignoring search", () => {
    expect(activeFilterCount({ ...DEFAULT_FILTER, search: "x" })).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTER, fork: "only", health: ["dead"] })).toBe(2);
  });
});
