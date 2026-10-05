import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Share2, Sparkles, Tags, Trash2 } from "lucide-react";
import { commands, unwrap, type Label, type NewQueueItem } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { useRepoList } from "@/core/data/repos";

import {
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  IconButton,
  Input,
  Panel,
  Plotter,
  useConfirmClick,
} from "@/ui";
import { RepoPicker } from "@/app/RepoPicker";
import { useQueue } from "@/modules/queue/store";
import { useLabels } from "./api";
import { LabelChip } from "./LabelChip";
import { STARTER_LABELS } from "./labelPresets";
import { useIssuesPrefs } from "./store";

const randomColor = () =>
  Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");

export function LabelsManager() {
  const { t } = useTranslation(["issues", "common"]);
  const repo = useIssuesPrefs((s) => s.managerRepo);
  const setPrefs = useIssuesPrefs((s) => s.set);
  const { data = [], isLoading, isError, error } = useLabels(repo);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [sync, setSync] = useState<{ source: "repo" | "starter" } | null>(null);
  const list = useMemo(
    () => data.filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-surface px-6 py-3">
        <div className="w-[320px]">
          <RepoPicker value={repo} onChange={(r) => setPrefs({ managerRepo: r })} />
        </div>
        <div className="w-[220px]">
          <Input
            icon={Search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("labels.filter")}
          />
        </div>
        <span className="flex-1" />
        <Button icon={Sparkles} onClick={() => setSync({ source: "starter" })}>
          {t("labels.starter")}
        </Button>
        <Button
          icon={Share2}
          disabled={!repo || data.length === 0}
          onClick={() => setSync({ source: "repo" })}
        >
          {t("labels.syncTo")}
        </Button>
        <Button icon={Plus} variant="primary" disabled={!repo} onClick={() => setCreating(true)}>
          {t("labels.new")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {!repo ? (
          <EmptyState
            icon={<Tags size={20} />}
            title={t("labels.pickRepo")}
            body={t("labels.pickRepoHint")}
          />
        ) : isLoading ? (
          <Plotter />
        ) : isError ? (
          <EmptyState title={errorMessage(error)} />
        ) : (
          <Panel ticks>
            {creating && <LabelEditor repo={repo} onDone={() => setCreating(false)} />}
            <div className="annot grid grid-cols-[220px_minmax(0,1fr)_90px_70px] gap-3 border-b border-line px-4 py-2">
              <span>{t("labels.name")}</span>
              <span>{t("labels.description")}</span>
              <span>{t("labels.color")}</span>
              <span />
            </div>
            {list.map((l) => (
              <LabelRow key={l.name} repo={repo} label={l} />
            ))}
            {list.length === 0 && (
              <div className="px-4 py-6 text-center text-[12px] text-faint">{t("labels.none")}</div>
            )}
          </Panel>
        )}
      </div>
      {sync && (
        <LabelSyncDialog
          source={sync.source === "starter" ? STARTER_LABELS : data}
          fromRepo={sync.source === "repo" ? repo : null}
          onClose={() => setSync(null)}
        />
      )}
    </div>
  );
}

function LabelRow({ repo, label }: { repo: string; label: Label }) {
  const { t } = useTranslation("issues");
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const del = useConfirmClick(async () => {
    try {
      await unwrap(commands.labelsDelete(repo, label.name));
      qc.setQueryData<Label[]>(["labels", repo], (l) => l?.filter((x) => x.name !== label.name));
    } catch (e) {
      toastError(e);
    }
  });
  if (editing) return <LabelEditor repo={repo} initial={label} onDone={() => setEditing(false)} />;
  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)_90px_70px] items-center gap-3 border-b border-line px-4 py-2.5 text-[12.5px] last:border-0">
      <span>
        <LabelChip label={label} />
      </span>
      <span className="truncate text-dim">{label.description || <span className="text-faint">—</span>}</span>
      <span className="num text-[11.5px] text-faint uppercase">#{label.color}</span>
      <span className="flex justify-end gap-0.5">
        <IconButton icon={Pencil} label={t("labels.edit")} onClick={() => setEditing(true)} />
        <button
          onClick={del.onClick}
          title={t("labels.delete")}
          className="flex h-7 items-center gap-1 rounded-[3px] px-1.5 text-faint hover:text-danger cursor-default"
        >
          <Trash2 size={14} />
          {del.armed && <span className="text-[11px] text-danger">?</span>}
        </button>
      </span>
    </div>
  );
}

function LabelEditor({ repo, initial, onDone }: { repo: string; initial?: Label; onDone: () => void }) {
  const { t } = useTranslation(["issues", "common"]);
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? randomColor());
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const label: Label = {
      name: name.trim(),
      color: color.replace("#", ""),
      description: description || null,
    };
    try {
      if (initial) await unwrap(commands.labelsUpdate(repo, initial.name, label));
      else await unwrap(commands.labelsCreate(repo, label));
      await qc.invalidateQueries({ queryKey: ["labels", repo] });
      onDone();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => (e.preventDefault(), submit())}
      className="grid grid-cols-[220px_minmax(0,1fr)_90px_auto] items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5"
    >
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("labels.name")}
        className="h-7 text-[12px]"
      />
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("labels.description")}
        className="h-7 text-[12px]"
      />
      <label className="flex h-7 items-center gap-1.5 rounded-[var(--radius)] border border-line-strong bg-surface px-1.5">
        <input
          type="color"
          value={`#${color}`}
          onChange={(e) => setColor(e.target.value.slice(1))}
          className="size-4 cursor-default border-0 bg-transparent p-0"
        />
        <span className="num text-[11px] uppercase">{color}</span>
      </label>
      <span className="flex gap-1.5">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!name.trim()}>
          {t("common:actions.save")}
        </Button>
      </span>
    </form>
  );
}


function LabelSyncDialog({
  source,
  fromRepo,
  onClose,
}: {
  source: Label[];
  fromRepo: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation(["issues", "common"]);
  const { data: repos = [] } = useRepoList();
  const [labels, setLabels] = useState<Set<string>>(new Set(source.map((l) => l.name)));
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [prune, setPrune] = useState(false);
  const [busy, setBusy] = useState(false);
  const managerRepo = useIssuesPrefs((s) => s.managerRepo);

  useEffect(() => {

    if (!fromRepo && managerRepo) setTargets(new Set([managerRepo]));
  }, [fromRepo, managerRepo]);

  const candidates = useMemo(
    () =>
      repos.filter(
        (r) =>
          !r.archived &&
          (r.permissions?.push ?? false) &&
          r.full_name !== fromRepo &&
          (!q || r.full_name.toLowerCase().includes(q.toLowerCase())),
      ),
    [repos, q, fromRepo],
  );
  const toggle = (s: Set<string>, v: string) => {
    const n = new Set(s);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  const submit = async () => {
    setBusy(true);
    try {
      const chosen = source.filter((l) => labels.has(l.name));
      const items: NewQueueItem[] = [];
      for (const repo of targets) {
        for (const l of chosen)
          items.push({
            repo,
            action: { kind: "label_upsert", name: l.name, color: l.color, description: l.description },
          });
        if (prune) {
          const existing = await unwrap(commands.labelsList(repo));
          const keep = new Set(chosen.map((l) => l.name.toLowerCase()));
          for (const e of existing)
            if (!keep.has(e.name.toLowerCase()))
              items.push({ repo, action: { kind: "label_delete", name: e.name } });
        }
      }
      onClose();
      useQueue.getState().requestRun(items);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      kicker={fromRepo ? t("sync.kickerFrom", { repo: fromRepo }) : t("sync.kickerStarter")}
      title={t("sync.title")}
      width={760}
      footer={
        <>
          <span className="num mr-auto text-[11.5px] text-faint">
            {t("sync.summary", { labels: labels.size, repos: targets.size })}
          </span>
          <Button variant="ghost" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={Share2}
            loading={busy}
            disabled={labels.size === 0 || targets.size === 0}
            onClick={submit}
          >
            {t("sync.review")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="annot">{t("sync.labels")}</span>
            <Checkbox
              checked={labels.size === source.length}
              indeterminate={labels.size > 0 && labels.size < source.length}
              onChange={(all) => setLabels(new Set(all ? source.map((l) => l.name) : []))}
            />
          </div>
          <div className="max-h-[340px] space-y-0.5 overflow-y-auto rounded-[var(--radius)] border border-line p-1">
            {source.map((l) => (
              <button
                key={l.name}
                type="button"
                onClick={() => setLabels(toggle(labels, l.name))}
                className="flex h-8 w-full items-center gap-2 rounded-[3px] px-2 hover:bg-surface-2 cursor-default"
              >
                <Checkbox checked={labels.has(l.name)} onChange={() => setLabels(toggle(labels, l.name))} />
                <LabelChip label={l} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="annot">{t("sync.targets")}</span>
            <div className="w-[200px]">
              <Input
                icon={Search}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("common:pickers.searchRepos")}
                className="h-7 text-[12px]"
              />
            </div>
          </div>
          <div className="max-h-[340px] space-y-0.5 overflow-y-auto rounded-[var(--radius)] border border-line p-1">
            {candidates.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setTargets(toggle(targets, r.full_name))}
                className="flex h-8 w-full items-center gap-2 rounded-[3px] px-2 text-left hover:bg-surface-2 cursor-default"
              >
                <Checkbox
                  checked={targets.has(r.full_name)}
                  onChange={() => setTargets(toggle(targets, r.full_name))}
                />
                <span className="num truncate text-[12px]">{r.full_name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-[var(--radius)] border border-line bg-surface-2 p-3">
        <Checkbox checked={prune} onChange={setPrune} label={t("sync.prune")} />
        <p className="mt-1 pl-5.5 text-[11.5px] text-faint">{t("sync.pruneHint")}</p>
      </div>
    </Dialog>
  );
}
