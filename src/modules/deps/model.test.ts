import { describe, expect, it } from "vitest";
import type { RepoDeps } from "@/core/ipc";
import { aggregate, baseVersion, conflicts, freshness, keyOf, lookups } from "./model";

describe("freshness", () => {
  it("reads versions", () => {
    expect(baseVersion("^1.2")).toEqual([1, 2, 0]);
    expect(baseVersion("v0.4.0")).toEqual([0, 4, 0]);
    expect(baseVersion("workspace")).toBeNull();
  });
  it("tells current, allowed, behind", () => {
    expect(freshness("^19.0.0", "npm", "19.2.0")).toBe("allowed");
    expect(freshness("^18.3.1", "npm", "19.2.0")).toBe("major");
    expect(freshness("19.0.0", "npm", "19.2.0")).toBe("minor");
    expect(freshness("1.0", "cargo", "1.0.229")).toBe("allowed");
    expect(freshness("0.11", "cargo", "0.12.4")).toBe("minor");
    expect(freshness("~1.2.0", "npm", "1.2.9")).toBe("allowed");
    expect(freshness("==2.31.0", "pypi", "2.32.3")).toBe("minor");
    expect(freshness(">=2.31", "pypi", "2.32.3")).toBe("allowed");
    expect(freshness("v1.2.3", "go", "v1.2.4")).toBe("patch");
    expect(freshness("2.0.0", "npm", "2.0.0")).toBe("current");
    expect(freshness("", "pypi", "1")).toBe("any");
    expect(freshness("workspace", "npm", "1")).toBe("local");
    expect(freshness("^1", "npm", null)).toBe("unknown");
  });
});

const scan: RepoDeps[] = [
  {
    repo: "a/one",
    branch: "main",
    truncated: false,
    error: null,
    manifests: [
      {
        path: "package.json",
        ecosystem: "npm",
        manager: "pnpm",
        manager_from: "lockfile",
        error: null,
        deps: [
          { name: "react", spec: "^18.3.0", kind: "normal" },
          { name: "vite", spec: "^7.0.0", kind: "dev" },
          { name: "ui", spec: "workspace", kind: "normal" },
        ],
      },
    ],
  },
  {
    repo: "a/two",
    branch: "main",
    truncated: false,
    error: null,
    manifests: [
      {
        path: "web/package.json",
        ecosystem: "npm",
        manager: "npm",
        manager_from: "default",
        error: null,
        deps: [{ name: "react", spec: "^19.1.0", kind: "normal" }],
      },
      {
        path: "requirements.txt",
        ecosystem: "pypi",
        manager: "pip",
        manager_from: "default",
        error: null,
        deps: [{ name: "Flask_Login", spec: "==0.6", kind: "normal" }],
      },
    ],
  },
];

describe("aggregate", () => {
  it("groups uses, finds conflicts and lookups", () => {
    const latest = new Map([
      [keyOf("npm", "react"), { ecosystem: "npm", name: "react", version: "19.2.0", error: null }],
    ]);
    const all = aggregate(scan, latest, true);
    const react = all.find((p) => p.name === "react")!;
    expect(react.uses.map((u) => u.repo)).toEqual(["a/one", "a/two"]);
    expect(react.worst).toBe("major");
    expect(react.versions).toEqual(["18.x", "19.x"]);
    expect(react.tools).toEqual(["pnpm", "npm"]);
    expect(conflicts(all).map((p) => p.name)).toEqual(["react"]);
    expect(aggregate(scan, latest, false).some((p) => p.name === "vite")).toBe(false);
    expect(
      lookups(all)
        .map((l) => l.name)
        .sort(),
    ).toEqual(["Flask_Login", "react", "vite"]);
    expect(keyOf("pypi", "Flask_Login")).toBe("pypi:flask-login");
  });
});
