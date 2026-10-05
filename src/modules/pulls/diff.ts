export interface DiffRow {
  kind: "hunk" | "add" | "del" | "ctx" | "meta";
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

export function parsePatch(patch: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let o = 0;
  let n = 0;
  for (const line of patch.split("\n")) {
    const h = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (h) {
      o = Number(h[1]);
      n = Number(h[2]);
      rows.push({ kind: "hunk", oldNo: null, newNo: null, text: line });
    } else if (line.startsWith("+")) rows.push({ kind: "add", oldNo: null, newNo: n++, text: line.slice(1) });
    else if (line.startsWith("-")) rows.push({ kind: "del", oldNo: o++, newNo: null, text: line.slice(1) });
    else if (line.startsWith("\\")) rows.push({ kind: "meta", oldNo: null, newNo: null, text: line });
    else rows.push({ kind: "ctx", oldNo: o++, newNo: n++, text: line.slice(1) });
  }
  return rows;
}
