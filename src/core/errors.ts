import type { AppError } from "@/bindings";
import i18n from "i18next";
import { toAppError } from "./ipc";
import { tDynamic } from "./i18n";


export function errorMessage(e: unknown): string {
  const err: AppError = toAppError(e);
  const key = `errors:${err.code}`;
  return i18n.exists(key) ? tDynamic(key) : tDynamic("errors:unknown", { code: err.code });
}

export function errorDetail(e: unknown): string | null {
  return toAppError(e).detail;
}


export function toastError(e: unknown) {

  void import("./store/toasts").then(({ toast }) => toast({ kind: "error", title: errorMessage(e), body: errorDetail(e) ?? undefined }));
}
