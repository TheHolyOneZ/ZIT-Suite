import { describe, expect, it } from "vitest";
import { applyRules, NO_RULES, planRenames, validRepoName } from "./model";

describe("rename rules", () => {
  it("strips, replaces, cases, adds", () => {
    expect(applyRules("old-tool", { ...NO_RULES, stripPrefix: "old-", prefix: "z-" })).toBe("z-tool");
    expect(applyRules("MyCoolApp", { ...NO_RULES, caseMode: "kebab" })).toBe("my-cool-app");
    expect(applyRules("HTTPServer_v2", { ...NO_RULES, caseMode: "snake" })).toBe("http_server_v2");
    expect(applyRules("repo-2023", { ...NO_RULES, find: "\\d{4}$", replace: "2026", regex: true })).toBe(
      "repo-2026",
    );
    expect(applyRules("repo", { ...NO_RULES, find: "(", regex: true })).toBe("repo");
    expect(applyRules("has space ü", NO_RULES)).toBe("has-space--");
    expect(applyRules("Name-archive", { ...NO_RULES, stripSuffix: "-ARCHIVE" })).toBe("Name");
  });
  it("validates", () => {
    expect(validRepoName("ok.name_1")).toBe(true);
    expect(validRepoName("..")).toBe(false);
    expect(validRepoName("a b")).toBe(false);
  });
});

describe("plan", () => {
  it("flags same, invalid, duplicate and taken (also names only freed by this plan)", () => {
    const rows = planRenames(
      ["me/a", "me/b", "me/c", "me/d", "me/e"],
      { ...NO_RULES, prefix: "x-" },
      { "me/b": "x-a", "me/c": "c", "me/d": "bad name", "me/e": "taken" },
      ["me/a", "me/b", "me/c", "me/d", "me/e", "me/taken"],
    );
    expect(rows.map((r) => `${r.from}:${r.to}:${r.status}`)).toEqual([
      "a:x-a:duplicate",
      "b:x-a:duplicate",
      "c:c:same",
      "d:bad name:invalid",
      "e:taken:taken",
    ]);
    const swap = planRenames(["me/a", "me/b"], NO_RULES, { "me/a": "b", "me/b": "c" }, ["me/a", "me/b"]);
    expect(swap.map((r) => r.status)).toEqual(["taken", "ok"]);
  });
});
