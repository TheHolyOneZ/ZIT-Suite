import type { Change, TreeItem } from "@/core/ipc";


export type Staged =
  | { kind: "edit"; text: string; original: string; executable?: boolean }
  | { kind: "new"; text: string }
  | { kind: "upload"; base64: string; size: number }
  | { kind: "delete" }
  | { kind: "rename"; from: string; text?: string; original?: string };

export type StagedMap = Record<string, Staged>;

export interface FileEntry {
  path: string;
  name: string;
  dir: boolean;
  size: number;
  sha: string | null;
  mode: string;

  status: "new" | "edit" | "delete" | "rename" | null;
}


export function effectiveFiles(items: TreeItem[], staged: StagedMap): FileEntry[] {
  const moved = new Set(Object.values(staged).flatMap((s) => (s.kind === "rename" ? [s.from] : [])));
  const out: FileEntry[] = [];
  for (const i of items) {
    if (i.kind !== "blob" || moved.has(i.path)) continue;
    const s = staged[i.path];
    if (s?.kind === "delete") continue;
    out.push({
      path: i.path,
      name: i.path.split("/").pop()!,
      dir: false,
      size: i.size,
      sha: i.sha,
      mode: i.mode,
      status: s?.kind === "edit" || s?.kind === "upload" ? "edit" : null,
    });
  }
  for (const [path, s] of Object.entries(staged)) {
    if (s.kind === "new" || (s.kind === "upload" && !items.some((i) => i.path === path)))
      out.push({
        path,
        name: path.split("/").pop()!,
        dir: false,
        size: s.kind === "new" ? s.text.length : s.size,
        sha: null,
        mode: "100644",
        status: "new",
      });
    if (s.kind === "rename") {
      const src = items.find((i) => i.path === s.from);
      out.push({
        path,
        name: path.split("/").pop()!,
        dir: false,
        size: src?.size ?? 0,
        sha: src?.sha ?? null,
        mode: src?.mode ?? "100644",
        status: "rename",
      });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export interface Node {
  name: string;
  path: string;
  dir: boolean;
  file?: FileEntry;
  children: Node[];

  changed: boolean;
}

export function buildTree(files: FileEntry[], filter = ""): Node {
  const root: Node = { name: "", path: "", dir: true, children: [], changed: false };
  const q = filter.trim().toLowerCase();
  for (const f of files) {
    if (q && !f.path.toLowerCase().includes(q)) continue;
    const parts = f.path.split("/");
    let cur = root;
    const chain = [root];
    for (let i = 0; i < parts.length - 1; i++) {
      let next = cur.children.find((c) => c.dir && c.name === parts[i]);
      if (!next) {
        next = {
          name: parts[i],
          path: parts.slice(0, i + 1).join("/"),
          dir: true,
          children: [],
          changed: false,
        };
        cur.children.push(next);
      }
      cur = next;
      chain.push(cur);
    }
    cur.children.push({ name: f.name, path: f.path, dir: false, file: f, children: [], changed: !!f.status });
    if (f.status) chain.forEach((n) => (n.changed = true));
  }
  const sort = (n: Node) => {
    n.children.sort(
      (a, b) =>
        Number(b.dir) - Number(a.dir) ||
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
    );
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}


export function toChanges(staged: StagedMap): Change[] {
  const renames: Change[] = [];
  const content: Change[] = [];
  const deletes: Change[] = [];
  for (const [path, s] of Object.entries(staged)) {
    if (s.kind === "rename") {
      renames.push({ kind: "rename", from: s.from, to: path });
      if (s.text !== undefined && s.text !== s.original)
        content.push({ kind: "text", path, text: s.text, executable: null });
    } else if (s.kind === "edit")
      content.push({ kind: "text", path, text: s.text, executable: s.executable ?? null });
    else if (s.kind === "new") content.push({ kind: "text", path, text: s.text, executable: null });
    else if (s.kind === "upload") content.push({ kind: "binary", path, base64: s.base64 });
    else deletes.push({ kind: "delete", path });
  }
  return [...renames, ...content, ...deletes];
}


export function stageEdit(staged: StagedMap, path: string, text: string, original: string): StagedMap {
  const cur = staged[path];
  const next = { ...staged };
  if (cur?.kind === "new") next[path] = { kind: "new", text };
  else if (cur?.kind === "rename") next[path] = { ...cur, text, original: cur.original ?? original };
  else if (text === original && !(cur?.kind === "edit" && cur.executable !== undefined)) delete next[path];
  else
    next[path] = {
      kind: "edit",
      text,
      original,
      executable: cur?.kind === "edit" ? cur.executable : undefined,
    };
  return next;
}


export function stageDelete(staged: StagedMap, path: string): StagedMap {
  const cur = staged[path];
  const next = { ...staged };
  if (cur?.kind === "new" || cur?.kind === "upload") {
    delete next[path];
    return next;
  }
  if (cur?.kind === "rename") {
    delete next[path];
    next[cur.from] = { kind: "delete" };
    return next;
  }
  next[path] = { kind: "delete" };
  return next;
}

export function stageRename(staged: StagedMap, from: string, to: string, existsInTree: boolean): StagedMap {
  const next = { ...staged };
  const cur = next[from];
  delete next[from];
  if (cur?.kind === "new" || cur?.kind === "upload") next[to] = cur;
  else if (cur?.kind === "rename")
    next[to] =
      cur.from === to ? { kind: "edit", text: cur.text ?? "", original: cur.original ?? "" } : { ...cur };
  else if (existsInTree)
    next[to] = {
      kind: "rename",
      from,
      ...(cur?.kind === "edit" ? { text: cur.text, original: cur.original } : {}),
    };

  const t = next[to];
  if (t?.kind === "edit" && t.text === t.original && from !== to && staged[from]?.kind === "rename")
    delete next[to];
  return next;
}


export function languageName(path: string): string | null {
  const name = path.split("/").pop()!.toLowerCase();
  if (name === "dockerfile") return "Dockerfile";
  if (name === "cmakelists.txt") return "CMake";
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  return EXT[ext] ?? null;
}
const EXT: Record<string, string> = {
  ts: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  tsx: "TSX",
  js: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  jsx: "JSX",
  rs: "Rust",
  py: "Python",
  go: "Go",
  java: "Java",
  kt: "Kotlin",
  kts: "Kotlin",
  swift: "Swift",
  c: "C",
  h: "C",
  cpp: "C++",
  cc: "C++",
  hpp: "C++",
  cs: "C#",
  rb: "Ruby",
  php: "PHP",
  lua: "Lua",
  dart: "Dart",
  scala: "Scala",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  ps1: "PowerShell",
  html: "HTML",
  htm: "HTML",
  vue: "Vue",
  svelte: "Svelte",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  less: "LESS",
  md: "Markdown",
  markdown: "Markdown",
  json: "JSON",
  jsonc: "JSON",
  yml: "YAML",
  yaml: "YAML",
  toml: "TOML",
  xml: "XML",
  svg: "XML",
  sql: "SQL",
  ini: "Properties files",
  properties: "Properties files",
  diff: "Diff",
  patch: "Diff",
};

export const isMarkdown = (p: string) => /\.(md|markdown|mdx)$/i.test(p);
export const isImage = (p: string) => /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i.test(p);
export const imageMime = (p: string) => {
  const e = p.split(".").pop()!.toLowerCase();
  return e === "svg"
    ? "image/svg+xml"
    : e === "jpg"
      ? "image/jpeg"
      : e === "ico"
        ? "image/x-icon"
        : `image/${e}`;
};


export function suggestMessage(staged: StagedMap): string {
  const e = Object.entries(staged);
  if (!e.length) return "";
  const name = (p: string) => p.split("/").pop()!;
  if (e.length === 1) {
    const [p, s] = e[0];
    return s.kind === "delete"
      ? `Delete ${name(p)}`
      : s.kind === "new" || s.kind === "upload"
        ? `Add ${name(p)}`
        : s.kind === "rename"
          ? `Rename ${name(s.from)} to ${name(p)}`
          : `Update ${name(p)}`;
  }
  const verb = e.every(([, s]) => s.kind === "new" || s.kind === "upload")
    ? "Add"
    : e.every(([, s]) => s.kind === "delete")
      ? "Delete"
      : "Update";
  return `${verb} ${e.length} files: ${e
    .slice(0, 2)
    .map(([p]) => name(p))
    .join(", ")}${e.length > 2 ? ` and ${e.length - 2} more` : ""}`;
}

export type DiffRow =
  { kind: "same" | "add" | "del"; o?: number; n?: number; text: string } | { kind: "fold"; count: number };


export function diffRows(parts: { value: string; added?: boolean; removed?: boolean }[]): DiffRow[] {
  const out: DiffRow[] = [];
  let o = 0;
  let n = 0;
  for (const p of parts) {
    const lines = p.value.replace(/\n$/, "").split("\n");
    if (p.added) for (const l of lines) out.push({ kind: "add", n: ++n, text: l });
    else if (p.removed) for (const l of lines) out.push({ kind: "del", o: ++o, text: l });
    else if (lines.length > 8) {
      for (const l of lines.slice(0, 3)) out.push({ kind: "same", o: ++o, n: ++n, text: l });
      out.push({ kind: "fold", count: lines.length - 6 });
      o += lines.length - 6;
      n += lines.length - 6;
      for (const l of lines.slice(-3)) out.push({ kind: "same", o: ++o, n: ++n, text: l });
    } else for (const l of lines) out.push({ kind: "same", o: ++o, n: ++n, text: l });
  }
  return out;
}


export function uploadText(base64: string): string | null {
  try {
    const bin = atob(base64);
    if (bin.length > 2_000_000 || bin.includes("\u0000")) return null;
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
