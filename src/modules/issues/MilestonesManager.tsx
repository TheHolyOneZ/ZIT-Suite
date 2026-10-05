import { DUE_FMT } from "./dates";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Flag, Pencil, Plus, RotateCcw, Trash2, CheckCheck } from "lucide-react";
import { commands, unwrap, type Milestone, type MilestoneInput } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { formatDate, formatNumber } from "@/core/i18n/format";

import {
  Button,
  EmptyState,
  IconButton,
  Input,
  Mark,
  Meter,
  Panel,
  Plotter,
  Segmented,
  useConfirmClick,
} from "@/ui";
import { RepoPicker } from "@/app/RepoPicker";
import { useMilestones } from "./api";
import { useIssuesPrefs } from "./store";

const blank: MilestoneInput = {
  title: null,
  description: null,
  due_on: null,
  clear_due_on: false,
  state: null,
};

export function MilestonesManager() {
  const { t } = useTranslation(["issues", "common"]);
  const repo = useIssuesPrefs((s) => s.managerRepo);
  const setPrefs = useIssuesPrefs((s) => s.set);
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open");
  const { data = [], isLoading, isError, error } = useMilestones(repo, filter);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-surface px-6 py-3">
        <div className="w-[320px]">
          <RepoPicker value={repo} onChange={(r) => setPrefs({ managerRepo: r })} />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: t("state.open") },
            { value: "closed", label: t("state.closed") },
            { value: "all", label: t("state.all") },
          ]}
        />
        <span className="flex-1" />
        <Button icon={Plus} variant="primary" disabled={!repo} onClick={() => setCreating(true)}>
          {t("milestones.new")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {!repo ? (
          <EmptyState
            icon={<Flag size={20} />}
            title={t("labels.pickRepo")}
            body={t("milestones.pickRepoHint")}
          />
        ) : isLoading ? (
          <Plotter />
        ) : isError ? (
          <EmptyState title={errorMessage(error)} />
        ) : (
          <div className="space-y-3">
            {creating && <MilestoneEditor repo={repo} onDone={() => setCreating(false)} />}
            {data.length === 0 && !creating && (
              <EmptyState icon={<Flag size={20} />} title={t("milestones.none")} />
            )}
            {data.map((m) => (
              <MilestoneRow key={m.number} repo={repo} m={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MilestoneRow({ repo, m }: { repo: string; m: Milestone }) {
  const { t } = useTranslation("issues");
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const total = m.open_issues + m.closed_issues;
  const pct = total ? (m.closed_issues / total) * 100 : 0;
  const overdue = m.state === "open" && m.due_on && Date.parse(m.due_on) < Date.now();
  const refresh = () => qc.invalidateQueries({ queryKey: ["milestones", repo] });
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
    } catch (e) {
      toastError(e);
    }
  };
  const del = useConfirmClick(() => act(() => unwrap(commands.milestonesDelete(repo, m.number))));

  if (editing) return <MilestoneEditor repo={repo} initial={m} onDone={() => setEditing(false)} />;
  return (
    <Panel className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <Mark
            glyph={m.state === "open" ? "open" : "closed"}
            tone={m.state === "open" ? "ok" : "done"}
            size={13}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <span className="text-[14px] font-medium">{m.title}</span>
            {m.due_on && (
              <span
                className={`num flex items-center gap-1 text-[11.5px] ${overdue ? "text-danger" : "text-faint"}`}
              >
                {overdue ? <Mark glyph="warn" tone="danger" size={11} /> : <CalendarClock size={11} />}
                {overdue
                  ? t("milestones.overdue", { date: formatDate(m.due_on, DUE_FMT) })
                  : t("milestones.due", { date: formatDate(m.due_on, DUE_FMT) })}
              </span>
            )}
          </div>
          {m.description && <p className="mt-1 text-[12.5px] text-dim">{m.description}</p>}
          <div className="mt-2 flex items-center gap-3">
            <Meter value={pct} tone={pct === 100 ? "ok" : "accent"} className="h-2 max-w-[360px] flex-1" />
            <span className="num text-[11.5px] text-dim">
              {formatNumber(pct / 100, { style: "percent" })} ·{" "}
              {t("milestones.counts", { open: m.open_issues, closed: m.closed_issues })}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <IconButton icon={Pencil} label={t("labels.edit")} onClick={() => setEditing(true)} />
          {m.state === "open" ? (
            <IconButton
              icon={CheckCheck}
              label={t("milestones.close")}
              onClick={() =>
                act(() => unwrap(commands.milestonesUpdate(repo, m.number, { ...blank, state: "closed" })))
              }
            />
          ) : (
            <IconButton
              icon={RotateCcw}
              label={t("milestones.reopen")}
              onClick={() =>
                act(() => unwrap(commands.milestonesUpdate(repo, m.number, { ...blank, state: "open" })))
              }
            />
          )}
          <button
            onClick={del.onClick}
            title={t("labels.delete")}
            className="flex h-7 items-center gap-1 rounded-[3px] px-1.5 text-faint hover:text-danger cursor-default"
          >
            <Trash2 size={14} />
            {del.armed && <span className="text-[11px] text-danger">?</span>}
          </button>
        </div>
      </div>
    </Panel>
  );
}

function MilestoneEditor({
  repo,
  initial,
  onDone,
}: {
  repo: string;
  initial?: Milestone;
  onDone: () => void;
}) {
  const { t } = useTranslation(["issues", "common"]);
  const qc = useQueryClient();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [due, setDue] = useState(initial?.due_on?.slice(0, 10) ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const input: MilestoneInput = {
      ...blank,
      title: title.trim(),
      description,

      due_on: due ? `${due}T12:00:00Z` : null,
      clear_due_on: !!initial && !due,
    };
    try {
      if (initial) await unwrap(commands.milestonesUpdate(repo, initial.number, input));
      else await unwrap(commands.milestonesCreate(repo, input));
      await qc.invalidateQueries({ queryKey: ["milestones", repo] });
      onDone();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel ticks className="space-y-2 bg-surface-2 p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_170px] gap-2">
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("milestones.title")}
        />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="num" />
      </div>
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("labels.description")}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t("common:actions.cancel")}
        </Button>
        <Button size="sm" variant="primary" loading={busy} disabled={!title.trim()} onClick={submit}>
          {t("common:actions.save")}
        </Button>
      </div>
    </Panel>
  );
}
