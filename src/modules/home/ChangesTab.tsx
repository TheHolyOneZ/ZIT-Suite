import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCheck,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Save,
  ShieldAlert,
  Undo2,
  Upload,
} from "lucide-react";
import { commands, unwrap, type FileChange, type Workspace, type WorkspaceStatus } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { formatRelative } from "@/core/i18n/format";
import { combo } from "@/core/platform";
import { toast } from "@/core/store/toasts";
import { Badge, Button, Checkbox, Kbd, useConfirmClick } from "@/ui";
import { useWorkspaceActions } from "./actions";
import { refreshLocal, useStatus, useSync } from "./api";
import { ParkButton, ParkedList, UndoLastButton, WorkDiffView } from "./WorkTools";
import { formatBytes, isSensitive, KIND_MARK, suggestMessage } from "./model";
import { GitTerm } from "./parts";


export function ChangesTab({ ws, status }: { ws: Workspace; status: WorkspaceStatus }) {
  const { t } = useTranslation(["home", "common"]);
  const act = useWorkspaceActions(ws);

  const stamp = useStatus(ws.id).dataUpdatedAt;

  const sync = useSync(ws.id, !!ws.push_repo).data;
  const canUpload = !!ws.push_repo && !sync?.push?.missing;

  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);
  const changes = status.changes;
  const selected = useMemo(() => changes.filter((c) => !unticked.has(c.path)), [changes, unticked]);
  const suggested = suggestMessage(selected);

  useEffect(() => {
    if (!touched) setMessage(suggested);
  }, [suggested, touched]);
  const risky = selected.filter((c) => isSensitive(c.path) && c.kind !== "deleted");

  const toggle = (p: string, on: boolean) =>
    setUnticked((s) => {
      const n = new Set(s);
      if (on) n.delete(p);
      else n.add(p);
      return n;
    });
  const commit = async (upload: boolean) => {
    if (!message.trim() || !selected.length) return;
    const all = selected.length === changes.length;
    const ok = await act.save(message, all ? null : selected.map((c) => c.path), upload);
    if (ok) {
      setTouched(false);
      setUnticked(new Set());
    }
  };

  if (!changes.length)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
        <CheckCheck size={28} className="text-ok" />
        <div className="text-[15px] font-medium">{t("changes.empty")}</div>
        <p className="max-w-[420px] text-[12.5px] text-dim">{t("changes.emptyHint")}</p>
        {status.last_commit && (
          <p className="mt-2 text-[11.5px] text-faint">
            {t("changes.lastSaved", {
              summary: status.last_commit.summary,
              when: formatRelative(status.last_commit.time),
            })}
          </p>
        )}
        {status.last_commit && (
          <UndoLastButton
            ws={ws}
            onUndone={(m) => {
              setMessage(m);
              setTouched(true);
            }}
          />
        )}
        <div className="mt-4 w-full max-w-[640px] text-left">
          <ParkedList ws={ws} />
        </div>
      </div>
    );

  return (
    <>
      <div className="flex items-center gap-3 border-b border-line px-4 py-2">
        <Checkbox
          checked={selected.length === changes.length}
          indeterminate={selected.length > 0 && selected.length < changes.length}
          onChange={(on) => setUnticked(on ? new Set() : new Set(changes.map((c) => c.path)))}
          label={<span className="text-[12px]">{t("changes.selectAll")}</span>}
        />
        <span className="num text-[11.5px] text-faint">
          {t("changes.selected", { count: selected.length, total: changes.length })}
        </span>
        <span className="flex-1" />
        <ParkButton ws={ws} message={message} />
      </div>
      <ParkedList ws={ws} />
      {risky.length > 0 && (
        <div className="flex items-start gap-2 border-b border-line bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-4 py-2 text-[12px] text-danger">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          {t("changes.secretsWarn")}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {changes.map((c) => (
          <ChangeRow
            key={c.path}
            ws={ws}
            c={c}
            on={!unticked.has(c.path)}
            onToggle={(v) => toggle(c.path, v)}
            stamp={stamp}
          />
        ))}
      </div>
      <div className="space-y-2 border-t border-line-strong bg-surface p-3">
        <div className="flex items-center justify-between">
          <span className="annot">{t("changes.message")}</span>
          <Kbd>{combo("Enter")}</Kbd>
        </div>
        <textarea
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setTouched(true);
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              void commit(false);
            }
          }}
          rows={2}
          placeholder={t("changes.messagePlaceholder")}
          className="w-full resize-y rounded-[var(--radius)] border border-line-strong bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent"
        />
        <div className="flex justify-end gap-2">
          <Button
            icon={Save}
            loading={act.busy === "save"}
            disabled={!message.trim() || !selected.length}
            onClick={() => void commit(false)}
          >
            {t("actions.save")}
            <GitTerm term="commit" />
          </Button>
          {canUpload && (
            <Button
              variant="primary"
              icon={Upload}
              loading={act.busy === "save"}
              disabled={!message.trim() || !selected.length}
              onClick={() => void commit(true)}
            >
              {t("actions.saveUpload")}
              <GitTerm term="push" />
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function ChangeRow({
  ws,
  c,
  on,
  onToggle,
  stamp,
}: {
  ws: Workspace;
  c: FileChange;
  on: boolean;
  onToggle: (v: boolean) => void;
  stamp: number;
}) {
  const { t } = useTranslation("home");
  const [open, setOpen] = useState(false);
  const mark = KIND_MARK[c.kind];
  const slash = c.path.lastIndexOf("/");
  const sensitive = isSensitive(c.path) && c.kind !== "deleted";
  const undo = useConfirmClick(async () => {
    try {
      await unwrap(commands.wsDiscard(ws.id, [c.path]));
      toast({ kind: "success", title: t("changes.discarded") });
      refreshLocal(ws.id);
    } catch (e) {
      toastError(e);
    }
  });
  const dontShare = async () => {
    try {
      const r = await unwrap(commands.wsSetShared(ws.id, c.path, false, false));
      if (r.untracked) toast({ kind: "info", title: t("files.untracked", { path: c.path }) });
      refreshLocal(ws.id);
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-2.5 border-b border-line px-4 py-1.5 hover:bg-surface-2",
          !on && "opacity-55",
        )}
      >
        <Checkbox checked={on} onChange={onToggle} />
        <span
          className="num w-3 text-center text-[13px] font-semibold"
          style={{ color: `var(--${mark.tone})` }}
          title={t(`changes.kinds.${c.kind}`)}
        >
          {mark.sign}
        </span>
        <button
          className="num flex min-w-0 flex-1 cursor-default items-center gap-1 truncate text-left text-[12.5px] hover:text-accent"
          title={open ? t("diff.hide") : t("diff.show")}
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <ChevronDown size={12} className="shrink-0 text-faint" />
          ) : (
            <ChevronRight size={12} className="shrink-0 text-faint" />
          )}
          <span className="truncate">
            {slash > 0 && <span className="text-faint">{c.path.slice(0, slash + 1)}</span>}
            <span>{c.path.slice(slash + 1)}</span>
            {c.old_path && <span className="text-faint"> ← {c.old_path}</span>}
          </span>
        </button>
        {sensitive && (
          <>
            <Badge tone="danger">{t("changes.sensitive")}</Badge>
            <Button
              size="sm"
              variant="ghost"
              icon={EyeOff}
              className="h-6 px-1.5 text-[11px]"
              onClick={() => void dontShare()}
            >
              {t("changes.dontShare")}
            </Button>
          </>
        )}
        <span className="num w-[60px] shrink-0 text-right text-[10.5px] text-faint">
          {c.kind === "deleted" ? "" : formatBytes(c.size)}
        </span>
        <span className="text-[10.5px] text-faint">{t(`changes.kinds.${c.kind}`)}</span>
        <button
          onClick={undo.onClick}
          title={t("changes.discard")}
          className={cn(
            "flex h-6 items-center gap-1 px-1 text-faint opacity-0 group-hover:opacity-100 hover:text-danger cursor-default",
            undo.armed && "text-danger opacity-100",
          )}
        >
          <Undo2 size={13} />
          {undo.armed && <span className="text-[10.5px]">?</span>}
        </button>
      </div>
      {open && <WorkDiffView ws={ws} path={c.path} stamp={`${c.kind}:${c.size}:${stamp}`} />}
    </>
  );
}
