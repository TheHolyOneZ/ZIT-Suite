import type { Job, RepoRuns, Run, Step } from "@/core/ipc";


export type RunBucket = "running" | "failed" | "ok" | "other";

export function bucketOf(r: { status: string | null; conclusion: string | null }): RunBucket {
  if (r.status !== "completed") return "running";
  if (r.conclusion === "success") return "ok";
  if (r.conclusion === "failure" || r.conclusion === "timed_out" || r.conclusion === "startup_failure")
    return "failed";
  return "other";
}

export interface RunFilter {
  bucket: RunBucket | "all";
  branch: string | null;
  q: string;
}

export function filterRuns(runs: Run[], f: RunFilter, workflow: number | null): Run[] {
  const q = f.q.trim().toLowerCase();
  return runs.filter(
    (r) =>
      (workflow == null || r.workflow_id === workflow) &&
      (f.bucket === "all" || bucketOf(r) === f.bucket) &&
      (!f.branch || r.head_branch === f.branch) &&
      (!q ||
        [
          r.display_title,
          r.name,
          r.head_branch,
          r.actor?.login,
          r.head_sha.slice(0, 7),
          `#${r.run_number}`,
        ].some((s) => s?.toLowerCase().includes(q))),
  );
}

export const spanMs = (start: string | null, end: string | null): number | null => {
  if (!start || !end) return null;
  const d = Date.parse(end) - Date.parse(start);
  return d >= 0 ? d : null;
};
export const jobMs = (j: Job | Step) => spanMs(j.started_at, j.completed_at);


export interface BoardRow {
  repo: string;
  latest: Run[];
  last: Run;
  state: RunBucket;

  successRate: number | null;
  failing: number;
  running: number;
}

export function board(data: RepoRuns[]): BoardRow[] {
  const rows: BoardRow[] = [];
  for (const { repo, runs } of data) {
    if (!runs.length) continue;
    const seen = new Set<number>();
    const latest: Run[] = [];
    for (const r of runs) {
      if (seen.has(r.workflow_id)) continue;
      seen.add(r.workflow_id);
      latest.push(r);
    }
    const buckets = latest.map(bucketOf);
    const running = runs.filter((r) => bucketOf(r) === "running").length;
    const failing = buckets.filter((b) => b === "failed").length;
    const decided = runs.filter((r) => ["ok", "failed"].includes(bucketOf(r)));
    rows.push({
      repo,
      latest,
      last: runs[0],
      state: running ? "running" : failing ? "failed" : buckets.includes("ok") ? "ok" : "other",
      successRate: decided.length
        ? decided.filter((r) => bucketOf(r) === "ok").length / decided.length
        : null,
      failing,
      running,
    });
  }
  const rank: Record<RunBucket, number> = { running: 0, failed: 1, ok: 2, other: 3 };
  return rows.sort(
    (a, b) => rank[a.state] - rank[b.state] || b.last.created_at.localeCompare(a.last.created_at),
  );
}


export type LineKind = "plain" | "error" | "warning" | "notice" | "debug" | "command";
export interface LogLine {
  n: number;
  ts: string | null;
  text: string;
  kind: LineKind;
}

export interface LogBlock {
  title: string | null;
  lines: LogLine[];
  errors: number;
  warnings: number;
}


// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const TS = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) ?/;
const MARK = /^##\[(group|endgroup|error|warning|notice|debug|command)\]/;


export function parseLog(raw: string): LogBlock[] {
  const blocks: LogBlock[] = [];
  let cur: LogBlock | null = null;
  const loose = (): LogBlock => {
    if (!cur) {
      cur = { title: null, lines: [], errors: 0, warnings: 0 };
      blocks.push(cur);
    }
    return cur;
  };
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  lines.forEach((line, i) => {
    let text = line.replace(/^\uFEFF/, "").replace(ANSI, "");
    const ts = TS.exec(text);
    if (ts) text = text.slice(ts[0].length);
    const m = MARK.exec(text);
    const tag = m?.[1];
    if (m) text = text.slice(m[0].length);
    if (tag === "group") {
      cur = { title: text, lines: [], errors: 0, warnings: 0 };
      blocks.push(cur);
      return;
    }
    if (tag === "endgroup") {
      cur = null;
      return;
    }
    const kind: LineKind =
      tag === "error" || tag === "warning" || tag === "notice" || tag === "debug" || tag === "command"
        ? tag
        : "plain";
    const b = loose();
    b.lines.push({ n: i + 1, ts: ts?.[1] ?? null, text, kind });
    if (kind === "error") b.errors++;
    if (kind === "warning") b.warnings++;
  });
  return blocks.filter((b) => b.title !== null || b.lines.length);
}


export const firstErrorBlock = (blocks: LogBlock[]) => blocks.findIndex((b) => b.errors > 0);


export function pickJob(jobs: Job[]): Job | null {
  return (
    jobs.find((j) => j.conclusion === "failure" || j.conclusion === "timed_out") ??
    jobs.find((j) => j.status !== "completed") ??
    jobs[0] ??
    null
  );
}


export const workflowPath = (name: string) => `.github/workflows/${name}`;
