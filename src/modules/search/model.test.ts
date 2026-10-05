import { describe, expect, it } from "vitest";
import { remember, runs, scoped, toggleHint } from "./model";

describe("search model", () => {
  it("scopes to my account", () => {
    expect(scoped("tauri", "repos", true, "me")).toBe("tauri user:me");
    expect(scoped("bug", "issues", true, "me")).toBe("bug involves:me");
    expect(scoped("x", "users", true, "me")).toBe("x");
    expect(scoped(" x ", "code", false, "me")).toBe("x");
  });
  it("toggles qualifiers", () => {
    expect(toggleHint("tauri", "is:open")).toBe("tauri is:open");
    expect(toggleHint("tauri is:open", "is:open")).toBe("tauri");
  });
  it("splits highlights (unicode-safe)", () => {
    expect(runs("ä foo bar", [[2, 5]])).toEqual([
      { text: "ä ", hit: false },
      { text: "foo", hit: true },
      { text: " bar", hit: false },
    ]);
    expect(runs("abc", [])).toEqual([{ text: "abc", hit: false }]);
  });
  it("remembers recent searches", () => {
    const l = remember(
      [
        { kind: "repos", q: "a" },
        { kind: "code", q: "b" },
      ],
      { kind: "code", q: "b" },
    );
    expect(l.map((x) => x.q)).toEqual(["b", "a"]);
  });
});
