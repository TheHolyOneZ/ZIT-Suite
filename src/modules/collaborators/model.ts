import type { Invitation, RepoAccess, Role } from "@/core/ipc";
import type { Tone } from "@/ui";

export const ROLES: Role[] = ["read", "triage", "write", "maintain", "admin"];
export const roleRank = (r: Role) => ROLES.indexOf(r);
export const ROLE_LETTER: Record<Role, string> = { read: "R", triage: "T", write: "W", maintain: "M", admin: "A" };
export const ROLE_TONE: Record<Role, Tone> = { read: "idle", triage: "info", write: "accent", maintain: "warn", admin: "danger" };

export interface Grant {
  repo: string;
  role: Role;

  invite: Invitation | null;
}

export interface Person {
  login: string;
  avatar_url: string;
  kind: string;
  grants: Grant[];
  top: Role;
  pending: number;
}

export interface AccessIndex {
  people: Person[];
  repos: { repo: string; owner: string; people: number; invites: number; error: boolean }[];
}


export function buildIndex(scan: RepoAccess[], me: string): AccessIndex {
  const people = new Map<string, Person>();
  const add = (login: string, avatar: string, kind: string, g: Grant) => {
    const key = login.toLowerCase();
    let p = people.get(key);
    if (!p) people.set(key, (p = { login, avatar_url: avatar, kind, grants: [], top: "read", pending: 0 }));
    p.grants.push(g);
    if (g.invite) p.pending++;
    if (roleRank(g.role) > roleRank(p.top)) p.top = g.role;
  };
  const repos: AccessIndex["repos"] = [];
  for (const r of scan) {
    const owner = r.repo.split("/")[0].toLowerCase();
    let n = 0;
    for (const c of r.collaborators) {
      const l = c.login.toLowerCase();
      if (l === owner || l === me.toLowerCase()) continue;
      add(c.login, c.avatar_url, c.kind, { repo: r.repo, role: c.role, invite: null });
      n++;
    }
    for (const i of r.invitations) add(i.login, i.avatar_url, "User", { repo: r.repo, role: i.role, invite: i });
    repos.push({ repo: r.repo, owner, people: n, invites: r.invitations.length, error: !!r.error });
  }
  for (const p of people.values()) p.grants.sort((a, b) => a.repo.localeCompare(b.repo));
  return {
    people: [...people.values()].sort((a, b) => b.grants.length - a.grants.length || a.login.localeCompare(b.login)),
    repos: repos.sort((a, b) => b.people + b.invites - (a.people + a.invites) || a.repo.localeCompare(b.repo)),
  };
}

export interface AccessDiff {
  onlyA: { login: string; role: Role }[];
  onlyB: { login: string; role: Role }[];
  changed: { login: string; a: Role; b: Role }[];
  same: number;
}


export function diffAccess(a: RepoAccess, b: RepoAccess): AccessDiff {
  const map = (r: RepoAccess) => {
    const owner = r.repo.split("/")[0].toLowerCase();
    return new Map(r.collaborators.filter((c) => c.login.toLowerCase() !== owner).map((c) => [c.login.toLowerCase(), c]));
  };
  const A = map(a);
  const B = map(b);
  const d: AccessDiff = { onlyA: [], onlyB: [], changed: [], same: 0 };
  for (const [k, c] of A) {
    const o = B.get(k);
    if (!o) d.onlyA.push({ login: c.login, role: c.role });
    else if (o.role !== c.role) d.changed.push({ login: c.login, a: c.role, b: o.role });
    else d.same++;
  }
  for (const [k, c] of B) if (!A.has(k)) d.onlyB.push({ login: c.login, role: c.role });
  return d;
}

export function accessCsv(index: AccessIndex): string {
  const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = ["login,kind,repo,role,status"];
  for (const p of index.people) for (const g of p.grants) rows.push([p.login, p.kind, g.repo, g.role, g.invite ? "invited" : "active"].map(q).join(","));
  return rows.join("\n") + "\n";
}
