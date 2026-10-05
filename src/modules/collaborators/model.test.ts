import { describe, expect, it } from "vitest";
import type { Collaborator, RepoAccess } from "@/core/ipc";
import { accessCsv, buildIndex, diffAccess } from "./model";

const col = (login: string, role: Collaborator["role"]): Collaborator => ({ login, avatar_url: "", html_url: "", role, role_name: role, kind: "User" });
const scan = (repo: string, cs: Collaborator[], invites: string[] = []): RepoAccess => ({
  repo,
  collaborators: cs,
  invitations: invites.map((l, i) => ({ id: i + 1, login: l, avatar_url: "", role: "write", created_at: "", expired: false, html_url: "" })),
  error: null,
});

describe("buildIndex", () => {
  it("indexes people across repos, excluding owners and me", () => {
    const idx = buildIndex(
      [scan("me/a", [col("me", "admin"), col("bob", "write")]), scan("me/b", [col("me", "admin"), col("bob", "admin"), col("eve", "read")], ["zed"])],
      "me",
    );
    expect(idx.people.map((p) => [p.login, p.grants.length, p.top, p.pending])).toEqual([
      ["bob", 2, "admin", 0],
      ["eve", 1, "read", 0],
      ["zed", 1, "write", 1],
    ]);
    expect(idx.repos.find((r) => r.repo === "me/b")).toMatchObject({ people: 2, invites: 1 });
  });

  it("exports one CSV row per grant", () => {
    const csv = accessCsv(buildIndex([scan("me/a", [col("bob", "write")], ["zed"])], "me"));
    expect(csv.trim().split("\n")).toEqual(["login,kind,repo,role,status", "bob,User,me/a,write,active", "zed,User,me/a,write,invited"]);
  });
});

describe("diffAccess", () => {
  it("finds only-in-A, only-in-B and role changes", () => {
    const d = diffAccess(scan("me/a", [col("me", "admin"), col("bob", "write"), col("eve", "read")]), scan("me/b", [col("bob", "admin"), col("kim", "triage")]));
    expect(d.onlyA).toEqual([{ login: "eve", role: "read" }]);
    expect(d.onlyB).toEqual([{ login: "kim", role: "triage" }]);
    expect(d.changed).toEqual([{ login: "bob", a: "write", b: "admin" }]);
  });
});
