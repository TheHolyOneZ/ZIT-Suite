import { describe, expect, it } from "vitest";
import { comboOf } from "./keyboard";

const ev = (key: string, mods: Partial<KeyboardEvent> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods }) as KeyboardEvent;

describe("comboOf", () => {
  it("normalizes modifiers and keys", () => {
    expect(comboOf(ev("k", { ctrlKey: true }))).toBe("mod+k");
    expect(comboOf(ev("K", { metaKey: true }))).toBe("mod+k");
    expect(comboOf(ev(" "))).toBe("space");
    expect(comboOf(ev("Escape"))).toBe("escape");
    expect(comboOf(ev("ArrowDown", { shiftKey: true }))).toBe("shift+arrowdown");
  });
});
