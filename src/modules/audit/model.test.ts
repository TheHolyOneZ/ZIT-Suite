import { describe, expect, it } from "vitest";
import type { AuditReport, FileStat } from "@/core/ipc";
import {
  addSnapshot,
  asciiTree,
  buildTree,
  compareSnapshots,
  isNoise,
  jsonTree,
  languageTotals,
  snapshotOf,
  type Snapshot,
} from "./model";

const f = (
  path: string,
  lines: number,
  size = lines * 10,
  language: string | null = "Rust",
  blank = 0,
): FileStat => ({ path, lines, size, blank, language, binary: false });

describe("audit model", () => {
  const files = [
    f("src/main.rs", 100),
    f("src/util/a.rs", 50, 500, "Rust", 10),
    f("README.md", 20, 200, "Markdown"),
    f("Cargo.lock", 900, 9000, null),
  ];

  it("builds a rolled-up tree", () => {
    const t = buildTree(files, "lines", false);
    expect([t.lines, t.files]).toEqual([1070, 4]);
    expect(t.children.map((c) => c.name)).toEqual(["Cargo.lock", "src", "README.md"]);
    const src = t.children.find((c) => c.name === "src")!;
    expect([src.lines, src.files, src.children[0].name]).toEqual([150, 2, "main.rs"]);
    expect(buildTree(files, "name", false).children.map((c) => c.name)).toEqual([
      "src",
      "Cargo.lock",
      "README.md",
    ]);
  });

  it("can leave out lock files and vendored code", () => {
    expect(isNoise("Cargo.lock")).toBe(true);
    expect(isNoise("web/node_modules/x.js")).toBe(true);
    expect(isNoise("app.min.js")).toBe(true);
    expect(isNoise("src/build.rs")).toBe(false);
    expect(buildTree(files, "lines", true).lines).toBe(170);
  });

  it("totals languages by code lines", () => {
    const l = languageTotals(files, true);
    expect(l.map((x) => [x.name, x.lines])).toEqual([
      ["Rust", 140],
      ["Markdown", 20],
    ]);
    expect(l[0].share).toBeCloseTo(140 / 160);
  });

  it("prints like tree and exports JSON", () => {
    const t = buildTree(files.slice(0, 3), "name", false);
    const txt = asciiTree(t, "o/r");
    expect(txt.split("\n")[1]).toBe("├── src/  [1.5 KB, 150 lines, 2 files]");
    expect(txt).toContain("│   ├── util/");
    expect(txt).toContain("└── README.md  [200 B, 20 lines]");
    const j = JSON.parse(jsonTree(t, { repo: "o/r" }));
    expect(j.repo).toBe("o/r");
    expect(j.tree.children[0]).toMatchObject({ name: "src", type: "dir", lines: 150 });
  });
});

describe("audit snapshots", () => {
  const snap = (at: string, head: string, code: number, langs: Record<string, number>): Snapshot => ({
    at,
    head,
    commits: 1,
    code,
    lines: code,
    files: 1,
    size: 1,
    additions: 0,
    deletions: 0,
    people: 1,
    langs,
  });

  it("keeps one per head, newest first, capped", () => {
    let l: Snapshot[] = [];
    l = addSnapshot(l, snap("2026-01-01", "a", 1, {}));
    l = addSnapshot(l, snap("2026-02-01", "b", 2, {}));
    l = addSnapshot(l, snap("2026-03-01", "b", 2, {}));
    expect(l.map((s) => s.at)).toEqual(["2026-03-01", "2026-01-01"]);
    expect(addSnapshot(l, snap("2026-04-01", "c", 3, {}), 2).map((s) => s.head)).toEqual(["c", "b"]);
  });

  it("compares metrics and languages", () => {
    const c = compareSnapshots(
      snap("1", "a", 100, { Rust: 80, Go: 20 }),
      snap("2", "b", 130, { Rust: 120, TypeScript: 10 }),
    );
    expect(c.metrics.find((m) => m.key === "code")!.delta).toBe(30);
    expect(c.langs.map((l) => [l.name, l.delta])).toEqual([
      ["Rust", 40],
      ["Go", -20],
      ["TypeScript", 10],
    ]);
  });

  it("snapshots a report without lock files", () => {
    const r = {
      generated_at: "t",
      head: "h",
      commits: 3,
      additions: 5,
      deletions: 1,
      contributors: [{}, {}],
      files: [f("a.rs", 10, 100, "Rust", 2), f("Cargo.lock", 500, 5000, null)],
    } as unknown as AuditReport;
    const s = snapshotOf(r);
    expect([s.code, s.lines, s.files, s.people, s.langs.Rust]).toEqual([8, 10, 1, 2, 8]);
  });
});
