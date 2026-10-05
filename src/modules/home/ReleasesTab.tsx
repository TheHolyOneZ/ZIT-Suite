import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FilePlus2,
  Pencil,
  Plus,
  Rocket,
  Tag as TagIcon,
  Trash2,
} from "lucide-react";
import { commands, unwrap, type Release, type Workspace } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { formatNumber } from "@/core/i18n/format";
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
import { formatBytes } from "./model";
import { patchReleases, refreshGh, useReleases, useTags } from "./ghapi";
import { nextVersions } from "./ghmodel";
import { useBranches, useStatus, useSync } from "./api";
import { useWorkspaceActions } from "./actions";
import { ReleaseDialog, type NotUploaded, type ReleaseRequest } from "./ReleaseDialog";


export function ReleasesTab({ ws, repo }: { ws: Workspace; repo: string }) {
  const branches = useBranches(ws.id).data ?? [];
  const status = useStatus(ws.id).data;
  const sync = useSync(ws.id, !!ws.push_repo).data;
  const act = useWorkspaceActions(ws);
  return (
    <ReleasesView
      repo={repo}
      branches={branches.map((b) => b.name)}
      defaultTarget={status?.branch ?? "main"}
      notUploaded={{
        count: sync?.push?.ahead ?? 0,
        busy: act.busy === "upload",
        upload: () => void act.upload(),
      }}
    />
  );
}


export function ReleasesView({
  repo,
  branches,
  defaultTarget,
  notUploaded,
  request,
  onRequestDone,
  header,
}: {
  repo: string;
  branches: string[];
  defaultTarget: string;
  notUploaded?: NotUploaded;
  request?: ReleaseRequest | null;
  onRequestDone?: () => void;
  header?: React.ReactNode;
}) {
  const { t } = useTranslation(["home", "common"]);
  const releases = useReleases(repo);
  const tags = useTags(repo).data ?? [];
  const [own, setReq] = useState<ReleaseRequest | null>(null);
  const req = own ?? request ?? null;
  if (releases.isLoading) return <Plotter />;
  if (releases.error) return <EmptyState title={errorMessage(releases.error)} />;
  const list = releases.data ?? [];
  const downloads = list.reduce((n, r) => n + r.assets.reduce((m, a) => m + a.download_count, 0), 0);
  const latest = list.find((r) => !r.draft && !r.prerelease);
  const tagged = new Set(list.map((r) => r.tag_name));

  return (
    <div className="mx-auto max-w-[1000px] space-y-4 p-4">
      {header}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Stat label={t("releases.count")} value={formatNumber(list.length)} />
        <Stat label={t("releases.latestLabel")} value={latest?.tag_name ?? "—"} mono />
        <Stat label={t("releases.downloads")} value={formatNumber(downloads)} />
        <Stat label={t("releases.tags")} value={formatNumber(tags.length)} />
        <Button
          variant="primary"
          icon={Rocket}
          className="ml-auto"
          onClick={() => setReq({ mode: "create" })}
        >
          {t("releases.new")}
        </Button>
      </div>

      {list.length === 0 ? (
        <Panel className="p-8 text-center">
          <Rocket size={22} className="mx-auto text-accent" />
          <div className="mt-2 text-[14px] font-medium">{t("releases.emptyTitle")}</div>
          <p className="mx-auto mt-1 max-w-[460px] text-[12.5px] text-dim">{t("releases.emptyBody")}</p>
          <Button variant="primary" icon={Rocket} className="mt-3" onClick={() => setReq({ mode: "create" })}>
            {t("releases.first")}
          </Button>
        </Panel>
      ) : (
        list.map((r) => (
          <ReleaseCard
            key={r.id}
            repo={repo}
            r={r}
            latest={latest?.id === r.id}
            onEdit={() => setReq({ mode: "edit", release: r })}
            onFiles={() => setReq({ mode: "files", release: r })}
          />
        ))
      )}

      <TagsPanel
        repo={repo}
        branch={defaultTarget}
        tagged={tagged}
        onRelease={(tag) => setReq({ mode: "create", tag })}
      />
      <ReleaseDialog
        repo={repo}
        req={req}
        branches={branches}
        defaultTarget={defaultTarget}
        notUploaded={notUploaded}
        onClose={() => {
          setReq(null);
          onRequestDone?.();
        }}
      />
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="annot !text-[9.5px]">{label}</div>
      <div className={mono ? "num text-[15px]" : "num text-[17px]"}>{value}</div>
    </div>
  );
}

function ReleaseCard({
  repo,
  r,
  latest,
  onEdit,
  onFiles,
}: {
  repo: string;
  r: Release;
  latest: boolean;
  onEdit: () => void;
  onFiles: () => void;
}) {
  const { t } = useTranslation(["home", "common"]);
  const [open, setOpen] = useState(latest);
  const remove = useConfirmClick(async () => {
    try {
      await unwrap(commands.releaseDelete(repo, r.id, null));
      toast({
        kind: "success",
        title: t("releases.deleted", { tag: r.tag_name }),
        body: t("releases.tagKept"),
      });
      patchReleases(repo, { removeId: r.id });
    } catch (e) {
      toastError(e);
    }
  });
  const removeAll = useConfirmClick(async () => {
    try {
      await unwrap(commands.releaseDelete(repo, r.id, r.tag_name));
      toast({ kind: "success", title: t("releases.deletedWithTag", { tag: r.tag_name }) });
      patchReleases(repo, { removeId: r.id });
    } catch (e) {
      toastError(e);
    }
  });
  const dl = r.assets.reduce((n, a) => n + a.download_count, 0);
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <button
          className="flex min-w-0 flex-1 cursor-default items-center gap-2 text-left"
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <ChevronDown size={14} className="text-faint" />
          ) : (
            <ChevronRight size={14} className="text-faint" />
          )}
          <span className="truncate text-[14px] font-medium">{r.name || r.tag_name}</span>
          <Badge className="num">{r.tag_name}</Badge>
          {latest && <Badge tone="ok">{t("releases.latestBadge")}</Badge>}
          {r.prerelease && <Badge tone="warn">{t("releases.preBadge")}</Badge>}
          {r.draft && <Badge tone="idle">{t("releases.draftBadge")}</Badge>}
        </button>
        <span className="text-[11.5px] text-faint">
          <RelTime at={r.published_at ?? r.created_at} />
        </span>
        {r.assets.length > 0 && (
          <span className="flex items-center gap-1 text-[11.5px] text-dim" title={t("releases.downloads")}>
            <Download size={11} /> {formatNumber(dl)}
          </span>
        )}
        <span className="flex">
          <IconButton
            icon={Pencil}
            label={t("releases.edit")}
            size={13}
            className="size-7"
            onClick={onEdit}
          />
          <IconButton
            icon={FilePlus2}
            label={t("releases.addFiles")}
            size={13}
            className="size-7"
            onClick={onFiles}
          />
          <IconButton
            icon={ExternalLink}
            label={t("actions.openGitHub")}
            size={13}
            className="size-7"
            onClick={() => void openUrl(r.html_url)}
          />
          <IconButton
            icon={Trash2}
            label={remove.armed ? t("releases.confirmDelete") : t("releases.delete")}
            size={13}
            className={remove.armed ? "size-7 text-danger" : "size-7 hover:text-danger"}
            onClick={remove.onClick}
          />
        </span>
      </div>
      {open && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          {r.body?.trim() ? (
            <Markdown source={r.body} className="text-[12.5px]" />
          ) : (
            <p className="text-[12px] text-faint italic">{t("releases.noNotes")}</p>
          )}
          <div>
            <div className="annot mb-1">{t("releases.filesCount", { count: r.assets.length })}</div>
            {r.assets.map((a) => (
              <AssetRow key={a.id} repo={repo} a={a} />
            ))}
            {r.assets.length === 0 && (
              <Button size="sm" variant="ghost" icon={FilePlus2} onClick={onFiles}>
                {t("releases.addFiles")}
              </Button>
            )}
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              className={removeAll.armed ? "text-danger" : "text-faint hover:text-danger"}
              icon={Trash2}
              onClick={removeAll.onClick}
            >
              {removeAll.armed ? t("releases.confirmDeleteWithTag") : t("releases.deleteWithTag")}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

function AssetRow({ repo, a }: { repo: string; a: Release["assets"][number] }) {
  const { t } = useTranslation("home");
  const del = useConfirmClick(async () => {
    try {
      await unwrap(commands.assetDelete(repo, a.id));
      patchReleases(repo, { removeAsset: a.id });
    } catch (e) {
      toastError(e);
    }
  });
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_80px_80px_60px] items-center gap-2 border-b border-line py-1.5 last:border-b-0">
      <button
        className="num min-w-0 cursor-default truncate text-left text-[12.5px] hover:text-accent"
        onClick={() => void openUrl(a.browser_download_url)}
      >
        {a.name}
      </button>
      <span className="num text-right text-[11px] text-faint">{formatBytes(a.size)}</span>
      <span className="num flex items-center justify-end gap-1 text-[11px] text-dim">
        <Download size={10} /> {formatNumber(a.download_count)}
      </span>
      <span className="flex justify-end">
        <IconButton
          icon={Trash2}
          label={del.armed ? t("releases.confirmDelete") : t("releases.deleteFile")}
          size={12}
          className={del.armed ? "size-6 text-danger" : "size-6 hover:text-danger"}
          onClick={del.onClick}
        />
      </span>
    </div>
  );
}

function TagsPanel({
  repo,
  branch,
  tagged,
  onRelease,
}: {
  repo: string;
  branch: string;
  tagged: Set<string>;
  onRelease: (tag: string) => void;
}) {
  const { t } = useTranslation(["home", "common"]);
  const tags = useTags(repo).data ?? [];
  const next = nextVersions(tags);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      await unwrap(commands.tagCreate(repo, name.trim(), branch));
      toast({ kind: "success", title: t("releases.tagCreated", { tag: name.trim(), branch }) });
      setName("");
      await refreshGh(repo, "releases");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <span className="annot flex-1">{t("releases.tagsTitle")}</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value.replace(/\s+/g, "-"))}
          placeholder={next.patch}
          className="num !h-7 w-[140px] text-[12px]"
        />
        <Button
          size="sm"
          icon={Plus}
          loading={busy}
          disabled={!name.trim()}
          onClick={() => void create()}
          title={t("releases.tagOn", { branch })}
        >
          {t("releases.addTag")}
        </Button>
      </div>
      <p className="border-b border-line px-3 py-1.5 text-[11.5px] text-faint">
        {t("releases.tagsHint", { branch })}
      </p>
      {tags.length === 0 && <div className="px-3 py-2.5 text-[12px] text-faint">{t("releases.noTags")}</div>}
      {tags.map((x) => (
        <TagRow
          key={x.name}
          repo={repo}
          name={x.name}
          sha={x.sha}
          released={tagged.has(x.name)}
          onRelease={() => onRelease(x.name)}
        />
      ))}
    </Panel>
  );
}

function TagRow({
  repo,
  name,
  sha,
  released,
  onRelease,
}: {
  repo: string;
  name: string;
  sha: string;
  released: boolean;
  onRelease: () => void;
}) {
  const { t } = useTranslation("home");
  const del = useConfirmClick(async () => {
    try {
      await unwrap(commands.tagDelete(repo, name));
      toast({ kind: "success", title: t("releases.tagDeleted", { tag: name }) });
      await refreshGh(repo, "releases");
    } catch (e) {
      toastError(e);
    }
  });
  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)_80px_110px_32px] items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0 hover:bg-surface-2">
      <TagIcon size={12} className="text-faint" />
      <span className="num truncate text-[12.5px]">{name}</span>
      <button
        className="num cursor-default text-left text-[11px] text-dim hover:text-accent"
        onClick={() => void openUrl(`https://github.com/${repo}/commit/${sha}`)}
      >
        {sha.slice(0, 7)}
      </button>
      {released ? (
        <span className="text-[11px] text-faint">{t("releases.hasRelease")}</span>
      ) : (
        <button
          className="cursor-default text-left text-[11px] text-accent hover:underline"
          onClick={onRelease}
        >
          {t("releases.makeRelease")}
        </button>
      )}
      <IconButton
        icon={Trash2}
        label={del.armed ? t("releases.confirmDelete") : t("releases.deleteTag")}
        size={12}
        className={del.armed ? "size-6 text-danger" : "size-6 hover:text-danger"}
        onClick={del.onClick}
      />
    </div>
  );
}
