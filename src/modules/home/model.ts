import type { ChangeKind, SyncState, WorkspaceStatus } from "@/core/ipc";
import type { Glyph, Tone } from "@/ui";


export type Headline =
  | {
      key:
        | "missing"
        | "error"
        | "noCommits"
        | "allGood"
        | "notConnected"
        | "branchNew"
        | "repoGone"
        | "repoMoved";
      tone: Tone;
      glyph: Glyph;
    }
  | { key: "unsaved" | "notUploaded" | "newOnGitHub"; count: number; tone: Tone; glyph: Glyph };

export function headline(
  s: WorkspaceStatus | undefined,
  sync: SyncState | undefined,
  hasPushTarget: boolean,
): Headline | null {
  if (!s) return null;
  if (!s.ok)
    return {
      key: s.error?.code === "workspace.no_folder" ? "missing" : "error",
      tone: "danger",
      glyph: "cross",
    };

  if (sync?.push?.missing) return { key: "repoGone", tone: "danger", glyph: "cross" };
  if (sync?.push?.renamed_to) return { key: "repoMoved", tone: "warn", glyph: "warn" };
  if (s.changes.length) return { key: "unsaved", count: s.changes.length, tone: "warn", glyph: "pending" };
  if (!s.has_commits) return { key: "noCommits", tone: "idle", glyph: "void" };
  const ahead = sync?.push?.ahead ?? s.ahead ?? 0;
  const behind = sync?.push?.behind ?? s.behind ?? 0;
  if (behind) return { key: "newOnGitHub", count: behind, tone: "info", glyph: "open" };
  if (ahead) return { key: "notUploaded", count: ahead, tone: "accent", glyph: "hourglass" };

  if (sync?.push && !sync.push.exists && !sync.push.error)
    return { key: "branchNew", tone: "accent", glyph: "hourglass" };
  if (!hasPushTarget) return { key: "notConnected", tone: "idle", glyph: "equal" };
  return { key: "allGood", tone: "ok", glyph: "tick" };
}

const SECRET = [
  /^\.env(\..+)?$/i,
  /\.(pem|key|p12|pfx|keystore|jks|ppk)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^credentials.*\.json$/i,
  /^secrets?\.(json|ya?ml|toml)$/i,
  /^\.npmrc$/i,
  /^\.netrc$/i,
];


export function isSensitive(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  return SECRET.some((r) => r.test(name)) && !name.endsWith(".example") && !name.endsWith(".sample");
}


export const INTERVALS = [1, 2, 5, 10, 30, 60, 120, 300];

export function nearestInterval(secs: number): number {
  return INTERVALS.reduce((best, v) => (Math.abs(v - secs) < Math.abs(best - secs) ? v : best), INTERVALS[0]);
}

export const intervalLabel = (
  secs: number,
  t: (k: "intervals.s" | "intervals.m", o: { count: number }) => string,
) => (secs < 60 ? t("intervals.s", { count: secs }) : t("intervals.m", { count: Math.round(secs / 60) }));

export const KIND_MARK: Record<ChangeKind, { sign: string; tone: Tone }> = {
  new: { sign: "+", tone: "ok" },
  modified: { sign: "~", tone: "warn" },
  deleted: { sign: "−", tone: "danger" },
  renamed: { sign: "→", tone: "info" },
  conflicted: { sign: "!", tone: "danger" },
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}


export function shortPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length <= 2 ? p : `…/${parts.slice(-2).join("/")}`;
}


export function parseSlug(input: string): string | null {
  let s = input.trim().replace(/\/+$/, "");
  s = s
    .replace(/^(https?:\/\/)?github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/^ssh:\/\/git@github\.com\//, "");
  if (/[:@]/.test(s)) return null;
  s = s.replace(/\.git$/, "");
  return /^[\w.-]+\/[\w.-]+$/.test(s) ? s : null;
}


export function suggestMessage(changes: { path: string; kind: ChangeKind }[]): string {
  const name = (p: string) => p.split("/").pop() ?? p;
  const n = changes.length;
  if (!n) return "";
  const news = changes.filter((c) => c.kind === "new").length;
  const dels = changes.filter((c) => c.kind === "deleted").length;
  const verb = news === n ? "Add" : dels === n ? "Remove" : "Update";
  if (n === 1) return `${verb} ${name(changes[0].path)}`;
  if (n === 2) return `${verb} ${name(changes[0].path)} and ${name(changes[1].path)}`;
  return `${verb} ${n} files: ${name(changes[0].path)}, ${name(changes[1].path)} and ${n - 2} more`;
}
