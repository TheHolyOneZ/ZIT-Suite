import type { RemoteBranch } from "@/core/ipc";

export type BranchFilter = "all" | "stale" | "merged" | "pr" | "protected";

export interface BranchFacts {
  isDefault: boolean;

  stale: boolean;

  merged: boolean;

  age: number | null;

  removable: boolean;
}

export function factsOf(
  b: RemoteBranch,
  defaultBranch: string | null,
  staleDays: number,
  now = Date.now(),
): BranchFacts {
  const isDefault = b.name === defaultBranch;
  const age = b.date ? Math.floor((now - Date.parse(b.date)) / 86_400_000) : null;
  const merged = !isDefault && b.ahead === 0;
  return {
    isDefault,
    stale: !isDefault && age != null && age >= staleDays,
    merged,
    age,
    removable: merged && !b.prs && !b.protected,
  };
}

export function filterBranches(
  list: RemoteBranch[],
  f: BranchFilter,
  q: string,
  facts: (b: RemoteBranch) => BranchFacts,
): RemoteBranch[] {
  const needle = q.trim().toLowerCase();
  return list.filter((b) => {
    const x = facts(b);
    if (
      needle &&
      ![b.name, b.message, b.author, b.author_login, b.pr?.title].some((s) =>
        s?.toLowerCase().includes(needle),
      )
    )
      return false;
    switch (f) {
      case "stale":
        return x.stale;
      case "merged":
        return x.merged;
      case "pr":
        return b.prs > 0;
      case "protected":
        return b.protected;
      default:
        return true;
    }
  });
}


export const sortBranches = (list: RemoteBranch[], defaultBranch: string | null) =>
  [...list].sort(
    (a, b) =>
      Number(b.name === defaultBranch) - Number(a.name === defaultBranch) ||
      (b.date ?? "").localeCompare(a.date ?? ""),
  );


export function validBranchName(name: string): boolean {
  if (!name || name.length > 250 || name === "@") return false;
  if (/^[/.-]/.test(name) || /[/.]$/.test(name) || name.endsWith(".lock")) return false;
  if (name.includes("..") || name.includes("//") || name.includes("@{")) return false;
  return ![...name].some((c) => c.charCodeAt(0) < 33 || c.charCodeAt(0) === 127 || "~^:?*[\\".includes(c));
}


export const cleanBranchName = (s: string) => s.replace(/\s+/g, "-").replace(/[~^:?*[\\]/g, "");
