import type { Cadence, QueueAction } from "@/core/ipc";
import { applyFilter, type RepoFilter, type RepoRow } from "@/modules/repos/filters";
import { CLEANUP_PRESETS, type CleanupPresetId } from "@/modules/repos/cleanup";


export type Target =
  | { kind: "view"; presetId: string; name: string; filter: RepoFilter }
  | { kind: "cleanup"; preset: CleanupPresetId }
  | { kind: "tag"; tag: string }
  | { kind: "repos"; repos: string[] };

const SORT = { key: "name", dir: "asc" } as const;


export function resolveTarget(t: Target, rows: RepoRow[]): string[] {
  switch (t.kind) {
    case "view":
      return applyFilter(rows, t.filter, SORT).map((r) => r.repo.full_name);
    case "cleanup":
      return (CLEANUP_PRESETS.find((p) => p.id === t.preset)?.select(rows) ?? []).map(
        (r) => r.repo.full_name,
      );
    case "tag":
      return rows.filter((r) => r.tags.includes(t.tag)).map((r) => r.repo.full_name);
    case "repos": {
      const known = new Set(rows.map((r) => r.repo.full_name));
      return t.repos.filter((r) => known.has(r));
    }
  }
}


export type ActionKind =
  | "archive"
  | "unarchive"
  | "set_private"
  | "set_public"
  | "delete"
  | "security_feature"
  | "label_upsert"
  | "branch_protect"
  | "release_next";
export const ACTION_KINDS: ActionKind[] = [
  "archive",
  "unarchive",
  "set_private",
  "set_public",
  "security_feature",
  "label_upsert",
  "branch_protect",
  "release_next",
  "delete",
];

export const mustAsk = (a: QueueAction) => a.kind === "delete";

export const DEFAULT_CADENCE: Cadence = { every: "week", hours: 6, at: "09:00", weekday: 0, day: 1 };


export function describeCadence(c: Cadence, t: (k: string, o?: Record<string, unknown>) => string): string {
  switch (c.every) {
    case "hours":
      return t("cadence.everyHours", { count: Math.max(1, c.hours) });
    case "week":
      return t("cadence.everyWeek", { day: t(`weekday.${c.weekday}`), at: c.at });
    case "month":
      return t("cadence.everyMonth", { day: c.day, at: c.at });
    default:
      return t("cadence.everyDay", { at: c.at });
  }
}
