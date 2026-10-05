import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, EyeOff, File, Folder, Info } from "lucide-react";
import { commands, unwrap, type TreeEntry, type Workspace, type WorkspaceStatus } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { toast } from "@/core/store/toasts";
import { Badge, Button, Checkbox, Plotter, Segmented } from "@/ui";
import { refreshLocal, useGitignore, useSuggestions, useTree } from "./api";
import { formatBytes, isSensitive, KIND_MARK } from "./model";
import { GitTerm } from "./parts";

type Filter = "all" | "shared" | "notShared";


export function FilesTab({ ws, status }: { ws: Workspace; status: WorkspaceStatus }) {
  const { t } = useTranslation(["home", "common"]);
  const [filter, setFilter] = useState<Filter>("all");
  const changed = useMemo(() => new Map(status.changes.map((c) => [c.path, c.kind])), [status.changes]);

  return (
    <div className="mx-auto max-w-[900px] space-y-4 p-4">
      <p className="flex items-center gap-2 text-[12.5px] text-dim">
        <Info size={13} className="shrink-0 text-info" />
        {t("files.hint")}
        <GitTerm term="gitignore" />
      </p>
      <Suggestions ws={ws} />
      <div className="rounded-[var(--radius)] border border-line bg-surface">
        <div className="flex items-center border-b border-line px-3 py-1.5">
          <Segmented<Filter>
            size="sm"
            value={filter}
            onChange={setFilter}
            options={(["all", "shared", "notShared"] as const).map((f) => ({
              value: f,
              label: t(`files.filter.${f}`),
            }))}
          />
        </div>
        <Dir ws={ws} dir="" depth={0} filter={filter} changed={changed} parentIgnored={false} />
      </div>
      <GitignoreEditor ws={ws} />
    </div>
  );
}

function Suggestions({ ws }: { ws: Workspace }) {
  const { t } = useTranslation("home");
  const { data = [] } = useSuggestions(ws.id);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => setPicked(new Set(data.map((s) => s.pattern))), [data]);
  if (!data.length) return null;
  const apply = async () => {
    try {
      const n = await unwrap(commands.wsIgnoreAdd(ws.id, [...picked]));
      toast({ kind: "success", title: t("files.added", { count: n }) });
      refreshLocal(ws.id);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] p-3">
      <div className="text-[13px] font-medium">{t("files.suggestTitle")}</div>
      <p className="text-[12px] text-dim">{t("files.suggestBody")}</p>
      <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-4 gap-y-1">
        {data.map((s) => (
          <Checkbox
            key={s.pattern}
            checked={picked.has(s.pattern)}
            onChange={(on) =>
              setPicked((cur) => {
                const n = new Set(cur);
                if (on) n.add(s.pattern);
                else n.delete(s.pattern);
                return n;
              })
            }
            label={
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="num text-[12px]">{s.pattern}</span>
                <Badge tone={s.reason === "secrets" ? "danger" : undefined}>
                  {t(`suggest.${s.reason as "deps"}`)}
                </Badge>
              </span>
            }
          />
        ))}
      </div>
      <Button
        size="sm"
        variant="primary"
        icon={EyeOff}
        className="mt-2"
        disabled={!picked.size}
        onClick={() => void apply()}
      >
        {t("files.dontShareThese")}
      </Button>
    </div>
  );
}

function Dir({
  ws,
  dir,
  depth,
  filter,
  changed,
  parentIgnored,
}: {
  ws: Workspace;
  dir: string;
  depth: number;
  filter: Filter;
  changed: Map<string, string>;
  parentIgnored: boolean;
}) {
  const { t } = useTranslation("home");
  const { data, isLoading } = useTree(ws.id, dir);
  if (isLoading)
    return (
      <div className="py-2" style={{ paddingLeft: 12 + depth * 18 }}>
        <Plotter />
      </div>
    );
  const rows = (data ?? []).filter(
    (e) => filter === "all" || (filter === "shared" ? !e.ignored : e.ignored) || e.dir,
  );
  if (!rows.length)
    return (
      <div className="py-1.5 text-[11.5px] text-faint" style={{ paddingLeft: 34 + depth * 18 }}>
        {t("files.emptyDir")}
      </div>
    );
  return (
    <>
      {rows.map((e) => (
        <Row
          key={e.path}
          ws={ws}
          e={e}
          depth={depth}
          filter={filter}
          changed={changed}
          parentIgnored={parentIgnored}
        />
      ))}
    </>
  );
}

function Row({
  ws,
  e,
  depth,
  filter,
  changed,
  parentIgnored,
}: {
  ws: Workspace;
  e: TreeEntry;
  depth: number;
  filter: Filter;
  changed: Map<string, string>;
  parentIgnored: boolean;
}) {
  const { t } = useTranslation("home");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const kind = changed.get(e.path) as keyof typeof KIND_MARK | undefined;
  const ignored = e.ignored || parentIgnored;

  const toggle = async (shared: boolean) => {
    setBusy(true);
    try {
      const r = await unwrap(commands.wsSetShared(ws.id, e.path, e.dir, shared));
      if (r.blocked_by) toast({ kind: "warning", title: t("files.blocked", { parent: r.blocked_by }) });
      else if (r.untracked) toast({ kind: "info", title: t("files.untracked", { path: e.path }) });
      refreshLocal(ws.id);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-2 border-b border-line py-1 pr-3 hover:bg-surface-2",
          ignored && "text-faint",
        )}
        style={{ paddingLeft: 10 + depth * 18 }}
      >
        <button
          className={cn(
            "flex size-4 shrink-0 cursor-default items-center justify-center text-faint",
            !e.dir && "invisible",
          )}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <span className={busy || parentIgnored ? "pointer-events-none opacity-50" : undefined}>
          <Checkbox checked={!ignored} onChange={(v) => void toggle(v)} />
        </span>
        {e.dir ? (
          <Folder size={13} className={ignored ? "text-faint" : "text-info"} />
        ) : (
          <File size={13} className="text-faint" />
        )}
        <button
          className="num min-w-0 flex-1 cursor-default truncate text-left text-[12.5px]"
          onClick={() => e.dir && setOpen(!open)}
          title={e.path}
        >
          {e.name}
        </button>
        {kind && (
          <span
            className="num text-[12px] font-semibold"
            style={{ color: `var(--${KIND_MARK[kind].tone})` }}
            title={t(`changes.kinds.${kind}`)}
          >
            {KIND_MARK[kind].sign}
          </span>
        )}
        {!e.dir && isSensitive(e.path) && !ignored && <Badge tone="danger">{t("changes.sensitive")}</Badge>}
        {ignored ? (
          <span className="text-[10.5px]">{t("files.notShared")}</span>
        ) : (
          e.tracked && <span className="text-[10.5px] text-ok">{t("files.onGitHub")}</span>
        )}
        <span className="num w-[60px] shrink-0 text-right text-[10.5px] text-faint">
          {e.dir ? "" : formatBytes(e.size)}
        </span>
      </div>
      {e.dir && open && (
        <Dir
          ws={ws}
          dir={e.path}
          depth={depth + 1}
          filter={filter}
          changed={changed}
          parentIgnored={ignored}
        />
      )}
    </>
  );
}

function GitignoreEditor({ ws }: { ws: Workspace }) {
  const { t } = useTranslation("home");
  const [open, setOpen] = useState(false);
  const { data } = useGitignore(ws.id, open);
  const [text, setText] = useState("");
  useEffect(() => {
    if (data !== undefined) setText(data);
  }, [data]);
  const save = async () => {
    try {
      await unwrap(commands.wsGitignoreSave(ws.id, text));
      toast({ kind: "success", title: t("files.ignoreSaved") });
      refreshLocal(ws.id);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <details
      className="rounded-[var(--radius)] border border-line bg-surface"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-default px-3 py-2 text-[12.5px] text-dim">{t("files.advanced")}</summary>
      <div className="space-y-2 border-t border-line p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          spellCheck={false}
          className="num w-full resize-y rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2.5 py-2 text-[12px] outline-none focus:border-accent"
        />
        <div className="flex justify-end">
          <Button size="sm" variant="primary" disabled={text === data} onClick={() => void save()}>
            {t("files.saveIgnore")}
          </Button>
        </div>
      </div>
    </details>
  );
}
