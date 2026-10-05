import { describe, expect, it } from "vitest";
import src from "../bindings.ts?raw";

describe("generated bindings", () => {
  it("never export two types with the same name", () => {

    const names = [...src.matchAll(/^export type (\w+)\b/gm)].map((m) => m[1]);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it("never use a reserved word as a command parameter", () => {


    const reserved = new Set(["public", "private", "protected", "package", "interface", "implements", "static", "let", "yield", "switch", "case", "default", "class", "function", "new", "delete", "in", "of", "enum", "export", "import", "super", "this", "var", "void", "with", "await", "return", "typeof", "instanceof", "do", "if", "else", "for", "while", "break", "continue", "throw", "try", "catch", "finally", "const", "debugger"]);
    const params = [...src.matchAll(/^async (\w+)\(([^)]*)\)/gm)].flatMap((m) => m[2].split(",").map((p) => [m[1], p.split(":")[0].trim()] as const));
    expect(params.filter(([, p]) => reserved.has(p)).map(([f, p]) => `${f}(${p})`)).toEqual([]);
  });
});
