import { describe, expect, it } from "vitest";
import type { Repo } from "@/core/ipc";
import { DEFAULT_FILTER, type RepoRow } from "@/modules/repos/filters";
import { describeCadence, mustAsk, resolveTarget } from "./model";

const row = (name: string, status: "active" | "dead", tags: string[] = [], priv = false): RepoRow => ({
  repo: {
    full_name: `me/${name}`,
    name,
    private: priv,
    archived: false,
    fork: false,
    is_template: false,
    permissions: { admin: true, push: true, pull: true },
    stargazers_count: 0,
    topics: [],
    language: null,
    description: null,
  } as unknown as Repo,
  health: { status, score: status === "dead" ? 5 : 90 } as RepoRow["health"],
  tags,
});
const rows = [row("a", "active"), row("b", "dead", ["delete"]), row("c", "dead", [], true)];

describe("targets", () => {
  it("resolves views, cleanup presets, tags and fixed lists", () => {
    expect(
      resolveTarget(
        { kind: "view", presetId: "x", name: "Dead", filter: { ...DEFAULT_FILTER, health: ["dead"] } },
        rows,
      ),
    ).toEqual(["me/b", "me/c"]);
    expect(resolveTarget({ kind: "cleanup", preset: "spring" }, rows)).toEqual(["me/b", "me/c"]);
    expect(resolveTarget({ kind: "tag", tag: "delete" }, rows)).toEqual(["me/b"]);
    expect(resolveTarget({ kind: "repos", repos: ["me/a", "me/gone"] }, rows)).toEqual(["me/a"]);
  });
  it("never deletes without asking; describes cadences", () => {
    expect(mustAsk({ kind: "delete" })).toBe(true);
    expect(mustAsk({ kind: "archive" })).toBe(false);
    const t = (k: string, o?: Record<string, unknown>) => `${k}${o ? JSON.stringify(o) : ""}`;
    expect(describeCadence({ every: "week", hours: 1, at: "07:30", weekday: 4, day: 1 }, t)).toBe(
      'cadence.everyWeek{"day":"weekday.4","at":"07:30"}',
    );
  });
});
