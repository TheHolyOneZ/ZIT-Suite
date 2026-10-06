import { describe, expect, it } from "vitest";
import type { PlanFile } from "@/core/ipc";
import { buildTree, defaultPicks, suggestMessage, tickState, toggle } from "./model";

const f = (rel: string, state: PlanFile["state"], size = 10): PlanFile => ({ rel, state, size });
const files = [
  f("src/a.ts", "changed"),
  f("src/lib/b.ts", "new"),
  f("README.md", "same"),
  f("src/c.ts", "same"),
];

describe("upload model", () => {
  it("builds a folder tree, folders first", () => {
    const t = buildTree(files);
    expect(t.children.map((c) => c.name)).toEqual(["src", "README.md"]);
    const src = t.children[0];
    expect(src.files.length).toBe(3);
    expect(src.children.map((c) => c.name)).toEqual(["lib", "a.ts", "c.ts"]);
    expect(t.size).toBe(40);
  });

  it("ticks everything that differs from GitHub by default", () => {
    expect([...defaultPicks(files)].sort()).toEqual(["src/a.ts", "src/lib/b.ts"]);
  });

  it("folder ticks are tri-state and toggle all files below", () => {
    const t = buildTree(files);
    const src = t.children[0];
    let picked = defaultPicks(files);
    expect(tickState(src, picked)).toBe("some");
    picked = toggle(picked, src, true);
    expect(tickState(src, picked)).toBe("all");
    picked = toggle(picked, src, false);
    expect(tickState(t, picked)).toBe("none");
  });

  it("suggests a commit message from the picked files", () => {
    expect(suggestMessage(files, new Set(["src/lib/b.ts"]))).toBe("Add b.ts");
    expect(suggestMessage(files, new Set(["src/a.ts", "src/lib/b.ts"]))).toBe("Update a.ts and b.ts");
    expect(suggestMessage(files, new Set(files.map((x) => x.rel)))).toBe(
      "Update 4 files: a.ts, b.ts and 2 more",
    );
    expect(suggestMessage(files, new Set())).toBe("");
  });
});
