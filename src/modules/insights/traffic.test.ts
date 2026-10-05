import { describe, expect, it } from "vitest";
import type { Traffic } from "@/core/ipc";
import { firstDay, mergeTraffic, series, sumRange } from "./traffic";

const tr = (repo: string, views: [string, number, number][], error = false): Traffic =>
  ({
    repo,
    views: 0,
    view_uniques: 0,
    clones: 0,
    clone_uniques: 0,
    views_daily: views.map(([day, count, uniques]) => ({ day: `${day}T00:00:00Z`, count, uniques })),
    clones_daily: [],
    referrers: [],
    paths: [],
    error: error ? { code: "x" } : null,
  }) as unknown as Traffic;

describe("traffic history", () => {
  it("merges loads, keeping the larger count per day and old days", () => {
    let log = mergeTraffic(
      {},
      [
        tr("a/b", [
          ["2026-01-01", 3, 1],
          ["2026-01-02", 1, 1],
        ]),
      ],
      "2026-01-02",
    );
    log = mergeTraffic(
      log,
      [
        tr("a/b", [
          ["2026-01-02", 5, 2],
          ["2026-01-03", 2, 2],
        ]),
      ],
      "2026-01-03",
    );
    expect(log["a/b"].v).toEqual({ "2026-01-01": [3, 1], "2026-01-02": [5, 2], "2026-01-03": [2, 2] });
  });

  it("keeps history of repos that failed to load and drops very old days", () => {
    const log = mergeTraffic(
      {},
      [
        tr("a/b", [
          ["2024-01-01", 9, 9],
          ["2026-01-01", 1, 1],
        ]),
      ],
      "2026-01-01",
    );
    expect(Object.keys(log["a/b"].v)).toEqual(["2026-01-01"]);
    expect(mergeTraffic(log, [tr("a/b", [], true)], "2026-01-02")["a/b"].v["2026-01-01"]).toEqual([1, 1]);
  });

  it("builds series and range sums", () => {
    const log = mergeTraffic(
      {},
      [
        tr("a/b", [
          ["2026-01-01", 3, 1],
          ["2026-01-03", 2, 2],
        ]),
      ],
      "2026-01-03",
    );
    expect(series(log["a/b"].v, 4, "2026-01-03")).toEqual([0, 3, 0, 2]);
    expect(sumRange(log["a/b"].v, 2, "2026-01-03")).toEqual({ count: 2, uniques: 2 });
    expect(sumRange(log["a/b"].v, 3, "2026-01-03")).toEqual({ count: 5, uniques: 3 });
    expect(firstDay(log)).toBe("2026-01-01");
  });
});
