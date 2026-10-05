import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, FolderPlus, GitFork, Sparkles } from "lucide-react";
import { commands, unwrap, type FolderInfo } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { toast } from "@/core/store/toasts";
import { Badge, Button, Checkbox, Dialog, Input, Label, Mark, Plotter, Segmented } from "@/ui";
import { RepoPicker } from "@/app/RepoPicker";
import { refreshList } from "./api";
import { parseSlug, shortPath } from "./model";
import { GitTerm } from "./parts";
import { useHomeUi } from "./store";
import { openWorkspace } from "./WorkspaceCard";

type UploadMode = "existing" | "create" | "pick" | "none";


const repoNameFrom = (s: string) =>
  s
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "my-project";


export function AddWorkspaceDialog() {
  const { t } = useTranslation(["home", "common"]);
  const req = useHomeUi((s) => s.add);
  const set = useHomeUi((s) => s.set);
  const [info, setInfo] = useState<FolderInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<UploadMode>("create");
  const [repoName, setRepoName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [ignore, setIgnore] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");

  const inspect = async (path: string) => {
    setLoading(true);
    try {
      const i = await unwrap(commands.wsInspect(path));
      setInfo(i);
      setName(i.name);
      setRepoName(repoNameFrom(i.name));
      setMode(i.origin ? "existing" : "create");
      setReference(i.upstream ?? "");
      setIgnore(new Set(i.suggestions.map((s) => s.pattern)));
    } catch (e) {
      toastError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setInfo(null);
    setPicked(null);
    setDescription("");
    if (req) void inspect(req);
  }, [req]);

  const choose = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") void inspect(dir);
  };

  const close = () => set({ add: null });
  const refOk = !reference.trim() || !!parseSlug(reference);
  const ready =
    !!info &&
    !info.existing &&
    name.trim() &&
    refOk &&
    (mode !== "create" || repoName.trim()) &&
    (mode !== "pick" || picked);

  const submit = async () => {
    if (!info || !ready) return;
    setBusy(true);
    try {
      const r = await unwrap(
        commands.wsAdd({
          path: info.path,
          name: name.trim(),
          push_repo: mode === "existing" ? info.origin : mode === "pick" ? picked : null,
          create:
            mode === "create"
              ? { name: repoName.trim(), private: isPrivate, description: description.trim() || null }
              : null,
          reference_repo: reference.trim() ? parseSlug(reference) : null,
          ignore: [...ignore],
        }),
      );
      await refreshList();
      close();
      const steps = r.steps.map((s) => t(`addDialog.steps.${s as "initialized"}`)).join(" · ");
      toast({
        kind: r.warning ? "warning" : "success",
        title: t("addDialog.done", { name: r.workspace.name }),
        body: steps || undefined,
      });
      if (r.warning) toastError(r.warning);
      openWorkspace(r.workspace);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const modes: UploadMode[] = info?.origin
    ? ["existing", "create", "pick", "none"]
    : ["create", "pick", "none"];

  return (
    <Dialog
      open={req !== null}
      onClose={close}
      width={760}
      kicker={t("title")}
      title={t("addDialog.title")}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={info?.is_repo ? FolderPlus : Sparkles}
            loading={busy}
            disabled={!ready}
            onClick={submit}
          >
            {info?.is_repo ? t("addDialog.submit") : t("addDialog.setup")}
          </Button>
        </>
      }
    >
      {!info ? (
        loading ? (
          <Plotter />
        ) : (
          <div className="flex flex-col items-center gap-3 py-10">
            <Button variant="primary" icon={FolderOpen} onClick={choose}>
              {t("addDialog.choose")}
            </Button>
            <form
              className="flex w-full max-w-[460px] items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (typed.trim()) void inspect(typed.trim());
              }}
            >
              <div className="min-w-0 flex-1">
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={t("addDialog.pathPlaceholder")}
                  className="num"
                />
              </div>
              <Button type="submit" disabled={!typed.trim()}>
                {t("addDialog.openPath")}
              </Button>
            </form>
          </div>
        )
      ) : (
        <div className="space-y-5">

          <div className="flex items-start gap-3 rounded-[var(--radius)] border border-line bg-surface-2 p-3">
            <Mark glyph={info.is_repo ? "tick" : "open"} tone={info.is_repo ? "ok" : "accent"} size={16} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">
                {info.is_repo ? t("addDialog.isRepo") : t("addDialog.plain")}
              </div>
              <div className="text-[12px] text-dim">
                {info.is_repo
                  ? t("addDialog.isRepoBody", { branch: info.branch ?? "main" })
                  : t("addDialog.plainBody")}
              </div>
              <div className="num mt-1 truncate text-[11px] text-faint" title={info.path}>
                {shortPath(info.path)} · {t("addDialog.files", { count: info.entries })}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={choose}>
              {t("addDialog.change")}
            </Button>
          </div>
          {info.existing && <p className="text-[12px] text-warn">{t("addDialog.already")}</p>}

          <div>
            <Label>{t("addDialog.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <Label hint={<GitTerm term="push" />}>{t("addDialog.upload")}</Label>
            <Segmented
              size="sm"
              className="w-full"
              value={mode}
              onChange={setMode}
              options={modes.map((m) => ({ value: m, label: t(`addDialog.uploadModes.${m}`) }))}
            />
            <div className="mt-2">
              {mode === "existing" && info.origin && (
                <span className="num text-[12.5px] text-dim">{info.origin}</span>
              )}
              {mode === "create" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("addDialog.repoName")}</Label>
                    <Input
                      value={repoName}
                      onChange={(e) => setRepoName(e.target.value.replace(/\s+/g, "-"))}
                      className="num"
                    />
                  </div>
                  <div className="flex items-end pb-1.5">
                    <Checkbox checked={isPrivate} onChange={setIsPrivate} label={t("addDialog.private")} />
                  </div>
                  <div className="col-span-2">
                    <Label>{t("addDialog.description")}</Label>
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>
                </div>
              )}
              {mode === "pick" && <RepoPicker value={picked} onChange={setPicked} writable />}
            </div>
          </div>

          <div>
            <Label
              hint={
                !refOk ? (
                  <span className="text-danger">{t("settings.invalidRepo")}</span>
                ) : (
                  t("addDialog.referenceHint")
                )
              }
            >
              {t("addDialog.reference")}
            </Label>
            <Input
              icon={GitFork}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="https://github.com/original/project"
              className="num"
            />
          </div>

          {info.suggestions.length > 0 && (
            <div>
              <Label hint={<GitTerm term="gitignore" />}>{t("addDialog.dontShare")}</Label>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {info.suggestions.map((s) => (
                  <Checkbox
                    key={s.pattern}
                    checked={ignore.has(s.pattern)}
                    onChange={(on) =>
                      setIgnore((cur) => {
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
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
