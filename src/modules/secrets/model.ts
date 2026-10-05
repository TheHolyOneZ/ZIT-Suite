import type { EnvConfig, Environment, RepoSecrets, Scope } from "@/core/ipc";


export interface Place {
  repo: string;
  env: string | null;
}

export const scopeOf = (p: Place): Scope => (p.env ? { kind: "env", env: p.env } : { kind: "repo" });
export const placeKey = (p: Place) => `${p.repo}${p.env ? `#${p.env}` : ""}`;

export interface SecretGroup {
  name: string;
  places: (Place & { updated_at: string })[];

  oldest: string;
  stale: number;
}

export interface VariableGroup {
  name: string;
  places: (Place & { value: string; updated_at: string })[];

  values: { value: string; count: number }[];
}

export interface EnvGroup {
  name: string;
  repos: { repo: string; env: Environment; secrets: number; variables: number }[];

  configs: number;
}

export interface RepoRow {
  repo: string;
  secrets: number;
  variables: number;
  environments: number;
  error: RepoSecrets["error"];
}

export interface SecretsIndex {
  secrets: SecretGroup[];
  variables: VariableGroup[];
  environments: EnvGroup[];
  repos: RepoRow[];
}

const DAY = 86_400_000;
export const ageDays = (iso: string, now = Date.now()) =>
  Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));


export const validName = (n: string) =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) && !n.toUpperCase().startsWith("GITHUB_");

export function configOf(e: Environment): EnvConfig {
  return {
    wait_timer: e.wait_timer,
    reviewers: e.reviewers.filter((r) => r.kind === "User").map((r) => r.name),
    prevent_self_review: e.prevent_self_review,
    branch_policy: e.branch_policy,
    patterns: e.patterns,
    can_admins_bypass: e.can_admins_bypass,
  };
}


export function configKey(c: EnvConfig): string {
  const reviewers = [
    ...new Set(c.reviewers.map((r) => r.trim().replace(/^@/, "").toLowerCase()).filter(Boolean)),
  ].sort();
  const patterns =
    c.branch_policy === "custom" ? [...new Set(c.patterns.map((p) => p.trim()).filter(Boolean))].sort() : [];
  return JSON.stringify([
    c.wait_timer,
    reviewers,
    reviewers.length ? c.prevent_self_review : false,
    c.branch_policy,
    patterns,
    c.can_admins_bypass,
  ]);
}

export function buildIndex(scan: RepoSecrets[], staleDays: number, now = Date.now()): SecretsIndex {
  const secrets = new Map<string, SecretGroup>();
  const variables = new Map<string, VariableGroup>();
  const environments = new Map<string, EnvGroup>();
  const addSecret = (repo: string, env: string | null, name: string, updated_at: string) => {
    const g = secrets.get(name) ?? { name, places: [], oldest: updated_at, stale: 0 };
    g.places.push({ repo, env, updated_at });
    if (updated_at < g.oldest) g.oldest = updated_at;
    if (ageDays(updated_at, now) >= staleDays) g.stale++;
    secrets.set(name, g);
  };
  const addVar = (repo: string, env: string | null, name: string, value: string, updated_at: string) => {
    const g = variables.get(name) ?? { name, places: [], values: [] };
    g.places.push({ repo, env, value, updated_at });
    variables.set(name, g);
  };
  for (const r of scan) {
    for (const s of r.secrets) addSecret(r.repo, null, s.name, s.updated_at);
    for (const v of r.variables) addVar(r.repo, null, v.name, v.value, v.updated_at);
    for (const e of r.environments) {
      for (const s of e.secrets) addSecret(r.repo, e.env.name, s.name, s.updated_at);
      for (const v of e.variables) addVar(r.repo, e.env.name, v.name, v.value, v.updated_at);
      const g = environments.get(e.env.name) ?? { name: e.env.name, repos: [], configs: 0 };
      g.repos.push({ repo: r.repo, env: e.env, secrets: e.secrets.length, variables: e.variables.length });
      environments.set(e.env.name, g);
    }
  }
  for (const g of variables.values()) {
    const counts = new Map<string, number>();
    for (const p of g.places) counts.set(p.value, (counts.get(p.value) ?? 0) + 1);
    g.values = [...counts]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
  for (const g of environments.values())
    g.configs = new Set(g.repos.map((x) => configKey(configOf(x.env)))).size;

  const byName = <T extends { name: string }>(m: Map<string, T>) =>
    [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    secrets: byName(secrets).sort((a, b) => b.stale - a.stale || a.name.localeCompare(b.name)),
    variables: byName(variables).sort(
      (a, b) => b.values.length - a.values.length || a.name.localeCompare(b.name),
    ),
    environments: byName(environments).sort(
      (a, b) => b.repos.length - a.repos.length || a.name.localeCompare(b.name),
    ),
    repos: scan
      .map((r) => ({
        repo: r.repo,
        secrets: r.secrets.length + r.environments.reduce((a, e) => a + e.secrets.length, 0),
        variables: r.variables.length + r.environments.reduce((a, e) => a + e.variables.length, 0),
        environments: r.environments.length,
        error: r.error,
      }))
      .sort(
        (a, b) =>
          b.secrets + b.variables + b.environments - (a.secrets + a.variables + a.environments) ||
          a.repo.localeCompare(b.repo, undefined, { sensitivity: "base" }),
      ),
  };
}


export function findUses(text: string, kind: "secrets" | "vars", name: string): number[] {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${kind}\\s*(?:\\.\\s*${n}\\b|\\[\\s*['"]${n}['"]\\s*\\])`, "i");
  return text.split(/\r?\n/).flatMap((l, i) => (re.test(l) ? [i + 1] : []));
}
