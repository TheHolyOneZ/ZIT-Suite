import type { Repo } from "@/core/ipc";
import { daysSince, type FixKind, type Rule, type Severity } from "./model";


export const FIELDS = {
  pushedDays: "number",
  createdDays: "number",
  sizeMb: "number",
  stars: "number",
  forks: "number",
  openIssues: "number",
  private: "flag",
  fork: "flag",
  archived: "flag",
  template: "flag",
  hasDescription: "flag",
  hasLicense: "flag",
  hasTopics: "flag",
  hasHomepage: "flag",
  language: "text",
  name: "text",
  topic: "text",
  defaultBranch: "text",
} as const;
export type Field = keyof typeof FIELDS;
export type Op = "gt" | "lt" | "yes" | "no" | "is" | "isNot" | "contains" | "notContains";
export const OPS: Record<(typeof FIELDS)[Field], Op[]> = {
  number: ["gt", "lt"],
  flag: ["yes", "no"],
  text: ["is", "isNot", "contains", "notContains"],
};

export interface Cond {
  field: Field;
  op: Op;
  value: string;
}

export interface CustomRule {
  id: string;
  name: string;
  severity: Severity;
  fix: FixKind | null;

  conds: Cond[];
}

function valueOf(r: Repo, f: Field, now: number): number | boolean | string | string[] {
  switch (f) {
    case "pushedDays":
      return daysSince(r.pushed_at, now);
    case "createdDays":
      return daysSince(r.created_at, now);
    case "sizeMb":
      return r.size / 1024;
    case "stars":
      return r.stargazers_count;
    case "forks":
      return r.forks_count;
    case "openIssues":
      return r.open_issues_count;
    case "private":
      return r.private;
    case "fork":
      return r.fork;
    case "archived":
      return r.archived;
    case "template":
      return r.is_template;
    case "hasDescription":
      return !!r.description?.trim();
    case "hasLicense":
      return !!r.license;
    case "hasTopics":
      return !!r.topics?.length;
    case "hasHomepage":
      return !!r.homepage?.trim();
    case "language":
      return r.language ?? "";
    case "name":
      return r.name;
    case "topic":
      return r.topics ?? [];
    case "defaultBranch":
      return r.default_branch ?? "";
  }
}

export function matches(r: Repo, c: Cond, now = Date.now()): boolean {
  const v = valueOf(r, c.field, now);
  const want = c.value.trim().toLowerCase();
  const texts = (Array.isArray(v) ? v : [String(v)]).map((x) => x.toLowerCase());
  switch (c.op) {
    case "gt":
      return typeof v === "number" && want !== "" && v > Number(want);
    case "lt":
      return typeof v === "number" && want !== "" && v < Number(want);
    case "yes":
      return v === true;
    case "no":
      return v === false;
    case "is":
      return texts.includes(want);
    case "isNot":
      return !texts.includes(want);
    case "contains":
      return texts.some((x) => x.includes(want));
    case "notContains":
      return !texts.some((x) => x.includes(want));
  }
}


export const condComplete = (c: Cond) =>
  FIELDS[c.field] === "flag" ||
  (c.value.trim() !== "" && (FIELDS[c.field] !== "number" || Number.isFinite(Number(c.value))));

export function toRule(c: CustomRule): Rule {
  const conds = c.conds.filter(condComplete);
  return {
    id: c.id,
    name: c.name,
    severity: c.severity,
    fix: c.fix ?? undefined,
    test: (r, now) => conds.length > 0 && conds.every((x) => matches(r, x, now)),
  };
}

export const newCond = (field: Field = "pushedDays"): Cond => ({
  field,
  op: OPS[FIELDS[field]][0],
  value: "",
});
