import { beforeAll, describe, expect, it } from "vitest";
import i18n from "i18next";
import { initI18n, languages } from "../i18n";
import { allModules } from "./registry";

beforeAll(async () => {
  (globalThis as { document?: unknown }).document ??= { documentElement: {} };
  await initI18n("en");
});

describe("module registry", () => {
  it("discovers modules with unique ids", () => {
    const ids = allModules.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["auth", "repos", "queue", "settings"]));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every module's user-facing keys resolve in every language", () => {
    for (const lng of languages) {
      for (const m of allModules) {
        const keys = [
          m.titleKey,
          ...(m.commands ?? []).map((c) => c.titleKey),
          ...(m.shortcuts ?? []).map((s) => s.labelKey),
          ...(m.settings ?? []).flatMap((f) => [f.labelKey, ...(f.hintKey ? [f.hintKey] : [])]),
        ];
        for (const k of keys) expect(i18n.exists(k, { lng }), `${lng}: ${k}`).toBe(true);
      }
    }
  });
});
