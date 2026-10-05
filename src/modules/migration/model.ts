export type CaseMode = "keep" | "lower" | "kebab" | "snake";

export interface RenameRules {
  stripPrefix: string;
  stripSuffix: string;
  find: string;
  replace: string;
  regex: boolean;
  caseMode: CaseMode;
  prefix: string;
  suffix: string;
}

export const NO_RULES: RenameRules = {
  stripPrefix: "",
  stripSuffix: "",
  find: "",
  replace: "",
  regex: false,
  caseMode: "keep",
  prefix: "",
  suffix: "",
};


export const validRepoName = (n: string) =>
  !!n && n.length <= 100 && n !== "." && n !== ".." && /^[A-Za-z0-9._-]+$/.test(n);


const words = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());


export function applyRules(name: string, r: RenameRules): string {
  let n = name;
  if (r.stripPrefix && n.toLowerCase().startsWith(r.stripPrefix.toLowerCase()))
    n = n.slice(r.stripPrefix.length);
  if (r.stripSuffix && n.toLowerCase().endsWith(r.stripSuffix.toLowerCase()))
    n = n.slice(0, n.length - r.stripSuffix.length);
  if (r.find) {
    if (r.regex) {
      try {
        n = n.replace(new RegExp(r.find, "g"), r.replace);
      } catch {
      }
    } else n = n.split(r.find).join(r.replace);
  }
  if (r.caseMode === "lower") n = n.toLowerCase();
  if (r.caseMode === "kebab") n = words(n).join("-");
  if (r.caseMode === "snake") n = words(n).join("_");
  n = `${r.prefix}${n}${r.suffix}`;
  return n.replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "-");
}

export type PlanStatus = "ok" | "same" | "invalid" | "duplicate" | "taken";

export interface PlanRow {
  repo: string;
  owner: string;
  from: string;
  to: string;
  status: PlanStatus;
}


export function planRenames(
  repos: string[],
  rules: RenameRules,
  overrides: Record<string, string>,
  existing: string[],
): PlanRow[] {
  const rows = repos.map((full) => {
    const [owner, from] = full.split("/");
    return {
      repo: full,
      owner,
      from,
      to: (overrides[full] ?? applyRules(from, rules)).trim(),
      status: "ok" as PlanStatus,
    };
  });
  const taken = new Set(existing.map((e) => e.toLowerCase()));
  const count = new Map<string, number>();
  for (const r of rows)
    count.set(`${r.owner}/${r.to}`.toLowerCase(), (count.get(`${r.owner}/${r.to}`.toLowerCase()) ?? 0) + 1);
  for (const r of rows) {
    const target = `${r.owner}/${r.to}`.toLowerCase();
    r.status =
      r.to === r.from
        ? "same"
        : !validRepoName(r.to)
          ? "invalid"
          : (count.get(target) ?? 0) > 1
            ? "duplicate"
            : taken.has(target) && target !== r.repo.toLowerCase()
              ? "taken"
              : "ok";
  }
  return rows;
}
