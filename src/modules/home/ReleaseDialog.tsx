import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { FilePlus2, Paperclip, Rocket, Sparkles, Upload, X } from "lucide-react";
import { commands, events, unwrap, type Release, type ReleaseInput } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { toast } from "@/core/store/toasts";
import { Button, Checkbox, Dialog, Input, Label, MarkdownEditor, Meter, Select } from "@/ui";
import { patchReleases, refreshGh, useTags, writeNotes } from "./ghapi";
import { nextVersions } from "./ghmodel";

export type ReleaseRequest =
  { mode: "create"; tag?: string } | { mode: "edit"; release: Release } | { mode: "files"; release: Release };

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;


export interface NotUploaded {
  count: number;
  busy: boolean;
  upload: () => void;
}

export function ReleaseDialog({
  repo,
  req,
  branches,
  defaultTarget,
  notUploaded: pending,
  onClose,
}: {
  repo: string;
  req: ReleaseRequest | null;
  branches: string[];
  defaultTarget: string | null;
  notUploaded?: NotUploaded;
  onClose: () => void;
}) {
  const { t } = useTranslation(["home", "common"]);
  const tags = useTags(repo).data ?? [];
  const [form, setForm] = useState<ReleaseInput>({
    tag_name: "",
    target: null,
    name: "",
    body: "",
    draft: false,
    prerelease: false,
    make_latest: true,
  });
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | "notes" | "save">(null);
  const [progress, setProgress] = useState<{
    name: string;
    index: number;
    count: number;
    pct: number;
  } | null>(null);
  const next = nextVersions(tags);

  useEffect(() => {
    if (!req) return;
    setFiles([]);
    setProgress(null);
    if (req.mode === "create") {
      setForm({
        tag_name: req.tag ?? next.minor,
        target: defaultTarget,
        name: "",
        body: "",
        draft: false,
        prerelease: false,
        make_latest: true,
      });
    } else {
      const r = req.release;
      setForm({
        tag_name: r.tag_name,
        target: r.target_commitish,
        name: r.name ?? "",
        body: r.body ?? "",
        draft: r.draft,
        prerelease: r.prerelease,
        make_latest: true,
      });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  useEffect(() => {
    const un = events.releaseUploadProgress.listen(({ payload: p }) =>
      setProgress({
        name: p.name,
        index: p.index,
        count: p.count,
        pct: p.total ? (p.sent / p.total) * 100 : 100,
      }),
    );
    return () => void un.then((f) => f());
  }, []);

  if (!req) return null;
  const set = (p: Partial<ReleaseInput>) => setForm({ ...form, ...p });
  const existing = tags.find((x) => x.name === form.tag_name.trim());
  const notUploaded = pending?.count ?? 0;
  const filesOnly = req.mode === "files";

  const pick = async () => {
    const picked = await open({ multiple: true, directory: false });
    if (!picked) return;
    const list = Array.isArray(picked) ? picked : [picked];
    setFiles((cur) => [...cur, ...list.filter((p) => !cur.includes(p))]);
  };
  const genNotes = async () => {
    setBusy("notes");
    try {
      const n = await writeNotes(
        repo,
        form.tag_name.trim(),
        form.target ?? defaultTarget,
        next.latest !== form.tag_name.trim() ? next.latest : null,
        {
          features: t("releases.notesGroups.features"),
          fixes: t("releases.notesGroups.fixes"),
          other: t("releases.notesGroups.other"),
        },
      );
      set({
        body: form.body.trim() ? `${form.body.trim()}\n\n${n.body}` : n.body,
        name: form.name || n.name,
      });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };


  const upload = async (release: Release): Promise<Release["assets"]> => {
    if (!files.length) return [];
    const r = await unwrap(commands.releaseUpload(repo, release.id, files));
    for (const [name, e] of r.failed)
      toast({ kind: "error", title: t("releases.uploadFailed", { name }), body: errorMessage(e) });
    return r.uploaded;
  };

  const submit = async () => {
    setBusy("save");
    try {

      const withFiles = (r: Release, added: Release["assets"]) => ({
        ...r,
        assets: [...r.assets.filter((a) => !added.some((x) => x.name === a.name)), ...added],
      });
      if (req.mode === "files") {
        const added = await upload(req.release);
        patchReleases(repo, { upsert: withFiles(req.release, added) });
        if (added.length)
          toast({ kind: "success", title: t("releases.filesAdded", { count: added.length }) });
      } else if (req.mode === "edit") {
        const saved = await unwrap(commands.releaseUpdate(repo, req.release.id, form));
        patchReleases(repo, { upsert: withFiles(saved, await upload(saved)) });
        toast({ kind: "success", title: t("releases.updated", { tag: form.tag_name }) });
      } else {
        const wantDraft = form.draft;
        let rel = await unwrap(
          commands.releaseCreate(repo, { ...form, draft: wantDraft || files.length > 0 }),
        );
        const added = await upload(rel);
        const ok = added.length === files.length;
        if (files.length && !wantDraft) {
          if (ok) rel = await unwrap(commands.releaseUpdate(repo, rel.id, { ...form, draft: false }));
          else toast({ kind: "warning", title: t("releases.keptDraft") });
        }
        patchReleases(repo, { upsert: withFiles(rel, added) });
        toast({
          kind: "success",
          title:
            wantDraft || !ok
              ? t("releases.draftSaved", { tag: form.tag_name })
              : t("releases.published", { tag: form.tag_name }),
        });
      }
      void refreshGh(repo, "releases").catch(() => undefined);
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  return (
    <Dialog
      open
      onClose={busy === "save" ? () => undefined : onClose}
      width={filesOnly ? 560 : 860}
      kicker={repo}
      title={
        req.mode === "create"
          ? t("releases.newTitle")
          : req.mode === "edit"
            ? t("releases.editTitle", { tag: req.release.tag_name })
            : t("releases.filesTitle", { tag: req.release.tag_name })
      }
      footer={
        <>
          {progress && (
            <div className="mr-auto flex min-w-0 flex-1 items-center gap-2">
              <span className="num truncate text-[11.5px] text-dim">
                {progress.index}/{progress.count} · {progress.name}
              </span>
              <Meter value={progress.pct} className="w-[160px]" />
            </div>
          )}
          <Button variant="ghost" disabled={busy === "save"} onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={filesOnly ? Upload : Rocket}
            loading={busy === "save"}
            disabled={filesOnly ? !files.length : !form.tag_name.trim()}
            onClick={() => void submit()}
          >
            {filesOnly
              ? t("releases.uploadFiles", { count: files.length })
              : req.mode === "edit"
                ? t("releases.saveChanges")
                : form.draft
                  ? t("releases.saveDraft")
                  : t("releases.publish")}
          </Button>
        </>
      }
    >
      <div className={filesOnly ? "space-y-3" : "grid gap-6 md:grid-cols-[minmax(0,1fr)_280px]"}>
        {!filesOnly && (
          <div className="space-y-4">
            {req.mode === "create" && notUploaded > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_7%,transparent)] p-2.5 text-[12px] text-warn">
                <span className="flex-1">{t("releases.notUploadedWarn", { count: notUploaded })}</span>
                <Button size="sm" icon={Upload} loading={pending?.busy} onClick={() => pending?.upload()}>
                  {t("actions.upload")}
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("releases.tag")}</Label>
                <Input
                  value={form.tag_name}
                  onChange={(e) => set({ tag_name: e.target.value.replace(/\s+/g, "-") })}
                  placeholder="v1.0.0"
                  className="num"
                />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(["patch", "minor", "major"] as const)
                    .filter((k, i, all) => all.findIndex((x) => next[x] === next[k]) === i)
                    .map((k) => (
                      <button
                        key={k}
                        onClick={() => set({ tag_name: next[k] })}
                        className="num h-6 cursor-default rounded-[3px] border border-line px-1.5 text-[11px] text-dim hover:border-accent hover:text-accent"
                        title={t(`releases.bump.${k}`)}
                      >
                        {next[k]}
                      </button>
                    ))}
                </div>
                <p className="mt-1 text-[11px] text-faint">
                  {existing
                    ? t("releases.tagExists", { sha: existing.sha.slice(0, 7) })
                    : t("releases.tagNew", { target: form.target ?? "—" })}
                  {next.latest && ` · ${t("releases.latestTag", { tag: next.latest })}`}
                </p>
              </div>
              <div>
                <Label hint={t("releases.targetHint")}>{t("releases.target")}</Label>
                <Select
                  value={form.target ?? ""}
                  disabled={!!existing}
                  onChange={(e) => set({ target: e.target.value || null })}
                >
                  {(form.target && !branches.includes(form.target)
                    ? [form.target, ...branches]
                    : branches
                  ).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label>{t("releases.title")}</Label>
              <Input
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder={form.tag_name || t("releases.titlePlaceholder")}
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="annot">{t("releases.notes")}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Sparkles}
                  loading={busy === "notes"}
                  disabled={!form.tag_name.trim()}
                  onClick={() => void genNotes()}
                >
                  {t("releases.generate")}
                </Button>
              </div>
              <MarkdownEditor
                value={form.body}
                onChange={(body) => set({ body })}
                placeholder={t("releases.notesPlaceholder")}
                minRows={8}
              />
            </div>
          </div>
        )}
        <div className="space-y-4">
          {!filesOnly && (
            <div className="space-y-1.5">
              <Label>{t("releases.kind")}</Label>
              <Checkbox
                checked={form.prerelease}
                onChange={(prerelease) => set({ prerelease })}
                label={<span className="text-[12.5px]">{t("releases.prerelease")}</span>}
              />
              <Checkbox
                checked={form.make_latest && !form.prerelease}
                onChange={(make_latest) => set({ make_latest })}
                label={<span className="text-[12.5px]">{t("releases.latest")}</span>}
              />
              <Checkbox
                checked={form.draft}
                onChange={(draft) => set({ draft })}
                label={<span className="text-[12.5px]">{t("releases.draft")}</span>}
              />
              <p className="text-[11px] text-faint">{t("releases.draftHint")}</p>
            </div>
          )}
          <div>
            <Label hint={files.length ? t("releases.fileCount", { count: files.length }) : undefined}>
              {t("releases.files")}
            </Label>
            <div className="space-y-1">
              {files.map((p) => (
                <div key={p} className="flex items-center gap-2 rounded-[3px] border border-line px-2 py-1">
                  <Paperclip size={12} className="shrink-0 text-faint" />
                  <span className="num min-w-0 flex-1 truncate text-[12px]" title={p}>
                    {fileName(p)}
                  </span>
                  <button
                    className="cursor-default text-faint hover:text-danger"
                    onClick={() => setFiles(files.filter((x) => x !== p))}
                    title={t("releases.removeFile")}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <Button size="sm" icon={FilePlus2} className="w-full" onClick={() => void pick()}>
                {t("releases.addFiles")}
              </Button>
              <p className="text-[11px] text-faint">{t("releases.filesHint")}</p>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
