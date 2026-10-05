import { describe, expect, it } from "vitest";
import { confirmWordMatches } from "./ConfirmDialog";

describe("confirmWordMatches", () => {
  it("accepts the localized word, with or without diacritics, any case", () => {
    expect(confirmWordMatches("löschen", "löschen")).toBe(true);
    expect(confirmWordMatches("LOSCHEN ", "löschen")).toBe(true);
  });
  it("always accepts English 'delete' as a layout-independent fallback", () => {
    expect(confirmWordMatches("delete", "löschen")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(confirmWordMatches("", "löschen")).toBe(false);
    expect(confirmWordMatches("lösch", "löschen")).toBe(false);
    expect(confirmWordMatches("yes", "delete")).toBe(false);
  });
});
