import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "@/core/store/persist";
import type { Traffic, TrafficDay } from "@/core/ipc";


export type DayLog = Record<string, [number, number]>;
export interface RepoLog {
  v: DayLog;
  c: DayLog;
}
export type TrafficLog = Record<string, RepoLog>;


export const KEEP_DAYS = 400;

const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const shift = (day: string, by: number) => dayOf(new Date(Date.parse(`${day}T00:00:00Z`) + by * 86_400_000));

function mergeDays(into: DayLog, days: TrafficDay[], oldest: string): DayLog {
  const out: DayLog = {};
  for (const [d, v] of Object.entries(into)) if (d >= oldest) out[d] = v;

  for (const d of days) {
    const day = d.day.slice(0, 10);
    if (day < oldest) continue;
    const cur = out[day];
    out[day] = cur ? [Math.max(cur[0], d.count), Math.max(cur[1], d.uniques)] : [d.count, d.uniques];
  }
  return out;
}


export function mergeTraffic(log: TrafficLog, data: Traffic[], today = dayOf(new Date())): TrafficLog {
  const oldest = shift(today, -KEEP_DAYS);
  const out: TrafficLog = { ...log };
  for (const x of data) {
    if (x.error) continue;
    const cur = log[x.repo] ?? { v: {}, c: {} };
    out[x.repo] = { v: mergeDays(cur.v, x.views_daily, oldest), c: mergeDays(cur.c, x.clones_daily, oldest) };
  }
  return out;
}


export function series(log: DayLog | undefined, days: number, today = dayOf(new Date())): number[] {
  return Array.from({ length: days }, (_, i) => log?.[shift(today, i - days + 1)]?.[0] ?? 0);
}


export function sumRange(log: DayLog | undefined, days: number, today = dayOf(new Date())) {
  const from = shift(today, -days + 1);
  let count = 0,
    uniques = 0;
  for (const [d, [c, u]] of Object.entries(log ?? {}))
    if (d >= from && d <= today) {
      count += c;
      uniques += u;
    }
  return { count, uniques };
}


export function firstDay(log: TrafficLog): string | null {
  let first: string | null = null;
  for (const r of Object.values(log))
    for (const d of [...Object.keys(r.v), ...Object.keys(r.c)]) if (!first || d < first) first = d;
  return first;
}

interface TrafficLogState {
  log: TrafficLog;
  merge: (data: Traffic[]) => void;
  clear: () => void;
}


export const useTrafficLog = create<TrafficLogState>()(
  persist(
    (set) => ({
      log: {},
      merge: (data) => set((s) => ({ log: mergeTraffic(s.log, data) })),
      clear: () => set({ log: {} }),
    }),
    { name: "insights-traffic", version: 1, storage: persistStorage, partialize: ({ log }) => ({ log }) },
  ),
);
