import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Trash2, Undo2 } from "lucide-react";
import {
  commands,
  unwrap,
  type CommitInfo,
  type ConflictFile,
  type Pick,
  type Source,
  type Workspace,
} from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { formatRelative } from "@/core/i18n/format";
import { queryClient } from "@/core/query";
import { toast } from "@/core/store/toasts";
import { Badge, Button, Dialog, IconButton, Plotter, Segmented, useConfirmClick } from "@/ui";
import { refreshAll, refreshLocal, useWorkspaces } from "./api";
import { useHomeUi } from "./store";
import { GitTerm } from "./parts";

const parkedKey = (id: string) => ["home", "parked", id] as const;

export function WorkDiffView({ ws, path, stamp }: { ws: Workspace; path: string; stamp: string }) {
  const { t } = useTranslation("home");
  const q = useQuery({
    queryKey: ["home", "diff", ws.id, path, stamp],
    queryFn: () => unwrap(commands.wsDiff(ws.id, path)),
    staleTime: 2000,
  });
  if (q.isLoading) return <Plotter />;
  if (q.error) return <div className="px-4 py-2 text-[12px] text-danger">{errorMessage(q.error)}</div>;
  const d = q.data!;
  if (d.binary) return <div className="px-4 py-2 text-[12px] text-faint">{t("diff.binary")}</div>;
  if (!d.lines.length) return <div className="px-4 py-2 text-[12px] text-faint">{t("diff.none")}</div>;
  return (
    <div className="max-h-[420px] overflow-auto border-b border-line bg-surface-2/40 py-1">
      <table className="num w-full border-collapse text-[11.5px] leading-[1.55]">
        <tbody>
          {d.lines.map((l, i) =>
            l.kind === "hunk" ? (
              <tr key={i} className="text-info">
                <td colSpan={3} className="px-3 pt-1.5 pb-0.5 text-[10.5px] opacity-80">
                  {l.text}
                </td>
              </tr>
            ) : (
              <tr
                key={i}
                className={cn(
                  l.kind === "add" && "bg-[color-mix(in_srgb,var(--ok)_12%,transparent)]",
                  l.kind === "remove" && "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]",
                )}
              >
                <td className="w-10 pr-1 text-right text-faint select-none">{l.old ?? ""}</td>
                <td className="w-10 pr-2 text-right text-faint select-none">{l.new ?? ""}</td>
                <td className="pr-3 whitespace-pre">
                  <span
                    className={cn(
                      "inline-block w-3 select-none",
                      l.kind === "add" ? "text-ok" : l.kind === "remove" ? "text-danger" : "text-faint",
                    )}
                  >
                    {l.kind === "add" ? "+" : l.kind === "remove" ? "−" : " "}
                  </span>
                  {l.text}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      {d.truncated && <div className="px-3 py-1 text-[11px] text-warn">{t("diff.truncated")}</div>}
    </div>
  );
}

export function ParkButton({ ws, message }: { ws: Workspace; message: string }) {
  const { t } = useTranslation("home");
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={Archive}
      loading={busy}
      title={t("park.hint")}
      onClick={async () => {
        setBusy(true);
        try {
          await unwrap(commands.wsPark(ws.id, message));
          toast({ kind: "success", title: t("park.done"), body: t("park.doneBody") });
          refreshLocal(ws.id);
          void queryClient.invalidateQueries({ queryKey: parkedKey(ws.id) });
        } catch (e) {
          toastError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      {t("park.button")}
      <GitTerm term="stash" />
    </Button>
  );
}

export function ParkedList({ ws }: { ws: Workspace }) {
  const { t } = useTranslation("home");
  const q = useQuery({
    queryKey: parkedKey(ws.id),
    queryFn: () => unwrap(commands.wsParked(ws.id)),
    staleTime: 5000,
  });
  const list = q.data ?? [];
  if (!list.length) return null;
  const done = () => {
    refreshLocal(ws.id);
    void queryClient.invalidateQueries({ queryKey: parkedKey(ws.id) });
  };
  return (
    <div className="border-b border-line bg-surface">
      <div className="annot px-4 pt-2 pb-1">{t("park.title", { count: list.length })}</div>
      {list.map((p) => (
        <ParkedRow
          key={`${p.index}:${p.time}`}
          ws={ws}
          index={p.index}
          message={p.message}
          branch={p.branch}
          time={p.time}
          onDone={done}
        />
      ))}
    </div>
  );
}

function ParkedRow({
  ws,
  index,
  message,
  branch,
  time,
  onDone,
}: {
  ws: Workspace;
  index: number;
  message: string;
  branch: string | null;
  time: string;
  onDone: () => void;
}) {
  const { t } = useTranslation("home");
  const [busy, setBusy] = useState(false);
  const drop = useConfirmClick(async () => {
    try {
      await unwrap(commands.wsDropParked(ws.id, index));
      onDone();
    } catch (e) {
      toastError(e);
    }
  });
  return (
    <div className="group flex items-center gap-2.5 px-4 py-1.5 hover:bg-surface-2">
      <Archive size={13} className="shrink-0 text-faint" />
      <span className="min-w-0 flex-1 truncate text-[12.5px]">{message || t("park.unnamed")}</span>
      {branch && <Badge>{branch}</Badge>}
      <span className="text-[11px] text-faint">{time && formatRelative(time)}</span>
      <Button
        size="sm"
        icon={ArchiveRestore}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await unwrap(commands.wsUnpark(ws.id, index));
            toast({ kind: "success", title: t("park.restored") });
            onDone();
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("park.restore")}
      </Button>
      <IconButton
        icon={Trash2}
        size={12}
        label={drop.armed ? t("park.confirmDrop") : t("park.drop")}
        className={drop.armed ? "size-6 text-danger" : "size-6 opacity-0 group-hover:opacity-100"}
        onClick={drop.onClick}
      />
    </div>
  );
}

export function UndoFromButton({ ws, c, count }: { ws: Workspace; c: CommitInfo; count: number }) {
  const { t } = useTranslation("home");
  const undo = useConfirmClick(async () => {
    try {
      const undone = await unwrap(commands.wsUndoSince(ws.id, c.sha));
      toast({
        kind: "success",
        title: t("undo.manyDone", { count: undone.length }),
        body: t("undo.manyDoneBody"),
      });
      refreshLocal(ws.id);
    } catch (e) {
      toastError(e);
    }
  });
  return (
    <Button
      size="sm"
      variant={undo.armed ? "danger" : "ghost"}
      icon={Undo2}
      className={
        undo.armed ? "h-6 px-2 text-[11px]" : "h-6 px-2 text-[11px] opacity-0 group-hover:opacity-100"
      }
      onClick={undo.onClick}
      title={t("undo.fromHint", { count })}
    >
      {undo.armed ? t("undo.fromConfirm", { count }) : t("undo.from")}
    </Button>
  );
}

export function UndoLastButton({ ws, onUndone }: { ws: Workspace; onUndone?: (message: string) => void }) {
  const { t } = useTranslation("home");
  const undo = useConfirmClick(async () => {
    try {
      const c = await unwrap(commands.wsUndoLast(ws.id));
      toast({
        kind: "success",
        title: t("undo.done", { summary: c.summary }),
        body: onUndone ? t("undo.doneBody") : t("undo.doneBodyPlain"),
      });
      refreshLocal(ws.id);
      onUndone?.(c.message.trim());
    } catch (e) {
      toastError(e);
    }
  });
  return (
    <Button
      size="sm"
      variant={undo.armed ? "danger" : "ghost"}
      icon={Undo2}
      onClick={undo.onClick}
      title={t("undo.hint")}
    >
      {undo.armed ? t("undo.confirm") : t("undo.button")}
      <GitTerm term="reset" />
    </Button>
  );
}

export function ConflictDialog({
  ws,
  source,
  branch,
  onClose,
}: {
  ws: Workspace;
  source: Source;
  branch: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("home");
  const q = useQuery({
    queryKey: ["home", "conflicts", ws.id, source, branch],
    queryFn: () => unwrap(commands.wsConflicts(ws.id, source, branch)),
    staleTime: 0,
    gcTime: 0,
  });
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [busy, setBusy] = useState(false);
  const files = q.data ?? [];
  const all = (p: Pick) => setPicks(Object.fromEntries(files.map((f) => [f.path, p])));
  const ready = files.length > 0 && files.every((f) => picks[f.path]);
  const apply = async () => {
    setBusy(true);
    try {
      await unwrap(commands.wsResolve(ws.id, source, branch, Object.entries(picks)));
      toast({ kind: "success", title: t("conflicts.done", { count: files.length }) });
      refreshAll(ws.id);
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const side = (f: ConflictFile, p: Pick) =>
    p === "mine"
      ? f.mine
        ? t("conflicts.mine")
        : t("conflicts.mineDeleted")
      : f.theirs
        ? t("conflicts.theirs")
        : t("conflicts.theirsDeleted");
  return (
    <Dialog
      open
      onClose={onClose}
      kicker={t("conflicts.kicker")}
      title={t("conflicts.title")}
      width={640}
      footer={
        <>
          <span className="flex-1 text-[11.5px] text-faint">{t("conflicts.footer")}</span>
          <Button onClick={onClose}>{t("conflicts.cancel")}</Button>
          <Button variant="primary" loading={busy} disabled={!ready} onClick={() => void apply()}>
            {t("conflicts.apply")}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[12.5px] text-dim">{t("conflicts.intro")}</p>
      {q.isLoading ? (
        <Plotter />
      ) : q.error ? (
        <div className="text-[12px] text-danger">{errorMessage(q.error)}</div>
      ) : (
        <>
          <div className="mb-2 flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => all("mine")}>
              {t("conflicts.allMine")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => all("theirs")}>
              {t("conflicts.allTheirs")}
            </Button>
          </div>
          <div className="max-h-[360px] overflow-y-auto rounded-[var(--radius)] border border-line">
            {files.map((f) => (
              <div
                key={f.path}
                className="flex items-center gap-3 border-b border-line px-3 py-1.5 last:border-b-0"
              >
                <span className="num min-w-0 flex-1 truncate text-[12.5px]" title={f.path}>
                  {f.path}
                </span>
                <Segmented<Pick>
                  size="sm"
                  value={picks[f.path] ?? ("" as Pick)}
                  onChange={(p) => setPicks({ ...picks, [f.path]: p })}
                  options={(["mine", "theirs"] as const).map((p) => ({ value: p, label: side(f, p) }))}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </Dialog>
  );
}

export function ConflictHost() {
  const c = useHomeUi((s) => s.conflict);
  const set = useHomeUi((s) => s.set);
  const ws = useWorkspaces().data?.find((w) => w.id === c?.id);
  return c && ws ? (
    <ConflictDialog ws={ws} source={c.source} branch={c.branch} onClose={() => set({ conflict: null })} />
  ) : null;
}
