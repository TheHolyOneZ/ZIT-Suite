import { describe, expect, it } from "vitest";
import type { Hook } from "@/core/ipc";
import { draftErrors, draftFrom, draftPatch, draftToInput, generateSecret, isEmptyPatch } from "./draft";

const hook: Hook = {
  id: 1,
  active: true,
  events: ["push", "issues"],
  url: "https://ci.example.com/h",
  content_type: "json",
  insecure_ssl: false,
  has_secret: true,
  created_at: "",
  updated_at: "",
  last_response: { code: 200, status: "active", message: "OK" },
};

describe("hook drafts", () => {
  it("keeps the secret unless asked, and only patches changed fields", () => {
    const initial = draftFrom(hook);
    expect(initial.secretMode).toBe("keep");
    expect(isEmptyPatch(draftPatch(initial, { ...initial }))).toBe(true);
    expect(isEmptyPatch(draftPatch(initial, { ...initial, events: ["issues", "push"] }))).toBe(true);
    const p = draftPatch(initial, { ...initial, active: false, verifySsl: false });
    expect(p).toEqual({
      url: null,
      content_type: null,
      secret: null,
      insecure_ssl: true,
      events: null,
      active: false,
    });
    expect(draftPatch(initial, { ...initial, secretMode: "remove" }).secret).toBe("");
    expect(draftPatch(initial, { ...initial, secretMode: "set", secret: "abcdefgh12" }).secret).toBe(
      "abcdefgh12",
    );
  });

  it("builds a create input with sane defaults", () => {
    const d = { ...draftFrom(), url: " https://hooks.example.com/x " };
    expect(draftToInput(d)).toEqual({
      url: "https://hooks.example.com/x",
      content_type: "json",
      secret: null,
      insecure_ssl: false,
      events: ["push"],
      active: true,
    });
  });

  it("copying a config into a create form asks for a fresh secret", () => {
    const d = draftFrom(null, {
      url: "https://a.io",
      content_type: "form",
      secret: null,
      insecure_ssl: true,
      events: ["*"],
      active: false,
    });
    expect(d).toMatchObject({
      secretMode: "set",
      secret: "",
      content_type: "form",
      verifySsl: false,
      events: ["*"],
      active: false,
    });
  });

  it("validates url, events and secret length", () => {
    const d = draftFrom();
    expect(draftErrors({ ...d, url: "ftp://x" })).toContain("url");
    expect(draftErrors({ ...d, url: "https://localhost:8080/hook" })).not.toContain("url");
    expect(draftErrors({ ...d, url: "https://a.io", events: [] })).toEqual(["events"]);
    expect(draftErrors({ ...d, url: "https://a.io", secret: "short" })).toEqual(["secret"]);
    expect(generateSecret()).toMatch(/^[0-9a-f]{64}$/);
  });
});
