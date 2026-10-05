import { toAppError } from "../ipc";


export function isUncertain(e: unknown): boolean {
  const code = toAppError(e).code;
  return code === "network.timeout" || code === "network.failed";
}

const norm = (s: string) => s.replace(/\r\n/g, "\n").trim();


export const sameBody = (a: string, b: string) => norm(a) === norm(b);


export async function createReconciled<T extends { id: number }>(
  send: () => Promise<T>,
  list: () => Promise<T[]>,
  matches: (item: T) => boolean,
  before: Iterable<number>,
): Promise<T> {
  const known = new Set(before);
  try {
    return await send();
  } catch (e) {
    if (!isUncertain(e)) throw e;
    const items = await list().catch(() => [] as T[]);
    const hit = items.filter((i) => !known.has(i.id) && matches(i)).sort((a, b) => b.id - a.id)[0];
    if (hit) return hit;
    throw e;
  }
}
