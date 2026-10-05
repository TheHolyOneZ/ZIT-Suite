import type { FileEdit, Gist } from "@/core/ipc";

export type Visibility = "all" | "public" | "secret";

export function filterGists(gists: Gist[], q: string, vis: Visibility, lang: string | null): Gist[] {
  const s = q.trim().toLowerCase();
  return gists.filter(
    (g) =>
      (vis === "all" || (vis === "public") === g.public) &&
      (!lang || g.files.some((f) => f.language === lang)) &&
      (!s ||
        g.description.toLowerCase().includes(s) ||
        g.files.some((f) => f.filename.toLowerCase().includes(s))),
  );
}


export function languages(gists: Gist[]): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const g of gists)
    for (const l of new Set(g.files.map((f) => f.language).filter((x): x is string => !!x)))
      m.set(l, (m.get(l) ?? 0) + 1);
  return [...m.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}


export const titleOf = (g: Gist) => g.description.trim() || g.files[0]?.filename || g.id;


export interface Draft {
  key: string;
  orig: string | null;
  name: string;
  content: string;
  origContent: string;
  removed: boolean;
}

export const draftsOf = (g: Gist): Draft[] =>
  g.files.map((f) => ({
    key: f.filename,
    orig: f.filename,
    name: f.filename,
    content: f.content ?? "",
    origContent: f.content ?? "",
    removed: false,
  }));


export function editsOf(drafts: Draft[]): FileEdit[] {
  const out: FileEdit[] = [];
  for (const d of drafts) {
    const name = d.name.trim();
    if (d.orig == null) {
      if (!d.removed && name) out.push({ name, new_name: null, content: d.content, delete: false });
    } else if (d.removed) {
      out.push({ name: d.orig, new_name: null, content: null, delete: true });
    } else if (name !== d.orig || d.content !== d.origContent) {
      out.push({
        name: d.orig,
        new_name: name !== d.orig ? name : null,
        content: d.content !== d.origContent ? d.content : null,
        delete: false,
      });
    }
  }
  return out;
}


export function draftProblem(drafts: Draft[]): "empty" | "name" | "duplicate" | "none" | null {
  const live = drafts.filter((d) => !d.removed);
  if (!live.length) return "none";
  if (live.some((d) => !d.content.trim())) return "empty";
  if (live.some((d) => !d.name.trim() || d.name.includes("/"))) return "name";
  const names = live.map((d) => d.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "duplicate";
  return null;
}

export const isMarkdown = (name: string) => /\.(md|markdown)$/i.test(name);
