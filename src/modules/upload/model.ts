import type { FileState, PlanFile } from "@/core/ipc";

export interface UNode {
  name: string;
  path: string;
  dir: boolean;
  size: number;
  state: FileState | null;
  files: string[];
  children: UNode[];
}

export function buildTree(files: PlanFile[]): UNode {
  const root: UNode = { name: "", path: "", dir: true, size: 0, state: null, files: [], children: [] };
  for (const f of files) {
    const parts = f.rel.split("/");
    let cur = root;
    cur.files.push(f.rel);
    cur.size += f.size;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join("/");
      let next = cur.children.find((c) => c.dir && c.path === path);
      if (!next) {
        next = { name: parts[i], path, dir: true, size: 0, state: null, files: [], children: [] };
        cur.children.push(next);
      }
      next.files.push(f.rel);
      next.size += f.size;
      cur = next;
    }
    cur.children.push({
      name: parts[parts.length - 1],
      path: f.rel,
      dir: false,
      size: f.size,
      state: f.state,
      files: [f.rel],
      children: [],
    });
  }
  const sort = (n: UNode) => {
    n.children.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

export const defaultPicks = (files: PlanFile[]) =>
  new Set(files.filter((f) => f.state !== "same").map((f) => f.rel));

export function tickState(node: UNode, picked: Set<string>): "all" | "some" | "none" {
  const n = node.files.filter((f) => picked.has(f)).length;
  return n === 0 ? "none" : n === node.files.length ? "all" : "some";
}

export function toggle(picked: Set<string>, node: UNode, on: boolean): Set<string> {
  const next = new Set(picked);
  for (const f of node.files) {
    if (on) next.add(f);
    else next.delete(f);
  }
  return next;
}

export function suggestMessage(files: PlanFile[], picked: Set<string>): string {
  const chosen = files.filter((f) => picked.has(f.rel));
  if (!chosen.length) return "";
  const name = (p: string) => p.split("/").pop() ?? p;
  const allNew = chosen.every((f) => f.state === "new");
  const verb = allNew ? "Add" : "Update";
  if (chosen.length === 1) return `${verb} ${name(chosen[0].rel)}`;
  if (chosen.length === 2) return `${verb} ${name(chosen[0].rel)} and ${name(chosen[1].rel)}`;
  return `${verb} ${chosen.length} files: ${name(chosen[0].rel)}, ${name(chosen[1].rel)} and ${chosen.length - 2} more`;
}
