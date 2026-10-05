import type { StarList, Starred } from "@/core/ipc";

const DAY = 86_400_000;

export const isStale = (s: Starred, now = Date.now()) => !s.pushed_at || now - Date.parse(s.pushed_at) > 730 * DAY;

export type Flag = "archived" | "stale" | "fork";
export interface StarFilter {
  search: string;
  language: string | null;
  list: string | null;
  flags: Flag[];
}

export function filterStars(stars: Starred[], f: StarFilter, lists: StarList[], now = Date.now()): Starred[] {
  const q = f.search.trim().toLowerCase();
  const inList = f.list ? new Set(lists.find((l) => l.id === f.list)?.items ?? []) : null;
  return stars.filter(
    (s) =>
      (!f.language || (s.language ?? "—") === f.language) &&
      (!inList || inList.has(s.id)) &&
      (!f.flags.includes("archived") || s.archived) &&
      (!f.flags.includes("stale") || isStale(s, now)) &&
      (!f.flags.includes("fork") || s.fork) &&
      (!q || s.repo.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.topics.some((t) => t.includes(q))),
  );
}

export function languageCounts(stars: Starred[]): { name: string; count: number; color: string | null }[] {
  const m = new Map<string, { count: number; color: string | null }>();
  for (const s of stars) {
    const k = s.language ?? "—";
    const cur = m.get(k) ?? { count: 0, color: s.language_color };
    m.set(k, { count: cur.count + 1, color: cur.color });
  }
  return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}


export function membership(lists: StarList[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const l of lists) for (const id of l.items) m.set(id, [...(m.get(id) ?? []), l.id]);
  return m;
}


export function markdownExport(stars: Starred[], title: string): string {
  const groups = new Map<string, Starred[]>();
  for (const s of stars) groups.set(s.language ?? "Other", [...(groups.get(s.language ?? "Other") ?? []), s]);
  const sections = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([lang, list]) => `## ${lang}\n\n${list.map((s) => `- [${s.repo}](${s.url})${s.description ? ` — ${s.description.replace(/\n/g, " ")}` : ""} (★ ${s.stars})`).join("\n")}`);
  return `# ${title}\n\n${sections.join("\n\n")}\n`;
}

const cell = (v: string | number | null) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const csvExport = (stars: Starred[]) =>
  [["repo", "description", "language", "stars", "archived", "pushed_at", "starred_at", "url"], ...stars.map((s) => [s.repo, s.description, s.language, s.stars, String(s.archived), s.pushed_at, s.starred_at, s.url])]
    .map((r) => r.map(cell).join(","))
    .join("\n");

export function parseRepo(input: string): string | null {
  const m = /^(?:https?:\/\/github\.com\/)?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(input.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}
