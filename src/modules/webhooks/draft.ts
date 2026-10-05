import type { Hook, HookInput, HookPatch } from "@/core/ipc";

export type SecretMode = "keep" | "set" | "remove";


export interface HookDraft {
  url: string;
  content_type: "json" | "form";
  secretMode: SecretMode;
  secret: string;
  verifySsl: boolean;
  events: string[];
  active: boolean;
}

export function draftFrom(h?: Hook | null, config?: HookInput | null): HookDraft {
  if (config)
    return {
      url: config.url,
      content_type: config.content_type === "form" ? "form" : "json",

      secretMode: "set",
      secret: config.secret ?? "",
      verifySsl: !config.insecure_ssl,
      events: [...config.events],
      active: config.active,
    };
  return {
    url: h?.url ?? "",
    content_type: h?.content_type === "form" ? "form" : "json",
    secretMode: h ? "keep" : "set",
    secret: "",
    verifySsl: h ? !h.insecure_ssl : true,
    events: h ? [...h.events] : ["push"],
    active: h?.active ?? true,
  };
}

const secretValue = (d: HookDraft): string | null =>
  d.secretMode === "set" ? (d.secret.trim() ? d.secret : null) : d.secretMode === "remove" ? "" : null;

export function draftToInput(d: HookDraft): HookInput {
  return {
    url: d.url.trim(),
    content_type: d.content_type,
    secret: secretValue(d),
    insecure_ssl: !d.verifySsl,
    events: [...d.events],
    active: d.active,
  };
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));


export function draftPatch(initial: HookDraft, d: HookDraft): HookPatch {
  return {
    url: d.url.trim() !== initial.url.trim() ? d.url.trim() : null,
    content_type: d.content_type !== initial.content_type ? d.content_type : null,
    secret: secretValue(d),
    insecure_ssl: d.verifySsl !== initial.verifySsl ? !d.verifySsl : null,
    events: sameSet(d.events, initial.events) ? null : [...d.events],
    active: d.active !== initial.active ? d.active : null,
  };
}

export const isEmptyPatch = (p: HookPatch) => Object.values(p).every((v) => v == null);

export type DraftError = "url" | "events" | "secret";

export function draftErrors(d: HookDraft): DraftError[] {
  const out: DraftError[] = [];
  if (!/^https?:\/\/[^\s/]+\.[^\s]*$|^https?:\/\/[^\s/]+:\d+/.test(d.url.trim())) out.push("url");
  if (d.events.length === 0) out.push("events");
  if (d.secretMode === "set" && d.secret.length > 0 && d.secret.trim().length < 8) out.push("secret");
  return out;
}


export function generateSecret(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}


export const NO_PATCH: HookPatch = {
  url: null,
  content_type: null,
  secret: null,
  insecure_ssl: null,
  events: null,
  active: null,
};
