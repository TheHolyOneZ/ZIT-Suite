import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, ChevronDown, ChevronRight, Eye, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { commands, unwrap, type RunRecord, type Schedule } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { useSession } from "@/core/store/session";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  IconButton,
  Mark,
  PageHeader,
  Panel,
  Plotter,
  RelTime,
  useConfirmClick,
  type Glyph,
  type Tone,
} from "@/ui";
import { describeAction } from "@/modules/queue/describe";
import { useSchedules } from "./api";
import { describeCadence, type Target } from "./model";
import { openReview } from "./Runner";
import { ScheduleDialog } from "./ScheduleDialog";
import { useScheduler } from "./store";

const OUTCOME: Record<string, { glyph: Glyph; tone: Tone }> = {
  queued: { glyph: "tick", tone: "ok" },
  review: { glyph: "info", tone: "accent" },
  nothing: { glyph: "equal", tone: "idle" },
  skipped: { glyph: "skip", tone: "idle" },
  failed: { glyph: "cross", tone: "danger" },
};


export function SchedulerPage() {
  const { t } = useTranslation(["scheduler", "common"]);
  const q = useSchedules();
  const reviews = useScheduler((s) => s.reviews);
  const active = useSession((s) => s.session?.active);
  const [editing, setEditing] = useState<Schedule | "new" | null>(null);
  const list = q.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={<span>{t("subtitle")}</span>}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>
            {t("new")}
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {q.isLoading ? (
          <Plotter />
        ) : (
          <div className="mx-auto max-w-[1000px] space-y-4 p-4">
            {reviews.length > 0 && (
              <Panel className="overflow-hidden border-[color-mix(in_srgb,var(--accent)_40%,transparent)]">
                <div className="annot border-b border-line px-3 py-2">
                  {t("reviews.title", { count: reviews.length })}
                </div>
                {reviews.map((r) => (
                  <div
                    key={r.scheduleId}
                    className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0"
                  >
                    <Mark glyph="info" tone="accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{r.name}</span>
                      <span className="text-[11px] text-faint">
                        {t("reviews.found", { count: r.items.length })} · <RelTime at={r.at} />
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => useScheduler.getState().dropReview(r.scheduleId)}
                    >
                      {t("reviews.dismiss")}
                    </Button>
                    <Button size="sm" variant="primary" icon={Eye} onClick={() => openReview(r.scheduleId)}>
                      {t("reviews.open")}
                    </Button>
                  </div>
                ))}
              </Panel>
            )}

            {list.length === 0 ? (
              <EmptyState
                icon={<CalendarClock size={20} />}
                title={t("empty.title")}
                body={t("empty.body")}
                action={
                  <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>
                    {t("new")}
                  </Button>
                }
              />
            ) : (
              list.map((s) => (
                <Card
                  key={s.id}
                  s={s}
                  otherAccount={!!active && s.account_id !== active}
                  onEdit={() => setEditing(s)}
                />
              ))
            )}
            <p className="text-[11.5px] text-faint">{t("howItRuns")}</p>
          </div>
        )}
      </div>
      {editing && (
        <ScheduleDialog schedule={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function targetText(target: Target, t: (k: string, o?: Record<string, unknown>) => string) {
  switch (target.kind) {
    case "view":
      return t("targetText.view", { name: target.name });
    case "cleanup":
      return t(`repos:cleanup.presets.${target.preset}.name`);
    case "tag":
      return t("targetText.tag", { tag: target.tag });
    case "repos":
      return t("targetText.repos", { count: target.repos.length });
  }
}

function Card({ s, otherAccount, onEdit }: { s: Schedule; otherAccount: boolean; onEdit: () => void }) {
  const { t } = useTranslation(["scheduler", "repos"]);
  const [open, setOpen] = useState(false);
  const last = s.history?.[0];
  const tt = t as unknown as (k: string, o?: Record<string, unknown>) => string;
  const del = useConfirmClick(() => void commands.scheduleDelete(s.id));
  const toggle = async (on: boolean) => {
    try {
      await unwrap(commands.scheduleSetEnabled(s.id, on));
    } catch (e) {
      toastError(e);
    }
  };
  const runNow = async () => {
    try {
      const d = await unwrap(commands.scheduleRunNow(s.id));
      useScheduler.setState({ manual: d });
    } catch (e) {
      toastError(e);
    }
  };
  const a = describeAction(s.action);
  return (
    <Panel className={cn("overflow-hidden", !s.enabled && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
        <Checkbox checked={s.enabled} onChange={(on) => void toggle(on)} label={null} />
        <button className="min-w-0 flex-1 cursor-default text-left" onClick={() => setOpen(!open)}>
          <span className="flex items-center gap-2">
            {open ? (
              <ChevronDown size={13} className="text-faint" />
            ) : (
              <ChevronRight size={13} className="text-faint" />
            )}
            <span className="truncate text-[13.5px] font-medium">{s.name}</span>
            <Badge tone={s.mode === "auto" ? "accent" : "idle"}>{t(`mode.${s.mode as "auto"}`)}</Badge>
            {otherAccount && <Badge tone="warn">{t("otherAccount")}</Badge>}
          </span>
          <span className="block truncate pl-5 text-[11.5px] text-dim">
            {a.label}
            {a.detail && ` · ${a.detail}`} · {targetText(s.target as Target, tt)} ·{" "}
            {describeCadence(s.cadence, tt)}
          </span>
        </button>
        <span className="text-right text-[11px] text-faint">
          {s.enabled && s.next_run ? (
            <>
              {t("next")} <RelTime at={s.next_run} />
            </>
          ) : (
            t("paused")
          )}
          {last && (
            <span className="flex items-center justify-end gap-1">
              <Mark
                glyph={OUTCOME[last.outcome]?.glyph ?? "pending"}
                tone={OUTCOME[last.outcome]?.tone ?? "idle"}
                size={9}
              />
              <RelTime at={last.at} />
            </span>
          )}
        </span>
        <span className="flex">
          <IconButton
            icon={Play}
            label={t("runNow")}
            size={13}
            className="size-7"
            onClick={() => void runNow()}
          />
          <IconButton icon={Pencil} label={t("editLabel")} size={13} className="size-7" onClick={onEdit} />
          <IconButton
            icon={Trash2}
            label={del.armed ? t("confirmDelete") : t("delete")}
            size={13}
            className={del.armed ? "size-7 text-danger" : "size-7 hover:text-danger"}
            onClick={del.onClick}
          />
        </span>
      </div>
      {open && (
        <div className="border-t border-line">
          {!s.history?.length && <div className="px-3 py-3 text-[12px] text-faint">{t("history.none")}</div>}
          {(s.history ?? []).map((r, i) => (
            <HistoryRow key={i} r={r} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function HistoryRow({ r }: { r: RunRecord }) {
  const { t } = useTranslation("scheduler");
  const o = OUTCOME[r.outcome] ?? { glyph: "pending" as Glyph, tone: "idle" as Tone };
  return (
    <div className="grid grid-cols-[16px_150px_minmax(0,1fr)] items-center gap-3 border-b border-line px-3 py-1.5 text-[12px] last:border-b-0">
      <Mark glyph={o.glyph} tone={o.tone} size={10} />
      <span className="text-[11.5px] text-faint">
        <RelTime at={r.at} />
        {r.trigger !== "schedule" && <span> · {t(`trigger.${r.trigger as "manual"}`)}</span>}
      </span>
      <span className="min-w-0 truncate text-dim">
        {t(`outcome.${r.outcome as "queued"}`, { count: r.queued || r.ready })}
        <span className="num text-faint">
          {" "}
          · {t("history.counts", { matched: r.matched, ready: r.ready, noop: r.noop, blocked: r.blocked })}
        </span>
        {r.note && (
          <span className="text-warn">
            {" "}
            · {t(`note.${r.note as "other_account"}`, { defaultValue: r.note })}
          </span>
        )}
      </span>
    </div>
  );
}
