import { useEffect, useRef } from "react";
import { commands, events, unwrap, type DueRun, type NewQueueItem, type RunRecord } from "@/core/ipc";
import { tDynamic } from "@/core/i18n";
import { errorMessage } from "@/core/errors";
import { useSession } from "@/core/store/session";
import { useSettings } from "@/core/store/settings";
import { toast } from "@/core/store/toasts";
import { notifyDesktop } from "@/modules/queue/QueueBridge";
import { useQueue } from "@/modules/queue/store";
import { useRepoRows } from "@/modules/repos/api";
import type { RepoRow } from "@/modules/repos/filters";
import { mustAsk, resolveTarget, type Target } from "./model";
import { useScheduler } from "./store";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));


export function SchedulerRunner() {
  const { rows, query } = useRepoRows();
  const rowsRef = useRef<{ rows: RepoRow[]; ready: boolean }>({ rows: [], ready: false });
  rowsRef.current = { rows, ready: query.isSuccess };
  const busy = useRef(false);

  useEffect(() => {
    const runAll = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const due = await commands.schedulesClaimDue();
        for (const d of due) await runOne(d, rowsRef);
      } finally {
        busy.current = false;
      }
    };
    void runAll();
    const un = events.scheduleNudge.listen(() => void runAll());
    const unManual = useScheduler.subscribe((s, prev) => {
      if (s.manual && s.manual !== prev.manual) {
        const d = s.manual;
        useScheduler.setState({ manual: null });
        void runOne(d, rowsRef);
      }
    });
    return () => {
      void un.then((f) => f());
      unManual();
    };
  }, []);
  return null;
}

async function runOne(d: DueRun, rowsRef: { current: { rows: RepoRow[]; ready: boolean } }) {
  const s = d.schedule;
  const rec: RunRecord = {
    at: new Date().toISOString(),
    trigger: d.trigger,
    matched: 0,
    ready: 0,
    noop: 0,
    blocked: 0,
    queued: 0,
    outcome: "nothing",
    note: null,
  };
  const done = async (patch: Partial<RunRecord>) => {
    try {
      await unwrap(commands.scheduleRecord(s.id, { ...rec, ...patch }));
    } catch {
    }
  };
  try {
    if (useSession.getState().session?.active !== s.account_id)
      return void (await done({ outcome: "skipped", note: "other_account" }));

    for (let i = 0; i < 60 && !rowsRef.current.ready; i++) await wait(1000);
    if (!rowsRef.current.ready) return void (await done({ outcome: "failed", note: "no_repos" }));

    const repos = resolveTarget(s.target as Target, rowsRef.current.rows);
    rec.matched = repos.length;
    if (!repos.length) return void (await done({ outcome: "nothing" }));
    const items: NewQueueItem[] = repos.map((repo) => ({ repo, action: s.action }));
    const results = await unwrap(commands.queueDryRun(items));
    rec.ready = results.filter((r) => r.outcome === "ready").length;
    rec.noop = results.filter((r) => r.outcome === "noop").length;
    rec.blocked = results.filter((r) => r.outcome === "blocked").length;
    const ready = results
      .filter((r) => r.outcome === "ready")
      .map((r) => ({ repo: r.repo, action: r.action }));
    if (!ready.length) return void (await done({ outcome: "nothing" }));

    const t = (k: string, o?: Record<string, unknown>) => tDynamic(`scheduler:${k}`, o);
    if (s.mode === "auto" && !mustAsk(s.action)) {
      await unwrap(commands.queueSubmit(ready, useSettings.getState().graceSeconds));
      await done({ outcome: "queued", queued: ready.length });
      toast({ kind: "info", title: t("ran.queued", { name: s.name, count: ready.length }) });
      void notifyDesktop(
        t("ran.title", { name: s.name }),
        t("ran.queued", { name: s.name, count: ready.length }),
      );
    } else {
      useScheduler.getState().addReview({ scheduleId: s.id, name: s.name, items: ready, at: rec.at });
      await done({ outcome: "review" });
      toast({
        kind: "info",
        title: t("ran.review", { name: s.name, count: ready.length }),
        body: t("ran.reviewBody"),
      });
      void notifyDesktop(
        t("ran.title", { name: s.name }),
        t("ran.review", { name: s.name, count: ready.length }),
      );
    }
  } catch (e) {
    await done({ outcome: "failed", note: errorMessage(e) });
  }
}


export function openReview(id: string) {
  const r = useScheduler.getState().reviews.find((x) => x.scheduleId === id);
  if (!r) return;
  useQueue.getState().requestRun(r.items);
  useScheduler.getState().dropReview(id);
}
