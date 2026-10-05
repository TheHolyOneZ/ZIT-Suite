import { describe, expect, it } from "vitest";
import { tokenize } from "./JsonView";

describe("tokenize", () => {
  it("classifies keys, strings, literals and numbers", () => {
    const toks = tokenize('{\n  "a": "x \\"q\\"",\n  "n": -1.5e3,\n  "b": true,\n  "z": null\n}').filter(
      (t) => t.kind !== "plain",
    );
    expect(toks.map((t) => `${t.kind}:${t.text}`)).toEqual([
      'key:"a"',
      'string:"x \\"q\\""',
      'key:"n"',
      "number:-1.5e3",
      'key:"b"',
      "literal:true",
      'key:"z"',
      "literal:null",
    ]);
  });

  it("round-trips the exact text", () => {
    const src = JSON.stringify({ zen: "Keep it simple.", hook_id: 42, events: ["push", "*"] }, null, 2);
    expect(
      tokenize(src)
        .map((t) => t.text)
        .join(""),
    ).toBe(src);
  });
});
