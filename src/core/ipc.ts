import type { AppError } from "@/bindings";

export { commands, events } from "@/bindings";
export type * from "@/bindings";

export class IpcError extends Error {
  constructor(public readonly appError: AppError) {
    super(appError.code);
    this.name = "IpcError";
  }
}

type Result<T> = { status: "ok"; data: T } | { status: "error"; error: AppError };

export async function unwrap<T>(p: Promise<Result<T>>): Promise<T> {
  const r = await p;
  if (r.status === "error") throw new IpcError(r.error);
  return r.data;
}

export function toAppError(e: unknown): AppError {
  if (e instanceof IpcError) return e.appError;
  if (e && typeof e === "object" && typeof (e as AppError).code === "string") return e as AppError;
  return { code: "internal.unknown", detail: e instanceof Error ? e.message : String(e), status: null };
}
