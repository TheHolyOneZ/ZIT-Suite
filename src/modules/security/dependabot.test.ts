import { describe, expect, it } from "vitest";
import { dependabotYml, detectTargets } from "./dependabot";

describe("dependabot config", () => {
  it("detects ecosystems and folders, skips vendored code", () => {
    const t = detectTargets([
      "package.json",
      "src-tauri/Cargo.toml",
      "node_modules/x/package.json",
      ".github/workflows/ci.yml",
      "web/package.json",
      "README.md",
    ]);
    expect(t).toEqual([
      { ecosystem: "cargo", directory: "/src-tauri" },
      { ecosystem: "github-actions", directory: "/" },
      { ecosystem: "npm", directory: "/" },
      { ecosystem: "npm", directory: "/web" },
    ]);
  });
  it("writes the yml", () => {
    const y = dependabotYml([{ ecosystem: "npm", directory: "/" }], "weekly", true);
    expect(y).toBe(
      'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "weekly"\n    groups:\n      npm:\n        patterns:\n          - "*"\n',
    );
  });
});
