import type { Hook, HookHealth, RepoHooks } from "@/core/ipc";


export type HookState = "ok" | "failing" | "unused" | "inactive";
export const HOOK_STATES: HookState[] = ["failing", "ok", "unused", "inactive"];

export function hookState(h: Hook): HookState {
  if (!h.active) return "inactive";
  const code = h.last_response.code;
  if (code == null) return "unused";
  return code >= 200 && code < 300 ? "ok" : "failing";
}


export const urlKey = (url: string) => url.trim().replace(/\/+$/, "").toLowerCase();

export function splitUrl(url: string): { host: string; path: string } {
  try {
    const u = new URL(url.trim());
    return { host: u.host, path: `${u.pathname === "/" ? "" : u.pathname}${u.search}` };
  } catch {
    return { host: url, path: "" };
  }
}

export interface HookAt {
  repo: string;
  hook: Hook;
}


export interface Endpoint {
  key: string;
  url: string;
  host: string;
  path: string;
  hooks: HookAt[];
  states: Record<HookState, number>;

  events: string[];
  worst: HookState;
}

export interface HookIndex {
  endpoints: Endpoint[];
  repos: { repo: string; hooks: Hook[]; error: RepoHooks["error"] }[];
  total: number;
}

const emptyStates = (): Record<HookState, number> => ({ ok: 0, failing: 0, unused: 0, inactive: 0 });

export function worstOf(states: Record<HookState, number>): HookState {
  return HOOK_STATES.find((s) => states[s] > 0) ?? "unused";
}

export function buildIndex(scan: RepoHooks[]): HookIndex {
  const byKey = new Map<string, Endpoint>();
  let total = 0;
  for (const r of scan) {
    for (const hook of r.hooks) {
      total++;
      const key = urlKey(hook.url);
      let e = byKey.get(key);
      if (!e) {
        e = {
          key,
          url: hook.url,
          ...splitUrl(hook.url),
          hooks: [],
          states: emptyStates(),
          events: [],
          worst: "unused",
        };
        byKey.set(key, e);
      }
      e.hooks.push({ repo: r.repo, hook });
      e.states[hookState(hook)]++;
      for (const ev of hook.events) if (!e.events.includes(ev)) e.events.push(ev);
    }
  }
  const endpoints = [...byKey.values()].map((e) => ({
    ...e,
    events: e.events.sort(),
    worst: worstOf(e.states),
  }));
  endpoints.sort(
    (a, b) =>
      b.states.failing - a.states.failing || b.hooks.length - a.hooks.length || a.host.localeCompare(b.host),
  );
  const repos = scan
    .map((r) => ({ repo: r.repo, hooks: r.hooks, error: r.error }))
    .sort(
      (a, b) =>
        b.hooks.length - a.hooks.length || a.repo.localeCompare(b.repo, undefined, { sensitivity: "base" }),
    );
  return { endpoints, repos, total };
}

export const healthKey = (repo: string, id: number) => `${repo}#${id}`;


export function sumHealth(hooks: HookAt[], health: Map<string, HookHealth> | undefined) {
  if (!health) return null;
  let checked = 0;
  let failed = 0;
  for (const h of hooks) {
    const x = health.get(healthKey(h.repo, h.hook.id));
    if (x) {
      checked += x.checked;
      failed += x.failed;
    }
  }
  return { checked, failed };
}


export function eventSummary(events: string[], max = 2): { shown: string[]; more: number; all: boolean } {
  if (events.includes("*")) return { shown: [], more: 0, all: true };
  return { shown: events.slice(0, max), more: Math.max(0, events.length - max), all: false };
}

const csvCell = (v: string | number | boolean) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function hooksCsv(index: HookIndex): string {
  const rows = [
    [
      "repository",
      "url",
      "active",
      "state",
      "events",
      "content_type",
      "verify_ssl",
      "secret",
      "last_code",
      "last_message",
    ],
  ];
  for (const r of index.repos)
    for (const h of r.hooks)
      rows.push([
        r.repo,
        h.url,
        String(h.active),
        hookState(h),
        h.events.join(" "),
        h.content_type,
        String(!h.insecure_ssl),
        String(h.has_secret),
        h.last_response.code == null ? "" : String(h.last_response.code),
        h.last_response.message ?? "",
      ]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
