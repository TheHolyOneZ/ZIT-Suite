import type { Repo } from "@/core/ipc";

export type HealthStatus = "active" | "dormant" | "dead" | "empty" | "archived";
export const HEALTH_ORDER: HealthStatus[] = ["active", "dormant", "dead", "empty", "archived"];

export interface HealthThresholds {
  activeDays: number;
  dormantDays: number;
}

export interface Health {
  status: HealthStatus;

  score: number;
  daysSincePush: number;
}

const DAY = 86_400_000;
const BASE: Record<HealthStatus, number> = { active: 80, dormant: 50, dead: 20, empty: 5, archived: 10 };

export function computeHealth(repo: Repo, t: HealthThresholds, now = Date.now()): Health {
  const last = new Date(repo.pushed_at ?? repo.updated_at).getTime();
  const daysSincePush = Math.max(0, Math.floor((now - last) / DAY));

  let status: HealthStatus;
  if (repo.archived) status = "archived";
  else if (repo.size === 0) status = "empty";
  else if (daysSincePush <= t.activeDays) status = "active";
  else if (daysSincePush <= t.dormantDays) status = "dormant";
  else status = "dead";

  let score = BASE[status];
  score += Math.min(15, Math.floor(Math.log2(repo.stargazers_count + 1) * 3));
  if (repo.description) score += 5;
  if (repo.license) score += 3;
  if (repo.open_issues_count > 20) score -= 5;
  return { status, score: Math.max(0, Math.min(100, score)), daysSincePush };
}

export const healthTone = {
  active: "ok",
  dormant: "warn",
  dead: "danger",
  empty: "idle",
  archived: "info",
} as const;

export const healthGlyph = {
  active: "signal3",
  dormant: "signal2",
  dead: "signal1",
  empty: "void",
  archived: "archive",
} as const;
