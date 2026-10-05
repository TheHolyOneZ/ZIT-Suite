import { describe, expect, it } from "vitest";
import type { Hook, RepoHooks } from "@/core/ipc";
import { ALL_EVENTS, eventMode } from "./events";
import { buildIndex, eventSummary, hookState, hooksCsv, splitUrl, urlKey } from "./model";

const hook = (id: number, url: string, p: Partial<Hook> = {}): Hook => ({
  id,
  active: true,
  events: ["push"],
  url,
  content_type: "json",
  insecure_ssl: false,
  has_secret: false,
  created_at: "",
  updated_at: "",
  last_response: { code: 200, status: "active", message: "OK" },
  ...p,
});
const repo = (name: string, hooks: Hook[]): RepoHooks => ({ repo: name, hooks, error: null });

describe("webhooks model", () => {
  it("derives state from active + last response", () => {
    expect(hookState(hook(1, "u"))).toBe("ok");
    expect(hookState(hook(1, "u", { active: false }))).toBe("inactive");
    expect(hookState(hook(1, "u", { last_response: { code: null, status: "unused", message: null } }))).toBe(
      "unused",
    );
    expect(
      hookState(hook(1, "u", { last_response: { code: 502, status: "failed", message: "Bad gateway" } })),
    ).toBe("failing");
  });

  it("groups hooks by endpoint URL across repos, failing endpoints first", () => {
    const ci = "https://ci.example.com/gh";
    const idx = buildIndex([
      repo("o/a", [hook(1, ci), hook(2, "https://chat.example.com/x")]),
      repo("o/b", [
        hook(3, `${ci}/`, {
          events: ["pull_request"],
          last_response: { code: 500, status: "failed", message: null },
        }),
      ]),
      repo("o/c", []),
    ]);
    expect(idx.total).toBe(3);
    expect(idx.endpoints.map((e) => e.host)).toEqual(["ci.example.com", "chat.example.com"]);
    const e = idx.endpoints[0];
    expect(e.hooks.map((h) => h.repo)).toEqual(["o/a", "o/b"]);
    expect(e.states).toEqual({ ok: 1, failing: 1, unused: 0, inactive: 0 });
    expect(e.worst).toBe("failing");
    expect(e.events).toEqual(["pull_request", "push"]);
    expect(idx.repos[idx.repos.length - 1].repo).toBe("o/c");
  });

  it("normalizes and splits URLs", () => {
    expect(urlKey(" HTTPS://X.io/a/ ")).toBe("https://x.io/a");
    expect(splitUrl("https://x.io:8443/hook?t=1")).toEqual({ host: "x.io:8443", path: "/hook?t=1" });
    expect(splitUrl("not a url").host).toBe("not a url");
  });

  it("summarizes events and picks the picker mode", () => {
    expect(eventSummary(["*"]).all).toBe(true);
    expect(eventSummary(["a", "b", "c", "d"])).toEqual({ shown: ["a", "b"], more: 2, all: false });
    expect(eventMode(["push"])).toBe("push");
    expect(eventMode(["*"])).toBe("all");
    expect(eventMode(["push", "issues"])).toBe("custom");
    expect(new Set(ALL_EVENTS).size).toBe(ALL_EVENTS.length);
  });

  it("exports CSV with quoting", () => {
    const csv = hooksCsv(
      buildIndex([
        repo("o/a", [
          hook(1, "https://x.io", {
            last_response: { code: 404, status: "failed", message: 'Not "found", sorry' },
          }),
        ]),
      ]),
    );
    expect(csv.split("\n")[1]).toBe(
      'o/a,https://x.io,true,failing,push,json,true,false,404,"Not ""found"", sorry"',
    );
  });
});
