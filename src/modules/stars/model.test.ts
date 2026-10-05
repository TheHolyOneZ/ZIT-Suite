import { describe, expect, it } from "vitest";
import type { StarList, Starred } from "@/core/ipc";
import { csvExport, filterStars, isStale, languageCounts, markdownExport, membership, parseRepo } from "./model";

const NOW = Date.parse("2026-10-01T00:00:00Z");
const star = (p: Partial<Starred>): Starred => ({
  id: "R1", repo: "o/a", description: "", url: "https://github.com/o/a", language: "Rust", language_color: "#dea584", stars: 1, forks: 0,
  archived: false, fork: false, private: false, pushed_at: "2026-09-01T00:00:00Z", starred_at: "2026-01-01T00:00:00Z", topics: [], avatar: "", ...p,
});

describe("stars model", () => {
  const list = [star({}), star({ id: "R2", repo: "o/b", language: null, archived: true, pushed_at: "2020-01-01T00:00:00Z", topics: ["cli"] }), star({ id: "R3", repo: "x/c", description: "A CLI tool" })];
  const lists: StarList[] = [{ id: "L1", name: "Tools", description: "", private: false, items: ["R2", "R3"] }];

  it("filters by text, topic, language, list and flags", () => {
    const f = { search: "", language: null, list: null, flags: [] as ("archived" | "stale" | "fork")[] };
    expect(filterStars(list, { ...f, search: "cli" }, lists, NOW).map((s) => s.id)).toEqual(["R2", "R3"]);
    expect(filterStars(list, { ...f, language: "—" }, lists, NOW).map((s) => s.id)).toEqual(["R2"]);
    expect(filterStars(list, { ...f, list: "L1", flags: ["stale"] }, lists, NOW).map((s) => s.id)).toEqual(["R2"]);
    expect(isStale(list[0], NOW)).toBe(false);
  });

  it("counts languages and list membership", () => {
    expect(languageCounts(list).map((l) => [l.name, l.count])).toEqual([["Rust", 2], ["—", 1]]);
    expect(membership(lists).get("R3")).toEqual(["L1"]);
  });

  it("exports", () => {
    const md = markdownExport(list, "My stars");
    expect(md).toContain("## Rust");
    expect(md).toContain("- [x/c](https://github.com/o/a) — A CLI tool (★ 1)");
    expect(csvExport([star({ description: 'say "hi", ok' })]).split("\n")[1]).toContain('"say ""hi"", ok"');
  });

  it("parses repo input", () => {
    expect(parseRepo("https://github.com/rust-lang/rust")).toBe("rust-lang/rust");
    expect(parseRepo("tauri-apps/tauri.git")).toBe("tauri-apps/tauri");
    expect(parseRepo("nope")).toBeNull();
  });
});
