import { describe, expect, it } from "vitest";
import type { TreeItem } from "@/core/ipc";
import {
  diffRows,
  buildTree,
  effectiveFiles,
  languageName,
  stageDelete,
  stageEdit,
  stageRename,
  suggestMessage,
  toChanges,
} from "./model";

const item = (path: string, mode = "100644"): TreeItem => ({
  path,
  kind: "blob",
  mode,
  sha: `s-${path}`,
  size: 10,
});
const items = [item("README.md"), item("src/main.rs"), item("src/util.rs"), item("run.sh", "100755")];

describe("files model", () => {
  it("stages edits and drops them when reverted", () => {
    let s = stageEdit({}, "src/main.rs", "new", "old");
    expect(s["src/main.rs"]).toMatchObject({ kind: "edit", text: "new" });
    s = stageEdit(s, "src/main.rs", "old", "old");
    expect(s).toEqual({});
  });

  it("renames, deletes and new files show up in the effective tree", () => {
    let s = stageRename({}, "src/util.rs", "src/helpers.rs", true);
    s = stageDelete(s, "README.md");
    s = { ...s, "docs/new.md": { kind: "new", text: "hi" } };
    const f = effectiveFiles(items, s);
    expect(f.map((x) => [x.path, x.status])).toEqual([
      ["docs/new.md", "new"],
      ["run.sh", null],
      ["src/helpers.rs", "rename"],
      ["src/main.rs", null],
    ]);
    const t = buildTree(f);
    expect(t.children.map((c) => c.name)).toEqual(["docs", "src", "run.sh"]);
    expect(t.children.find((c) => c.name === "src")!.changed).toBe(true);
    expect(buildTree(f, "main").children.map((c) => c.name)).toEqual(["src"]);
  });

  it("renaming an edited file keeps the edit; deleting a new file unstages it", () => {
    let s = stageEdit({}, "src/main.rs", "v2", "v1");
    s = stageRename(s, "src/main.rs", "src/app.rs", true);
    expect(s["src/app.rs"]).toEqual({ kind: "rename", from: "src/main.rs", text: "v2", original: "v1" });
    expect(toChanges(s)).toEqual([
      { kind: "rename", from: "src/main.rs", to: "src/app.rs" },
      { kind: "text", path: "src/app.rs", text: "v2", executable: null },
    ]);
    const n = stageDelete({ "x.md": { kind: "new", text: "" } }, "x.md");
    expect(n).toEqual({});
    expect(stageDelete({ "b.rs": { kind: "rename", from: "a.rs" } }, "b.rs")).toEqual({
      "a.rs": { kind: "delete" },
    });
  });

  it("languages and messages", () => {
    expect(languageName("src/App.tsx")).toBe("TSX");
    expect(languageName("Dockerfile")).toBe("Dockerfile");
    expect(languageName("LICENSE")).toBeNull();
    expect(suggestMessage({ "a/b.rs": { kind: "edit", text: "", original: "x" } })).toBe("Update b.rs");
    expect(suggestMessage({ "b.rs": { kind: "rename", from: "a.rs" } })).toBe("Rename a.rs to b.rs");
    expect(suggestMessage({ a: { kind: "delete" }, b: { kind: "delete" }, c: { kind: "delete" } })).toBe(
      "Delete 3 files: a, b and 1 more",
    );
  });
});

describe("diff rows", () => {
  it("numbers lines and folds long unchanged runs", () => {
    const same = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n") + "\n";
    const r = diffRows([{ value: same }, { value: "old\n", removed: true }, { value: "new\n", added: true }]);
    expect(r[3]).toEqual({ kind: "fold", count: 14 });
    expect(r[4]).toEqual({ kind: "same", o: 18, n: 18, text: "l17" });
    expect(r.slice(-2)).toEqual([
      { kind: "del", o: 21, text: "old" },
      { kind: "add", n: 21, text: "new" },
    ]);
  });
});

describe("uploads", () => {
  it("reads text uploads and names all-new changes 'Add'", async () => {
    const { uploadText, suggestMessage } = await import("./model");
    expect(uploadText(btoa("hello\n"))).toBe("hello\n");
    expect(uploadText(btoa("a\u0000b"))).toBeNull();
    expect(uploadText(btoa(String.fromCharCode(0xff, 0xfe, 0x00)))).toBeNull();
    expect(
      suggestMessage({
        "a.txt": { kind: "upload", base64: "", size: 0 },
        "b.txt": { kind: "new", text: "" },
      }),
    ).toBe("Add 2 files: a.txt, b.txt");
  });
});
