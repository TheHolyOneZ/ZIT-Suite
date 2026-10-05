import type { RepoRow } from "./filters";

export type CleanupPresetId = "spring" | "portfolio" | "minimal";

export interface CleanupPreset {
  id: CleanupPresetId;
  action: "archive" | "set_private" | "delete";
  select: (rows: RepoRow[]) => RepoRow[];
}

const owned = (r: RepoRow) => r.repo.permissions?.admin ?? false;

export const CLEANUP_PRESETS: CleanupPreset[] = [
  {
    id: "spring",
    action: "archive",
    select: (rows) =>
      rows.filter((r) => owned(r) && (r.health.status === "dead" || r.health.status === "empty")),
  },
  {
    id: "portfolio",
    action: "set_private",
    select: (rows) =>
      rows.filter(
        (r) =>
          owned(r) &&
          !r.repo.private &&
          !r.repo.archived &&
          r.health.status !== "active" &&
          r.repo.stargazers_count === 0,
      ),
  },
  {
    id: "minimal",
    action: "archive",
    select: (rows) =>
      rows
        .filter((r) => owned(r) && !r.repo.archived)
        .sort((a, b) => a.health.score - b.health.score)
        .slice(0, 20),
  },
];
