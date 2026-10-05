import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { CircleSlash, ListChecks, Pause, Play, RotateCcw, SkipForward, Trash2, X } from "lucide-react";
import { commands, type ItemStatus, type QueueItem } from "@/core/ipc";
import { errorMessage } from "@/core/errors";
import { useSession } from "@/core/store/session";
import { useSettings } from "@/core/store/settings";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Mark,
  PageHeader,
  Panel,
  type Glyph,
  type Tone,
  RelTime,
} from "@/ui";
import { describeAction } from "./describe";
import { isDestructive, useQueue } from "./store";

export const statusGlyph: Record<ItemStatus, Glyph> = {
  pending: "pending",
  running: "running",
  done: "tick",
  failed: "cross",
  skipped: "skip",
  cancelled: "slash",
};

export const phaseGlyph = {
  idle: "pending",
  grace: "hourglass",
  running: "running",
  paused: "pause",
} as const;

export const statusTone: Record<ItemStatus, Tone> = {
  pending: "idle",
  running: "accent",
  done: "ok",
  failed: "danger",
  skipped: "idle",
  cancelled: "idle",
};

export function QueuePage() {
  const { t } = useTranslation("queue");
  const { items, phase, grace_remaining } = useQueue((s) => s.snapshot);
  const grace = useSettings((s) => s.graceSeconds);
  const count = (st: ItemStatus) => items.filter((i) => i.status === st).length;
  const pending = count("pending");
  const failed = count("failed") + count("cancelled");
  const finished = items.filter((i) => !["pending", "running"].includes(i.status)).length;
  const done = count("done");
  const total = items.length;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={
          <>
            <span className="flex items-center gap-1.5">
              <Mark
                glyph={phaseGlyph[phase]}
                tone={phase === "running" ? "accent" : phase === "idle" ? "idle" : "warn"}
              />
              {t(`phase.${phase}`)}
            </span>
            <span className="num">{t("meta", { done, total })}</span>
          </>
        }
        actions={
          <>
            {failed > 0 && (
              <Button icon={RotateCcw} onClick={() => commands.queueRetryFailed()}>
                {t("controls.retry")}
              </Button>
            )}
            {finished > 0 && (
              <Button icon={ListChecks} variant="ghost" onClick={() => commands.queueClearFinished()}>
                {t("controls.clearFinished")}
              </Button>
            )}
            {(phase === "running" || phase === "grace") && (
              <Button icon={CircleSlash} variant="danger" onClick={() => commands.queueCancel()}>
                {t("controls.cancel")}
              </Button>
            )}
            {phase === "running" && (
              <Button icon={Pause} onClick={() => commands.queuePause()}>
                {t("controls.pause")}
              </Button>
            )}
            {(phase === "idle" || phase === "paused") && pending > 0 && (
              <Button
                icon={Play}
                variant="primary"
                onClick={() => commands.queueStart(phase === "paused" ? 0 : grace)}
              >
                {phase === "paused" ? t("controls.resume") : t("controls.start")}
              </Button>
            )}
          </>
        }
      />

      <AnimatePresence>
        {phase === "grace" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-4 border-b border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)] px-6 py-3">
              <span className="num text-[26px] font-semibold text-warn">T−{grace_remaining}</span>
              <span className="flex-1 text-[13px]">{t("grace.body", { count: pending })}</span>
              <Button variant="danger" icon={X} onClick={() => commands.queueCancel()}>
                {t("grace.abort")}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {items.length === 0 ? (
          <EmptyState icon={<ListChecks size={20} />} title={t("empty.title")} body={t("empty.body")} />
        ) : (
          <Panel ticks>
            <div className="annot grid grid-cols-[24px_minmax(0,1fr)_150px_120px_100px_64px] gap-3 border-b border-line px-4 py-2">
              <span />
              <span>{t("columns.repo")}</span>
              <span>{t("columns.action")}</span>
              <span>{t("columns.status")}</span>
              <span>{t("columns.when")}</span>
              <span />
            </div>
            {items.map((it, i) => (
              <QueueRow key={it.id} item={it} index={i + 1} />
            ))}
          </Panel>
        )}
      </div>
    </div>
  );
}

function QueueRow({ item, index }: { item: QueueItem; index: number }) {
  const { t } = useTranslation("queue");
  const accounts = useSession((s) => s.session?.accounts ?? []);
  const active = useSession((s) => s.session?.active);
  const { label, detail } = describeAction(item.action);
  const other = item.account_id !== active ? accounts.find((a) => a.id === item.account_id)?.login : null;
  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)_150px_120px_100px_64px] items-center gap-3 border-b border-line px-4 py-2.5 text-[12.5px] last:border-0">
      <span className="num text-[10.5px] text-faint">{String(index).padStart(2, "0")}</span>
      <div className="min-w-0">
        {detail && <div className="num truncate">{detail}</div>}
        <div className={`num truncate ${detail ? "text-[11.5px] text-faint" : ""}`}>{item.repo}</div>
        {other && <div className="text-[11px] text-faint">{t("viaAccount", { login: other })}</div>}
        {item.error && (
          <div className="truncate text-[11.5px] text-danger" title={item.error.detail ?? undefined}>
            {errorMessage(item.error)}
          </div>
        )}
      </div>
      <span>
        <Badge tone={isDestructive(item.action) ? "danger" : "info"} mono>
          {label}
        </Badge>
      </span>
      <span className="flex items-center gap-2">
        <Mark glyph={statusGlyph[item.status]} tone={statusTone[item.status]} />
        {t(`status.${item.status}`)}
      </span>
      <span className="num text-[11px] text-faint">
        <RelTime at={item.finished_at ?? item.created_at} />
      </span>
      <span className="flex justify-end gap-0.5">
        {item.status === "pending" && (
          <IconButton
            icon={SkipForward}
            label={t("controls.skip")}
            onClick={() => commands.queueSkip(item.id)}
          />
        )}
        {item.status !== "running" && (
          <IconButton
            icon={Trash2}
            label={t("controls.remove")}
            onClick={() => commands.queueRemove(item.id)}
          />
        )}
      </span>
    </div>
  );
}
