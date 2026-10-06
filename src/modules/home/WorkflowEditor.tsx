import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { parse } from "yaml";
import { CheckCircle2, FileUp, Save, Trash2, TriangleAlert } from "lucide-react";
import { commands, unwrap } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { toast } from "@/core/store/toasts";
import { Button, Dialog, Input, Plotter, useConfirmClick } from "@/ui";
import { CodeBox } from "@/modules/gists/CodeBox";
import { checkWorkflow } from "./ghmodel";
import { WORKFLOW_TEMPLATES } from "./workflowTemplates";


export type WorkflowEdit = { mode: "new" } | { mode: "edit"; path: string; repo: string };


export interface WorkflowStore {

  load: (path: string) => Promise<{ text: string; copy: boolean }>;

  save: (name: string, content: string, oldPath: string | null) => Promise<string>;
  remove: (path: string) => Promise<void>;

  text: {
    note: string;
    add: string;
    save: string;
    saved: (path: string, added: boolean) => string;
    savedBody?: string;
    deleted: (path: string) => string;
    deletedBody?: string;
  };
}


export function folderStore(
  wsId: string,
  repo: string | null,
  t: (k: string, o?: Record<string, unknown>) => string,
): WorkflowStore {
  return {
    load: async (path) => {
      const local = await unwrap(commands.wsReadWorkflow(wsId, path));
      if (local != null) return { text: local, copy: false };
      if (!repo) throw new Error("no repo");
      return { text: await unwrap(commands.actionsSource(repo, path, null)), copy: true };
    },
    save: (name, content, oldPath) => unwrap(commands.wsSaveWorkflow(wsId, name, content, oldPath)),
    remove: async (path) => void (await unwrap(commands.wsDeleteWorkflow(wsId, path))),
    text: {
      note: t("actionsTab.addNote"),
      add: t("actionsTab.addToFolder"),
      save: t("wf.save"),
      saved: (path, added) => (added ? t("actionsTab.added", { path }) : t("wf.saved", { path })),
      savedBody: t("actionsTab.addedBody"),
      deleted: (path) => t("wf.deleted", { path }),
      deletedBody: t("wf.deletedBody"),
    },
  };
}


const fileOf = (path: string) => path.split(/[\\/]/).pop() ?? path;


export function WorkflowEditor({
  store,
  req,
  taken,
  onClose,
  onSaved,
}: {
  store: WorkflowStore;
  req: WorkflowEdit;
  taken: string[];
  onClose: () => void;
  onSaved: (path: string) => void;
}) {
  const { t } = useTranslation(["home", "common"]);
  const [tpl, setTpl] = useState<string | null>(req.mode === "new" ? "blank" : null);
  const [file, setFile] = useState(req.mode === "new" ? WORKFLOW_TEMPLATES[0].file : fileOf(req.path));
  const [content, setContent] = useState(req.mode === "new" ? WORKFLOW_TEMPLATES[0].content : "");
  const [original, setOriginal] = useState<string | null>(req.mode === "new" ? null : "");
  const [loading, setLoading] = useState(req.mode === "edit");
  const [busy, setBusy] = useState(false);
  const [fromGitHub, setFromGitHub] = useState(false);

  useEffect(() => {
    if (req.mode !== "edit") return;
    void (async () => {
      try {
        const { text, copy } = await store.load(req.path);
        setFromGitHub(copy);
        setContent(text);
        setOriginal(copy ? null : text);
      } catch (e) {
        toastError(e);
        onClose();
      } finally {
        setLoading(false);
      }
    })();


    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const check = useMemo(() => checkWorkflow(content, parse), [content]);
  const name = file.trim();
  const nameOk = /^[A-Za-z0-9][A-Za-z0-9._-]*\.ya?ml$/.test(name);
  const ownName = req.mode === "edit" ? fileOf(req.path) : null;
  const clash = name !== ownName && taken.includes(name);
  const changed = original === null || content !== original || (ownName !== null && name !== ownName);

  const pickTemplate = (id: string) => {
    const x = WORKFLOW_TEMPLATES.find((w) => w.id === id)!;
    setTpl(id);
    setContent(x.content);
    setFile(x.file);
  };
  const fromDisk = async () => {
    const p = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "YAML", extensions: ["yml", "yaml"] }],
    });
    if (typeof p !== "string") return;
    try {
      setContent(await unwrap(commands.readTextFile(p)));
      setFile(fileOf(p).replace(/\s+/g, "-"));
      setTpl(null);
    } catch (e) {
      toastError(e);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      const path = await store.save(name, content, req.mode === "edit" && !fromGitHub ? req.path : null);
      toast({
        kind: "success",
        title: store.text.saved(path, req.mode === "new"),
        body: store.text.savedBody,
      });
      onSaved(path);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const del = useConfirmClick(async () => {
    if (req.mode !== "edit") return;
    try {
      await store.remove(req.path);
      toast({ kind: "success", title: store.text.deleted(req.path), body: store.text.deletedBody });
      onSaved(req.path);
    } catch (e) {
      toastError(e);
    }
  });

  const p = check.problem;
  return (
    <Dialog
      open
      onClose={onClose}
      width={980}
      kicker={t("tabs.actions")}
      title={req.mode === "edit" ? t("wf.editTitle", { name: ownName }) : t("actionsTab.addTitle")}
      footer={
        <>
          {req.mode === "edit" && !fromGitHub && (
            <Button
              variant="ghost"
              icon={Trash2}
              className={cn("mr-auto", del.armed ? "text-danger" : "text-faint hover:text-danger")}
              onClick={del.onClick}
            >
              {del.armed ? t("wf.confirmDelete") : t("wf.delete")}
            </Button>
          )}
          <span
            className={cn("text-[11.5px] text-faint", !(req.mode === "edit" && !fromGitHub) && "mr-auto")}
          >
            {store.text.note}
          </span>
          <Button variant="ghost" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={Save}
            loading={busy}
            disabled={loading || !nameOk || clash || !changed || !content.trim()}
            onClick={() => void save()}
            title={p ? t("wf.saveAnyway") : undefined}
          >
            {req.mode === "edit" ? store.text.save : store.text.add}
          </Button>
        </>
      }
    >
      {loading ? (
        <Plotter />
      ) : (
        <div className={cn("grid gap-4", req.mode === "new" && "md:grid-cols-[230px_minmax(0,1fr)]")}>
          {req.mode === "new" && (
            <div className="space-y-1">
              {WORKFLOW_TEMPLATES.map((w) => (
                <button
                  key={w.id}
                  onClick={() => pickTemplate(w.id)}
                  className={cn(
                    "block w-full cursor-default rounded-[3px] border px-2.5 py-2 text-left",
                    tpl === w.id ? "border-accent bg-surface-2" : "border-transparent hover:bg-surface-2",
                  )}
                >
                  <span className="block text-[13px]">{t(`templates.${w.id}.name`)}</span>
                  <span className="block text-[11.5px] text-faint">{t(`templates.${w.id}.what`)}</span>
                </button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                icon={FileUp}
                className="mt-1 w-full"
                onClick={() => void fromDisk()}
              >
                {t("wf.fromDisk")}
              </Button>
            </div>
          )}
          <div className="min-w-0 space-y-2">
            {fromGitHub && <p className="text-[11.5px] text-info">{t("wf.fromGitHub")}</p>}
            <div className="flex items-center gap-2">
              <span className="num shrink-0 text-[12px] text-faint">.github/workflows/</span>
              <div className="min-w-0 flex-1">
                <Input
                  value={file}
                  onChange={(e) => setFile(e.target.value.replace(/\s+/g, "-"))}
                  className="num"
                />
              </div>
            </div>
            {!nameOk && <p className="text-[11.5px] text-warn">{t("wf.badName")}</p>}
            {clash && <p className="text-[11.5px] text-warn">{t("actionsTab.clash")}</p>}
            <CodeBox value={content} onChange={setContent} minRows={18} className="max-h-[440px]" />
            <div
              className={cn(
                "flex items-start gap-2 rounded-[var(--radius)] border px-2.5 py-1.5 text-[12px]",
                p
                  ? "border-[color-mix(in_srgb,var(--warn)_40%,transparent)] text-warn"
                  : "border-line text-ok",
              )}
            >
              {p ? (
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              )}
              <span className="min-w-0">
                {p ? (
                  <>
                    {t(`wf.problem.${p.kind}`, { job: p.detail ?? "" })}
                    {p.line != null && <span className="num"> · {t("wf.line", { line: p.line })}</span>}
                    {p.kind === "yaml" && p.detail && (
                      <span className="num block truncate text-[11px] text-faint">{p.detail}</span>
                    )}
                  </>
                ) : (
                  <>
                    {t("wf.valid", { count: check.jobs })}
                    <span className="text-faint">
                      {" "}
                      · {t("wf.triggers", { list: check.triggers.join(", ") })}
                    </span>
                    {check.manual && <span className="text-faint"> · {t("wf.manual")}</span>}
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
