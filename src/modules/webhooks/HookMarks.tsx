import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import type { Delivery } from "@/core/ipc";
import { Mark, type Glyph, type Tone } from "@/ui";
import { eventSummary, type HookState } from "./model";

export const STATE_MARK: Record<HookState, { glyph: Glyph; tone: Tone }> = {
  ok: { glyph: "tick", tone: "ok" },
  failing: { glyph: "cross", tone: "danger" },
  unused: { glyph: "void", tone: "idle" },
  inactive: { glyph: "pause", tone: "idle" },
};

export function StateMark({ state, size = 12 }: { state: HookState; size?: number }) {
  const { t } = useTranslation("webhooks");
  const m = STATE_MARK[state];
  return <Mark glyph={m.glyph} tone={m.tone} size={size} title={t(`states.${state}`)} />;
}


export function StateSpread({ states }: { states: Record<HookState, number> }) {
  return (
    <span className="flex items-center gap-2.5">
      {(["ok", "failing", "unused", "inactive"] as const).map((s) => (
        <span
          key={s}
          className={states[s] ? "flex items-center gap-1" : "flex items-center gap-1 opacity-30"}
        >
          <StateMark state={s} size={11} />
          <span className="num text-[11px] text-dim">{states[s]}</span>
        </span>
      ))}
    </span>
  );
}


export function DeliveryCode({ d }: { d: Delivery }) {
  const ok = d.status_code >= 200 && d.status_code < 300;
  return (
    <span className="flex items-center gap-1.5">
      <Mark glyph={ok ? "tick" : "cross"} tone={ok ? "ok" : "danger"} size={11} />
      <span className={ok ? "num text-[12px] text-ok" : "num text-[12px] text-danger"}>
        {d.status_code || "—"}
      </span>
      {d.redelivery && <RotateCcw size={11} className="text-faint" />}
    </span>
  );
}

export function EventList({ events, max = 2 }: { events: string[]; max?: number }) {
  const { t } = useTranslation("webhooks");
  const s = eventSummary(events, max);
  if (s.all) return <span className="text-[11.5px] text-dim">{t("events.everything")}</span>;
  return (
    <span className="flex min-w-0 items-center gap-1">
      {s.shown.map((e) => (
        <span key={e} className="num truncate rounded-[3px] border border-line px-1 text-[10.5px] text-dim">
          {e}
        </span>
      ))}
      {s.more > 0 && <span className="num text-[10.5px] text-faint">+{s.more}</span>}
    </span>
  );
}
