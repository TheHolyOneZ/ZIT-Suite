import type { Latest, RepoDeps } from "@/core/ipc";


export type Freshness = "current" | "allowed" | "patch" | "minor" | "major" | "any" | "local" | "unknown";

export const FRESH_ORDER: Freshness[] = [
  "major",
  "minor",
  "patch",
  "allowed",
  "any",
  "unknown",
  "local",
  "current",
];

type V = [number, number, number];


export function baseVersion(s: string): V | null {
  const m = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(s);
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

const cmp = (a: V, b: V) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];


function accepts(spec: string, ecosystem: string, base: V, latest: V): boolean {
  const s = spec.trim();
  if (/^>=?\s*\d/.test(s) && !s.includes("<") && !s.includes(",")) return true;
  const caret = s.startsWith("^") || (ecosystem === "cargo" && /^\d/.test(s));
  const tilde = s.startsWith("~") && !s.startsWith("~=");
  if (caret)
    return base[0] > 0
      ? latest[0] === base[0]
      : base[1] > 0
        ? latest[0] === 0 && latest[1] === base[1]
        : cmp(latest, base) === 0;
  if (tilde) return latest[0] === base[0] && latest[1] === base[1];
  if (s.startsWith("~="))
    return latest[0] === base[0] && (s.split(".").length > 2 ? latest[1] === base[1] : true);
  return false;
}

export function freshness(spec: string, ecosystem: string, latest: string | null | undefined): Freshness {
  const s = spec.trim();
  if (s === "workspace" || s === "path" || s === "git") return "local";
  if (!s || s === "*" || s === "latest" || s === "x") return "any";
  if (!latest) return "unknown";
  const base = baseVersion(s);
  const top = baseVersion(latest);
  if (!base || !top) return "unknown";
  if (cmp(base, top) >= 0) return "current";
  if (accepts(s, ecosystem, base, top)) return "allowed";
  return top[0] !== base[0] ? "major" : top[1] !== base[1] ? "minor" : "patch";
}

export interface Use {
  repo: string;
  path: string;
  branch: string;
  spec: string;
  kind: string;

  manager: string;

  managerFrom: string;
}

export interface Package {
  key: string;
  ecosystem: string;
  name: string;
  uses: Use[];
  latest: string | null;
  latestError: string | null;

  worst: Freshness;

  tools: string[];

  versions: string[];
}

export const keyOf = (ecosystem: string, name: string) =>
  `${ecosystem}:${ecosystem === "pypi" ? name.toLowerCase().replace(/[-_.]+/g, "-") : name}`;


export function aggregate(scan: RepoDeps[], latest: Map<string, Latest>, includeDev: boolean): Package[] {
  const map = new Map<string, Package>();
  for (const r of scan)
    for (const m of r.manifests)
      for (const d of m.deps) {
        if (!includeDev && d.kind === "dev") continue;
        const key = keyOf(m.ecosystem, d.name);
        let p = map.get(key);
        if (!p) {
          const l = latest.get(key);
          p = {
            key,
            ecosystem: m.ecosystem,
            name: d.name,
            uses: [],
            latest: l?.version ?? null,
            latestError: l?.error ?? null,
            worst: "current",
            versions: [],
            tools: [],
          };
          map.set(key, p);
        }
        p.uses.push({
          repo: r.repo,
          path: m.path,
          branch: r.branch,
          spec: d.spec,
          kind: d.kind,
          manager: m.manager,
          managerFrom: m.manager_from,
        });
        if (!p.tools.includes(m.manager)) p.tools.push(m.manager);
      }
  for (const p of map.values()) {
    const fs = p.uses.map((u) => freshness(u.spec, p.ecosystem, p.latest));
    p.worst = FRESH_ORDER.find((f) => fs.includes(f)) ?? "current";
    const vs = new Set<string>();
    for (const u of p.uses) {
      const f = freshness(u.spec, p.ecosystem, "0");
      const b = baseVersion(u.spec);

      if (f !== "local" && f !== "any" && b) vs.add(b[0] > 0 ? `${b[0]}.x` : `0.${b[1]}.x`);
    }
    p.versions = [...vs].sort((a, b) =>
      cmp(baseVersion(a.replace("x", "0"))!, baseVersion(b.replace("x", "0"))!),
    );
  }
  return [...map.values()].sort((a, b) => b.uses.length - a.uses.length || a.name.localeCompare(b.name));
}


export const conflicts = (packages: Package[]) =>
  packages.filter((p) => p.versions.length > 1 && new Set(p.uses.map((u) => u.repo)).size > 1);

export const isBehind = (f: Freshness) => f === "major" || f === "minor" || f === "patch";


export function lookups(packages: Package[]): { ecosystem: string; name: string }[] {
  return packages
    .filter((p) => p.uses.some((u) => freshness(u.spec, p.ecosystem, "0") !== "local"))
    .map((p) => ({ ecosystem: p.ecosystem, name: p.name }));
}


export const TOOL_ORDER = [
  "pnpm",
  "yarn",
  "bun",
  "npm",
  "deno",
  "pip",
  "poetry",
  "uv",
  "pdm",
  "pipenv",
  "hatch",
  "flit",
  "pixi",
  "cargo",
  "go",
  "maven",
  "gradle",
];
const toolRank = (t: string) => {
  const i = TOOL_ORDER.indexOf(t);
  return i < 0 ? TOOL_ORDER.length : i;
};
export const sortTools = (tools: string[]) =>
  [...tools].sort((a, b) => toolRank(a) - toolRank(b) || a.localeCompare(b));
