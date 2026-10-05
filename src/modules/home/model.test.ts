import { describe, expect, it } from "vitest";
import type { WorkspaceStatus } from "@/core/ipc";
import { headline, isSensitive, nearestInterval, parseSlug, shortPath, suggestMessage } from "./model";

const st = (p: Partial<WorkspaceStatus>): WorkspaceStatus => ({
  id: "w",
  ok: true,
  error: null,
  branch: "main",
  has_commits: true,
  changes: [],
  suggested_message: "",
  ahead: 0,
  behind: 0,
  last_commit: null,
  watching: true,
  ...p,
});

describe("home model", () => {
  it("picks the most urgent headline", () => {
    expect(
      headline(
        st({ ok: false, error: { code: "workspace.no_folder", detail: null, status: null } }),
        undefined,
        true,
      )?.key,
    ).toBe("missing");
    expect(
      headline(st({ changes: [{ path: "a", kind: "new", old_path: null, size: 1 }] }), undefined, true),
    ).toMatchObject({ key: "unsaved", count: 1 });
    expect(headline(st({ has_commits: false }), undefined, true)?.key).toBe("noCommits");
    expect(headline(st({ ahead: 2, behind: 1 }), undefined, true)).toMatchObject({
      key: "newOnGitHub",
      count: 1,
    });
    expect(headline(st({ ahead: 2 }), undefined, true)).toMatchObject({ key: "notUploaded", count: 2 });
    expect(headline(st({}), undefined, false)?.key).toBe("notConnected");
    expect(headline(st({}), undefined, true)?.key).toBe("allGood");
    const push = {
      slug: "o/r",
      branch: "x",
      ahead: 0,
      behind: 0,
      related: true,
      exists: false,
      incoming: [],
      outgoing: [],
      error: null,
      missing: false,
      renamed_to: null,
    };
    expect(headline(st({}), { push, reference: null, checked_at: "" }, true)?.key).toBe("branchNew");

    const unsaved = st({ changes: [{ path: "a", kind: "new", old_path: null, size: 1 }] });
    expect(
      headline(unsaved, { push: { ...push, missing: true }, reference: null, checked_at: "" }, true)?.key,
    ).toBe("repoGone");
    expect(
      headline(st({}), { push: { ...push, renamed_to: "o/new" }, reference: null, checked_at: "" }, true)
        ?.key,
    ).toBe("repoMoved");
  });

  it("flags secret-looking files", () => {
    for (const f of [
      ".env",
      "config/.env.production",
      "deploy.pem",
      "id_ed25519",
      "credentials-prod.json",
      ".npmrc",
    ])
      expect(isSensitive(f), f).toBe(true);
    for (const f of ["README.md", ".env.example", "src/key.ts", "keyboard.rs"])
      expect(isSensitive(f), f).toBe(false);
  });

  it("parses repos and formats paths", () => {
    expect(parseSlug("https://github.com/o/r.git")).toBe("o/r");
    expect(parseSlug("git@github.com:o/r.git")).toBe("o/r");
    expect(parseSlug("o/r")).toBe("o/r");
    expect(parseSlug("https://gitlab.com/o/r")).toBeNull();
    expect(shortPath("/home/me/Documents/ZWall")).toBe("…/Documents/ZWall");
    expect(nearestInterval(3)).toBe(2);
    expect(nearestInterval(200)).toBe(120);
  });

  it("suggests commit messages like the backend", () => {
    expect(suggestMessage([{ path: "src/a.txt", kind: "new" }])).toBe("Add a.txt");
    expect(
      suggestMessage([
        { path: "a", kind: "deleted" },
        { path: "b", kind: "deleted" },
      ]),
    ).toBe("Remove a and b");
    expect(suggestMessage(["a", "b", "c", "d"].map((p) => ({ path: p, kind: "modified" as const })))).toBe(
      "Update 4 files: a, b and 2 more",
    );
  });
});
