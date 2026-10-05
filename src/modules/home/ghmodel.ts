import type { Run, Tag } from "@/core/ipc";


export function normalizeTopic(raw: string): string {
  let s = raw.trim().replace(/^#+/, "").toLowerCase().replace(/\+\+/g, "pp").replace(/#/g, "sharp");
  s = s
    .replace(/[\s_.]/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 50).replace(/-+$/, "");
}


export function parseTopics(text: string): string[] {
  const out: string[] = [];
  for (const t of text.split(/[,\n;]/).map(normalizeTopic)) if (t && !out.includes(t)) out.push(t);
  return out;
}
export const MAX_TOPICS = 20;


export function suggestTopics(names: string[], have: string[]): string[] {
  const has = (n: string) => names.some((x) => x.toLowerCase() === n.toLowerCase());
  const out: string[] = [];
  const add = (...t: string[]) => t.forEach((x) => !out.includes(x) && out.push(x));
  if (has("Cargo.toml")) add("rust");
  if (has("src-tauri")) add("tauri", "desktop-app");
  if (has("package.json")) add("javascript");
  if (has("tsconfig.json")) add("typescript");
  if (has("pyproject.toml") || has("requirements.txt") || has("setup.py")) add("python");
  if (has("go.mod")) add("go");
  if (has("pom.xml") || has("build.gradle")) add("java");
  if (has("Dockerfile")) add("docker");
  if (has("CMakeLists.txt")) add("cpp");
  if (names.some((n) => n.endsWith(".csproj") || n.endsWith(".sln"))) add("csharp", "dotnet");
  if (has("index.html")) add("html");
  return out.filter((t) => !have.includes(t));
}


export function nextVersions(tags: Tag[]): {
  patch: string;
  minor: string;
  major: string;
  latest: string | null;
} {
  const parsed = tags
    .map((t) => ({ name: t.name, m: /^(v?)(\d+)\.(\d+)\.(\d+)$/.exec(t.name) }))
    .filter((x): x is { name: string; m: RegExpExecArray } => !!x.m)
    .map(({ name, m }) => ({
      name,
      v: m[1],
      n: [Number(m[2]), Number(m[3]), Number(m[4])] as [number, number, number],
    }))
    .sort((a, b) => b.n[0] - a.n[0] || b.n[1] - a.n[1] || b.n[2] - a.n[2]);
  const top = parsed[0];
  if (!top) return { patch: "v0.1.0", minor: "v0.1.0", major: "v1.0.0", latest: null };
  const [ma, mi, pa] = top.n;
  return {
    patch: `${top.v}${ma}.${mi}.${pa + 1}`,
    minor: `${top.v}${ma}.${mi + 1}.0`,
    major: `${top.v}${ma + 1}.0.0`,
    latest: top.name,
  };
}

export const durationMs = (r: Run): number | null => {
  if (r.status !== "completed" || !r.run_started_at) return null;
  const d = Date.parse(r.updated_at) - Date.parse(r.run_started_at);
  return d > 0 ? d : null;
};

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export interface RunStats {
  total: number;
  running: number;

  successRate: number | null;
  avgMs: number | null;
  lastFailure: Run | null;
}

export function runStats(runs: Run[]): RunStats {
  const decided = runs.filter(
    (r) =>
      r.status === "completed" &&
      (r.conclusion === "success" || r.conclusion === "failure" || r.conclusion === "timed_out"),
  );
  const ok = decided.filter((r) => r.conclusion === "success").length;
  const durs = runs.map(durationMs).filter((d): d is number => d != null);
  return {
    total: runs.length,
    running: runs.filter((r) => r.status !== "completed").length,
    successRate: decided.length ? ok / decided.length : null,
    avgMs: durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null,
    lastFailure: runs.find((r) => r.conclusion === "failure" || r.conclusion === "timed_out") ?? null,
  };
}


export interface DispatchInput {
  name: string;
  description: string;
  type: "string" | "choice" | "boolean" | "number" | "environment";
  required: boolean;
  default: string;
  options: string[];
}


export function dispatchInputs(doc: unknown): DispatchInput[] | null {
  if (!doc || typeof doc !== "object") return null;
  const on =
    (doc as Record<string, unknown>).on ?? (doc as Record<string, unknown>)[true as unknown as string];
  if (on === "workflow_dispatch") return [];
  if (Array.isArray(on)) return on.includes("workflow_dispatch") ? [] : null;
  if (!on || typeof on !== "object" || !("workflow_dispatch" in on)) return null;
  const wd = (on as Record<string, unknown>).workflow_dispatch as {
    inputs?: Record<string, Record<string, unknown>>;
  } | null;
  return Object.entries(wd?.inputs ?? {}).map(([name, i]) => {
    const type = (
      ["string", "choice", "boolean", "number", "environment"].includes(String(i?.type)) ? i.type : "string"
    ) as DispatchInput["type"];
    return {
      name,
      description: String(i?.description ?? ""),
      type,
      required: !!i?.required,
      default: i?.default == null ? (type === "boolean" ? "false" : "") : String(i.default),
      options: Array.isArray(i?.options) ? i.options.map(String) : [],
    };
  });
}

export interface WorkflowCheck {

  problem: null | {
    kind: "yaml" | "notMap" | "noOn" | "noJobs" | "jobNoRunner" | "jobNoSteps";
    detail?: string;
    line?: number;
  };
  name: string | null;
  triggers: string[];
  jobs: number;
  manual: boolean;
}


export function checkWorkflow(text: string, parse: (t: string) => unknown): WorkflowCheck {
  const base: WorkflowCheck = { problem: null, name: null, triggers: [], jobs: 0, manual: false };
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (e) {
    const err = e as { message?: string; linePos?: { line: number }[] };
    return {
      ...base,
      problem: {
        kind: "yaml",
        detail: String(err.message ?? e).split("\n")[0],
        line: err.linePos?.[0]?.line,
      },
    };
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { ...base, problem: { kind: "notMap" } };
  const d = doc as Record<string, unknown>;
  const on = d.on ?? d["true"];
  const triggers =
    typeof on === "string"
      ? [on]
      : Array.isArray(on)
        ? on.map(String)
        : on && typeof on === "object"
          ? Object.keys(on)
          : [];
  const out: WorkflowCheck = {
    ...base,
    name: typeof d.name === "string" ? d.name : null,
    triggers,
    manual: dispatchInputs(d) !== null,
  };
  if (!triggers.length) return { ...out, problem: { kind: "noOn" } };
  const jobs =
    d.jobs && typeof d.jobs === "object" && !Array.isArray(d.jobs)
      ? (d.jobs as Record<string, Record<string, unknown> | null>)
      : null;
  if (!jobs || !Object.keys(jobs).length) return { ...out, problem: { kind: "noJobs" } };
  out.jobs = Object.keys(jobs).length;
  for (const [id, j] of Object.entries(jobs)) {
    if (!j || typeof j !== "object") return { ...out, problem: { kind: "jobNoRunner", detail: id } };
    if (j.uses) continue;
    if (!j["runs-on"]) return { ...out, problem: { kind: "jobNoRunner", detail: id } };
    if (!Array.isArray(j.steps) || !j.steps.length)
      return { ...out, problem: { kind: "jobNoSteps", detail: id } };
  }
  return out;
}


export function notesFromCommits(
  commits: { sha: string; message: string }[],
  labels: { features: string; fixes: string; other: string },
): string {
  const groups: Record<"features" | "fixes" | "other", string[]> = { features: [], fixes: [], other: [] };
  for (const c of commits) {
    const msg = c.message.split("\n")[0].trim();
    if (!msg || /^Merge (pull request|branch|remote-tracking)/.test(msg)) continue;
    const m = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/.exec(msg);
    const kind = m ? m[1].toLowerCase() : "";
    const text = m ? `${m[2] ? `**${m[2]}:** ` : ""}${m[3]}` : msg;
    const line = `- ${text} (${c.sha.slice(0, 7)})`;
    if (kind === "feat" || kind === "feature") groups.features.push(line);
    else if (kind === "fix" || kind === "bugfix") groups.fixes.push(line);
    else groups.other.push(line);
  }
  return (["features", "fixes", "other"] as const)
    .filter((k) => groups[k].length)
    .map((k) => `### ${labels[k]}\n\n${groups[k].join("\n")}`)
    .join("\n\n");
}
