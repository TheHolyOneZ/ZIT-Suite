import { describe, expect, it } from "vitest";
import { parsePatch } from "./diff";

describe("parsePatch", () => {
  it("numbers context, additions and deletions per hunk", () => {
    const rows = parsePatch("@@ -10,3 +10,4 @@ fn x\n a\n-b\n+B\n+C\n c\n\\ No newline at end of file");
    expect(rows.map((r) => [r.kind, r.oldNo, r.newNo])).toEqual([
      ["hunk", null, null],
      ["ctx", 10, 10],
      ["del", 11, null],
      ["add", null, 11],
      ["add", null, 12],
      ["ctx", 12, 13],
      ["meta", null, null],
    ]);
  });
});
