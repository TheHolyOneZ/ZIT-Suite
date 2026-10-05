import type { AuditReport, FileStat } from "@/core/ipc";

export interface Node {
  name: string;
  path: string;
  dir: boolean;
  size: number;
  lines: number;
  blank: number;
  files: number;
  language: string | null;
  binary: boolean;
  children: Node[];
}


export function isNoise(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  return (
    /(^|\/)(node_modules|vendor|third_party|dist|build|target)\//.test(path) ||
    /\.(min\.js|min\.css|map)$/.test(name) ||
    [
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "Cargo.lock",
      "poetry.lock",
      "Gemfile.lock",
      "composer.lock",
      "go.sum",
      "bun.lockb",
    ].includes(name)
  );
}

export type SortBy = "lines" | "size" | "name";

const emptyDir = (name: string, path: string): Node => ({
  name,
  path,
  dir: true,
  size: 0,
  lines: 0,
  blank: 0,
  files: 0,
  language: null,
  binary: false,
  children: [],
});


export function buildTree(files: FileStat[], sort: SortBy, skipNoise: boolean): Node {
  const root = emptyDir("", "");
  for (const f of files) {
    if (skipNoise && isNoise(f.path)) continue;
    const parts = f.path.split("/");
    let cur = root;
    const chain = [root];
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts.slice(0, i + 1).join("/");
      let next = cur.children.find((c) => c.dir && c.name === parts[i]);
      if (!next) {
        next = emptyDir(parts[i], p);
        cur.children.push(next);
      }
      cur = next;
      chain.push(cur);
    }
    cur.children.push({
      name: parts[parts.length - 1],
      path: f.path,
      dir: false,
      size: f.size,
      lines: f.lines,
      blank: f.blank,
      files: 1,
      language: f.language,
      binary: f.binary,
      children: [],
    });
    for (const n of chain) {
      n.size += f.size;
      n.lines += f.lines;
      n.blank += f.blank;
      n.files += 1;
    }
  }
  const order = (a: Node, b: Node) => {
    if (sort === "name") return Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name);
    return (sort === "lines" ? b.lines - a.lines : b.size - a.size) || a.name.localeCompare(b.name);
  };
  const sortAll = (n: Node) => {
    n.children.sort(order);
    n.children.forEach(sortAll);
  };
  sortAll(root);
  return root;
}

export interface LangTotal {
  name: string;
  lines: number;
  files: number;
  share: number;
}


export function languageTotals(files: FileStat[], skipNoise: boolean): LangTotal[] {
  const m = new Map<string, { lines: number; files: number }>();
  for (const f of files) {
    if (f.binary || (skipNoise && isNoise(f.path))) continue;
    const k = f.language ?? "Other";
    const cur = m.get(k) ?? { lines: 0, files: 0 };
    m.set(k, { lines: cur.lines + f.lines - f.blank, files: cur.files + 1 });
  }
  const total = [...m.values()].reduce((a, b) => a + b.lines, 0) || 1;
  return [...m.entries()]
    .map(([name, v]) => ({ name, ...v, share: v.lines / total }))
    .sort((a, b) => b.lines - a.lines);
}

const human = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;


export function asciiTree(root: Node, title: string): string {
  const out = [
    `${title}  (${human(root.size)}, ${root.lines.toLocaleString("en")} lines, ${root.files} files)`,
  ];
  const walk = (n: Node, prefix: string) => {
    n.children.forEach((c, i) => {
      const last = i === n.children.length - 1;
      const meta = c.dir
        ? `${human(c.size)}, ${c.lines.toLocaleString("en")} lines, ${c.files} files`
        : c.binary
          ? `${human(c.size)}, binary`
          : `${human(c.size)}, ${c.lines.toLocaleString("en")} lines`;
      out.push(`${prefix}${last ? "└── " : "├── "}${c.name}${c.dir ? "/" : ""}  [${meta}]`);
      if (c.dir) walk(c, prefix + (last ? "    " : "│   "));
    });
  };
  walk(root, "");
  return out.join("\n") + "\n";
}


export function jsonTree(root: Node, meta: Record<string, unknown>): string {
  const strip = (n: Node): unknown =>
    n.dir
      ? {
          name: n.name || "/",
          type: "dir",
          size: n.size,
          lines: n.lines,
          files: n.files,
          children: n.children.map(strip),
        }
      : {
          name: n.name,
          type: "file",
          size: n.size,
          lines: n.lines,
          blank: n.blank,
          language: n.language,
          binary: n.binary,
        };
  return JSON.stringify({ ...meta, tree: strip(root) }, null, 2);
}


export interface Snapshot {
  at: string;
  head: string;
  commits: number;
  code: number;
  lines: number;
  files: number;
  size: number;
  additions: number;
  deletions: number;
  people: number;

  langs: Record<string, number>;
}

export function snapshotOf(r: AuditReport): Snapshot {
  const tree = buildTree(r.files, "name", true);
  const langs: Record<string, number> = {};
  for (const l of languageTotals(r.files, true)) langs[l.name] = l.lines;
  return {
    at: r.generated_at,
    head: r.head,
    commits: r.commits,
    code: tree.lines - tree.blank,
    lines: tree.lines,
    files: tree.files,
    size: tree.size,
    additions: r.additions,
    deletions: r.deletions,
    people: r.contributors.length,
    langs,
  };
}


export function addSnapshot(list: Snapshot[], s: Snapshot, keep = 20): Snapshot[] {
  return [s, ...list.filter((x) => x.head !== s.head)]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, keep);
}

export type SnapshotMetric = "code" | "lines" | "files" | "size" | "commits" | "people";


export function compareSnapshots(before: Snapshot, now: Snapshot) {
  const metrics = (["code", "lines", "files", "size", "commits", "people"] as const).map((k) => ({
    key: k as SnapshotMetric,
    before: before[k],
    now: now[k],
    delta: now[k] - before[k],
  }));
  const names = new Set([...Object.keys(before.langs), ...Object.keys(now.langs)]);
  const langs = [...names]
    .map((name) => ({
      name,
      before: before.langs[name] ?? 0,
      now: now.langs[name] ?? 0,
      delta: (now.langs[name] ?? 0) - (before.langs[name] ?? 0),
    }))
    .filter((l) => l.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name));
  return { metrics, langs };
}
