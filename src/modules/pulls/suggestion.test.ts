import { describe, expect, it } from "vitest";
import { applySuggestion, findSuggestion, suggestionBlock } from "./suggestion";

describe("suggested changes", () => {
  it("finds the block and the text around it", () => {
    const s = findSuggestion("Use a const:\n```suggestion\nconst x = 1;\n```\nthanks")!;
    expect(s).toEqual({ before: "Use a const:", after: "thanks", code: "const x = 1;" });
    expect(findSuggestion("```ts\nx\n```")).toBeNull();
    expect(findSuggestion(suggestionBlock(["a", "b"]))!.code).toBe("a\nb");
  });
  it("replaces the commented lines, keeping line endings", () => {
    expect(applySuggestion("a\nb\nc\n", 2, 2, "B1\nB2")).toBe("a\nB1\nB2\nc\n");
    expect(applySuggestion("a\r\nb\r\nc", 1, 2, "x")).toBe("x\r\nc");
    expect(applySuggestion("a\nb\n", 2, 2, "")).toBe("a\n");
  });
});
