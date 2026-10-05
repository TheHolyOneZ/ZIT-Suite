import { describe, expect, it } from "vitest";
import type { Run } from "@/core/ipc";
import { board, bucketOf, filterRuns, firstErrorBlock, parseLog } from "./model";

const run = (p: Partial<Run>): Run => ({
  id: 1,
  workflow_id: 1,
  name: "CI",
  display_title: "Fix things",
  event: "push",
  status: "completed",
  conclusion: "success",
  head_branch: "main",
  head_sha: "abcdef1234",
  run_number: 1,
  run_attempt: 1,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:01:00Z",
  run_started_at: "2026-10-01T10:00:00Z",
  html_url: "",
  actor: { login: "me" },
  ...p,
});

describe("buckets and filters", () => {
  it("buckets runs", () => {
    expect(bucketOf(run({ status: "in_progress", conclusion: null }))).toBe("running");
    expect(bucketOf(run({ conclusion: "timed_out" }))).toBe("failed");
    expect(bucketOf(run({ conclusion: "cancelled" }))).toBe("other");
  });
  it("filters by workflow, state, branch and text", () => {
    const runs = [
      run({ id: 1 }),
      run({ id: 2, conclusion: "failure", head_branch: "dev" }),
      run({ id: 3, workflow_id: 2, display_title: "Release v1" }),
    ];
    expect(filterRuns(runs, { bucket: "failed", branch: null, q: "" }, null).map((r) => r.id)).toEqual([2]);
    expect(filterRuns(runs, { bucket: "all", branch: "main", q: "" }, 1).map((r) => r.id)).toEqual([1]);
    expect(filterRuns(runs, { bucket: "all", branch: null, q: "release" }, null).map((r) => r.id)).toEqual([
      3,
    ]);
  });
});

describe("board", () => {
  it("uses the latest run per workflow and sorts running, failing, ok", () => {
    const rows = board([
      { repo: "a/ok", runs: [run({ id: 1 })], error: null },
      { repo: "a/none", runs: [], error: null },

      {
        repo: "a/fail",
        runs: [
          run({ id: 2 }),
          run({ id: 3, workflow_id: 2, conclusion: "failure" }),
          run({ id: 4, conclusion: "failure" }),
        ],
        error: null,
      },
      { repo: "a/run", runs: [run({ id: 5, status: "queued", conclusion: null })], error: null },
    ]);
    expect(rows.map((r) => r.repo)).toEqual(["a/run", "a/fail", "a/ok"]);
    const fail = rows[1];
    expect(fail.latest.map((r) => r.id)).toEqual([2, 3]);
    expect(fail.failing).toBe(1);
    expect(fail.successRate).toBeCloseTo(1 / 3);
  });
});

describe("parseLog", () => {
  it("groups, strips timestamps and colors, marks errors", () => {
    const raw = [
      "2026-10-01T10:00:00.1234567Z ##[group]Run actions/checkout@v4",
      "2026-10-01T10:00:00.2Z with: x",
      "2026-10-01T10:00:00.3Z ##[endgroup]",
      "2026-10-01T10:00:01.0Z \u001b[31mred\u001b[0m text",
      "2026-10-01T10:00:02.0Z ##[error]Process completed with exit code 1.",
      "",
    ].join("\n");
    const blocks = parseLog(raw);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].title).toBe("Run actions/checkout@v4");
    expect(blocks[0].lines[0]).toMatchObject({ text: "with: x", ts: "2026-10-01T10:00:00.2Z" });
    expect(blocks[1].lines.map((l) => l.text)).toEqual(["red text", "Process completed with exit code 1."]);
    expect(blocks[1].lines[1].kind).toBe("error");
    expect(firstErrorBlock(blocks)).toBe(1);
  });
});
