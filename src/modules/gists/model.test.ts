import { describe, expect, it } from "vitest";
import type { Gist } from "@/core/ipc";
import { draftProblem, draftsOf, editsOf, filterGists, languages, titleOf } from "./model";

const gist = (p: Partial<Gist>): Gist => ({
  id: "1",
  description: "",
  public: true,
  html_url: "",
  created_at: "",
  updated_at: "",
  comments: 0,
  owner: "me",
  files: [],
  ...p,
});
const file = (filename: string, language: string | null, content = "x") => ({
  filename,
  language,
  size: 1,
  raw_url: "",
  content,
  truncated: false,
});

describe("gists model", () => {
  const list = [
    gist({ id: "a", description: "Bash tricks", files: [file("x.sh", "Shell")] }),
    gist({ id: "b", public: false, files: [file("notes.md", "Markdown"), file("y.sh", "Shell")] }),
  ];

  it("filters and lists languages", () => {
    expect(filterGists(list, "notes", "all", null).map((g) => g.id)).toEqual(["b"]);
    expect(filterGists(list, "", "secret", null).map((g) => g.id)).toEqual(["b"]);
    expect(filterGists(list, "", "all", "Markdown").map((g) => g.id)).toEqual(["b"]);
    expect(languages(list)).toEqual([
      { name: "Shell", count: 2 },
      { name: "Markdown", count: 1 },
    ]);
    expect(titleOf(list[1])).toBe("notes.md");
  });

  it("computes minimal edits", () => {
    const d = draftsOf(
      gist({ files: [file("a.md", null, "1"), file("b.md", null, "2"), file("c.md", null, "3")] }),
    );
    d[0].name = "a2.md";
    d[1].content = "22";
    d[2].removed = true;
    d.push({ key: "new", orig: null, name: "n.txt", content: "hi", origContent: "", removed: false });
    expect(editsOf(d)).toEqual([
      { name: "a.md", new_name: "a2.md", content: null, delete: false },
      { name: "b.md", new_name: null, content: "22", delete: false },
      { name: "c.md", new_name: null, content: null, delete: true },
      { name: "n.txt", new_name: null, content: "hi", delete: false },
    ]);
    expect(editsOf(draftsOf(gist({ files: [file("a.md", null)] })))).toEqual([]);
  });

  it("flags problems before saving", () => {
    const d = draftsOf(gist({ files: [file("a.md", null), file("b.md", null)] }));
    expect(draftProblem(d)).toBeNull();
    d[1].name = "A.md";
    expect(draftProblem(d)).toBe("duplicate");
    d[1].name = "b.md";
    d[1].content = " ";
    expect(draftProblem(d)).toBe("empty");
    expect(draftProblem(d.map((x) => ({ ...x, removed: true })))).toBe("none");
  });
});
