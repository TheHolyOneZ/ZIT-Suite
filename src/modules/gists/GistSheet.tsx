import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Copy,
  ExternalLink,
  Eye,
  History,
  Lock,
  Globe,
  Pencil,
  Save,
  Star,
  StarOff,
  Trash2,
  X,
} from "lucide-react";
import { commands, unwrap, type Gist } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { formatBytes } from "@/modules/home/model";
import type { SheetParams } from "@/core/sheets/store";
import { sheets } from "@/core/sheets/store";
import { useActiveAccount } from "@/core/store/session";
import { toast } from "@/core/store/toasts";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Markdown,
  Panel,
  Plotter,
  RelTime,
  useConfirmClick,
} from "@/ui";
import { dropGist, putGist, useGist, useRevisions } from "./api";
import { useGistsUi } from "./store";
import { CodeBox } from "./CodeBox";
import { DraftsEditor } from "./DraftsEditor";
import { GistComments } from "./GistComments";
import { draftProblem, draftsOf, editsOf, isMarkdown, titleOf, type Draft } from "./model";

const copy = async (text: string, done: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast({ kind: "success", title: done });
  } catch (e) {
    toastError(e);
  }
};


export function GistSheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["gists", "common"]);
  const id = String(params.id);
  const [rev, setRev] = useState<string | null>(null);
  const q = useGist(id, rev);
  const me = useActiveAccount()?.login;
  const [editing, setEditing] = useState(false);
  const [showRevs, setShowRevs] = useState(false);
  const revs = useRevisions(id, showRevs);

  const [starred, setStarred] = useState<boolean>(() => useGistsUi.getState().starred);
  useEffect(() => {
    setEditing(false);
    setRev(null);
  }, [id]);

  if (q.isLoading) return <Plotter />;
  if (q.error || !q.data) return <EmptyState title={errorMessage(q.error)} />;
  const g = q.data;
  const mine = g.owner === me;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-line-strong bg-surface px-6 pt-5 pb-4">
        <div className="flex items-center gap-2">
          {g.public ? (
            <Badge tone="info">
              <Globe size={10} /> {t("visibility.public")}
            </Badge>
          ) : (
            <Badge tone="warn">
              <Lock size={10} /> {t("visibility.secret")}
            </Badge>
          )}
          {!mine && <span className="num text-[11.5px] text-faint">{g.owner}</span>}
          {rev && <Badge tone="idle">{t("oldRevision", { sha: rev.slice(0, 7) })}</Badge>}
        </div>
        <h2 className="mt-1 text-[18px] leading-snug font-semibold">{titleOf(g)}</h2>
        <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-dim">
          <span>{t("files", { count: g.files.length })}</span>
          <span>
            {t("updated")} <RelTime at={g.updated_at} />
          </span>
        </div>
        {!g.public && <p className="mt-2 text-[11.5px] text-faint">{t("secretHint")}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {mine && !rev && !editing && (
            <Button variant="primary" icon={Pencil} onClick={() => setEditing(true)}>
              {t("edit")}
            </Button>
          )}
          <Button icon={Copy} onClick={() => void copy(g.html_url, t("copied"))}>
            {t("copyLink")}
          </Button>
          <Button variant="ghost" icon={History} onClick={() => setShowRevs(!showRevs)}>
            {t("revisions")}
          </Button>
          {!mine && (
            <Button
              variant="ghost"
              icon={starred ? StarOff : Star}
              onClick={async () => {
                const on = !starred;
                try {
                  await unwrap(commands.gistStar(g.id, on));
                  setStarred(on);
                  toast({ kind: "success", title: on ? t("starred") : t("unstarred") });
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              {starred ? t("unstar") : t("star")}
            </Button>
          )}
          <IconButton
            icon={ExternalLink}
            label={t("openOnGitHub")}
            onClick={() => void openUrl(g.html_url)}
          />
          {mine && <DeleteButton g={g} />}
        </div>
      </header>

      <div className="space-y-4 p-4">
        {showRevs && (
          <Panel className="overflow-hidden">
            <div className="border-b border-line px-3 py-2">
              <span className="annot">{t("revisions")}</span>
            </div>
            {revs.isLoading && <Plotter />}
            {(revs.data ?? []).map((r, i) => (
              <button
                key={r.version}
                onClick={() => (setEditing(false), setRev(i === 0 ? null : r.version))}
                className="grid w-full cursor-default grid-cols-[80px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-3 py-1.5 text-left last:border-b-0 hover:bg-surface-2"
              >
                <span className="num text-[11.5px] text-dim">{r.version.slice(0, 7)}</span>
                <span className="text-[11.5px] text-faint">
                  <RelTime at={r.committed_at} />
                  {i === 0 && ` · ${t("current")}`}
                </span>
                <span className="num text-[11px]">
                  <span className="text-ok">+{r.additions}</span>{" "}
                  <span className="text-danger">−{r.deletions}</span>
                </span>
              </button>
            ))}
          </Panel>
        )}
        {editing ? (
          <Editor g={g} onDone={() => setEditing(false)} />
        ) : (
          g.files.map((f) => (
            <FileView
              key={f.filename}
              name={f.filename}
              language={f.language}
              size={f.size}
              content={f.content ?? ""}
              truncated={f.truncated}
              raw={f.raw_url}
            />
          ))
        )}
        {!editing && !rev && <GistComments id={g.id} owner={g.owner} />}
      </div>
    </div>
  );
}

function FileView({
  name,
  language,
  size,
  content,
  truncated,
  raw,
}: {
  name: string;
  language: string | null;
  size: number;
  content: string;
  truncated: boolean;
  raw: string;
}) {
  const { t } = useTranslation("gists");
  const [source, setSource] = useState(false);
  const md = isMarkdown(name);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="num text-[12.5px] font-medium">{name}</span>
        {language && <span className="text-[11px] text-faint">{language}</span>}
        <span className="num text-[11px] text-faint">{formatBytes(size)}</span>
        <span className="flex-1" />
        {md && (
          <IconButton
            icon={source ? Eye : Pencil}
            label={source ? t("editor.preview") : t("source")}
            size={12}
            className="size-7"
            onClick={() => setSource(!source)}
          />
        )}
        <IconButton
          icon={Copy}
          label={t("copyContent")}
          size={12}
          className="size-7"
          onClick={() => void copy(content, t("copied"))}
        />
        <IconButton
          icon={ExternalLink}
          label={t("raw")}
          size={12}
          className="size-7"
          onClick={() => void openUrl(raw)}
        />
      </div>
      {md && !source ? (
        <Panel className="p-4">
          <Markdown source={content} className="text-[12.5px]" />
        </Panel>
      ) : (
        <CodeBox value={content} minRows={1} />
      )}
      {truncated && <p className="text-[11.5px] text-warn">{t("truncated")}</p>}
    </div>
  );
}

function Editor({ g, onDone }: { g: Gist; onDone: () => void }) {
  const { t } = useTranslation(["gists", "common"]);
  const [description, setDescription] = useState(g.description);
  const [drafts, setDrafts] = useState<Draft[]>(() => draftsOf(g));
  const [busy, setBusy] = useState(false);
  const edits = editsOf(drafts);
  const problem = draftProblem(drafts);
  const changed = edits.length > 0 || description !== g.description;
  const save = async () => {
    setBusy(true);
    try {
      const saved = await unwrap(
        commands.gistUpdate(g.id, description !== g.description ? description : null, edits),
      );
      putGist(saved);
      toast({ kind: "success", title: t("saved") });
      onDone();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("descriptionPlaceholder")}
      />
      <DraftsEditor drafts={drafts} onChange={setDrafts} />
      <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
        {problem && <span className="mr-auto text-[11.5px] text-warn">{t(`problem.${problem}`)}</span>}
        {!problem && changed && (
          <span className="mr-auto text-[11.5px] text-faint">
            {t("changes", { count: edits.length + (description !== g.description ? 1 : 0) })}
          </span>
        )}
        <Button variant="ghost" icon={X} onClick={onDone}>
          {t("common:actions.cancel")}
        </Button>
        <Button
          variant="primary"
          icon={Save}
          loading={busy}
          disabled={!changed || !!problem}
          onClick={() => void save()}
        >
          {t("save")}
        </Button>
      </div>
    </div>
  );
}

function DeleteButton({ g }: { g: Gist }) {
  const { t } = useTranslation("gists");
  const del = useConfirmClick(async () => {
    try {
      await unwrap(commands.gistDelete(g.id));
      dropGist(g.id);
      toast({ kind: "success", title: t("deleted") });
      sheets.pop();
    } catch (e) {
      toastError(e);
    }
  });
  return (
    <Button variant="danger" icon={Trash2} onClick={del.onClick}>
      {del.armed ? t("confirmDelete") : t("delete")}
    </Button>
  );
}
