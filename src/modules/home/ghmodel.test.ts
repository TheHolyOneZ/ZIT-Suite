import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { Run } from "@/core/ipc";
import {
  checkWorkflow,
  dispatchInputs,
  formatDuration,
  nextVersions,
  normalizeTopic,
  parseTopics,
  runStats,
  suggestTopics,
} from "./ghmodel";

const run = (p: Partial<Run>): Run => ({
  id: 1,
  workflow_id: 1,
  name: "CI",
  display_title: "x",
  event: "push",
  status: "completed",
  conclusion: "success",
  head_branch: "main",
  head_sha: "abc",
  run_number: 1,
  run_attempt: 1,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:02:00Z",
  run_started_at: "2026-10-01T00:00:30Z",
  html_url: "u",
  actor: null,
  ...p,
});

describe("home github helpers", () => {
  it("topics: commas or lines, cleaned like GitHub", () => {
    expect(parseTopics("Rust, Tauri App\n#GUI; rust\n\nC++, C#")).toEqual([
      "rust",
      "tauri-app",
      "gui",
      "cpp",
      "csharp",
    ]);
    expect(normalizeTopic("--Hello__World..")).toBe("hello-world");
  });

  it("suggests topics from the folder", () => {
    expect(suggestTopics(["Cargo.toml", "src-tauri", "package.json", "tsconfig.json"], ["rust"])).toEqual([
      "tauri",
      "desktop-app",
      "javascript",
      "typescript",
    ]);
  });

  it("next versions from tags", () => {
    expect(
      nextVersions([
        { name: "v1.2.3", sha: "" },
        { name: "v1.10.0", sha: "" },
        { name: "nightly", sha: "" },
      ]),
    ).toEqual({ patch: "v1.10.1", minor: "v1.11.0", major: "v2.0.0", latest: "v1.10.0" });
    expect(nextVersions([]).minor).toBe("v0.1.0");
    expect(nextVersions([{ name: "0.4.1", sha: "" }]).patch).toBe("0.4.2");
  });

  it("run stats", () => {
    const s = runStats([
      run({}),
      run({ conclusion: "failure", id: 2 }),
      run({ conclusion: "cancelled" }),
      run({ status: "in_progress", conclusion: null }),
    ]);
    expect(s.successRate).toBe(0.5);
    expect(s.running).toBe(1);
    expect(s.lastFailure?.id).toBe(2);
    expect(formatDuration(s.avgMs)).toBe("1m 30s");
    expect(formatDuration(3_725_000)).toBe("1h 2m");
  });

  it("reads workflow_dispatch inputs", () => {
    const doc = parse(`
on:
  push:
  workflow_dispatch:
    inputs:
      level:
        description: Log level
        type: choice
        options: [info, debug]
        default: info
        required: true
      dry:
        type: boolean
`);
    expect(dispatchInputs(doc)).toEqual([
      {
        name: "level",
        description: "Log level",
        type: "choice",
        required: true,
        default: "info",
        options: ["info", "debug"],
      },
      { name: "dry", description: "", type: "boolean", required: false, default: "false", options: [] },
    ]);
    expect(dispatchInputs(parse("on: [push, workflow_dispatch]"))).toEqual([]);
    expect(dispatchInputs(parse("on: push"))).toBeNull();
  });
});

describe("workflow templates", () => {
  it("are valid YAML with a trigger", async () => {
    const { WORKFLOW_TEMPLATES } = await import("./workflowTemplates");
    for (const tpl of WORKFLOW_TEMPLATES) {
      const doc = parse(tpl.content) as Record<string, unknown>;
      expect(doc.on, tpl.id).toBeTruthy();
      expect(doc.jobs, tpl.id).toBeTruthy();
      expect(tpl.content, tpl.id).not.toContain("\\${");
    }
    const manual = WORKFLOW_TEMPLATES.find((x) => x.id === "manual")!;
    expect(dispatchInputs(parse(manual.content))?.map((i) => i.type)).toEqual([
      "choice",
      "boolean",
      "string",
    ]);
  });
});

describe("workflow check", () => {
  it("accepts valid workflows and explains broken ones", () => {
    const ok = checkWorkflow(
      "name: CI\non: [push, workflow_dispatch]\njobs:\n  b:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
      parse,
    );
    expect(ok).toMatchObject({
      problem: null,
      name: "CI",
      triggers: ["push", "workflow_dispatch"],
      jobs: 1,
      manual: true,
    });
    expect(checkWorkflow("on: push\njobs:\n  b:\n   runs-on: x\n  steps: [", parse).problem?.kind).toBe(
      "yaml",
    );
    expect(checkWorkflow("- a", parse).problem?.kind).toBe("notMap");
    expect(checkWorkflow("jobs: {}", parse).problem?.kind).toBe("noOn");
    expect(checkWorkflow("on: push", parse).problem?.kind).toBe("noJobs");
    expect(checkWorkflow("on: push\njobs:\n  b:\n    steps: [{run: x}]", parse).problem).toMatchObject({
      kind: "jobNoRunner",
      detail: "b",
    });
    expect(checkWorkflow("on: push\njobs:\n  b:\n    runs-on: x", parse).problem).toMatchObject({
      kind: "jobNoSteps",
      detail: "b",
    });
    expect(
      checkWorkflow("on: push\njobs:\n  call:\n    uses: o/r/.github/workflows/x.yml@main", parse).problem,
    ).toBeNull();
  });
});

describe("notes from commits", () => {
  it("groups conventional commits and skips merges", async () => {
    const { notesFromCommits } = await import("./ghmodel");
    const out = notesFromCommits(
      [
        { sha: "aaaaaaa1", message: "feat(ui): dark mode" },
        { sha: "bbbbbbb2", message: "fix: crash on start\n\nlong body" },
        { sha: "ccccccc3", message: "Merge branch 'dev'" },
        { sha: "ddddddd4", message: "Update README" },
      ],
      { features: "Features", fixes: "Fixes", other: "Other changes" },
    );
    expect(out).toBe(
      "### Features\n\n- **ui:** dark mode (aaaaaaa)\n\n### Fixes\n\n- crash on start (bbbbbbb)\n\n### Other changes\n\n- Update README (ddddddd)",
    );
  });
});
