import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ChevronDown,
  ChevronRight,
  CloudUpload,
  ExternalLink,
  Folder,
  FolderOpen,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { commands, events, unwrap, type CommitResult, type PlanFile, type UploadPlan } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { useRepoList } from "@/core/data/repos";
import { RepoPicker } from "@/app/RepoPicker";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Input,
  Label,
  Meter,
  PageHeader,
  Panel,
  Plotter,
  Select,
} from "@/ui";
import { formatBytes } from "@/modules/home/model";
import { buildTree, defaultPicks, suggestMessage, tickState, toggle, type UNode } from "./model";
import { useUpload } from "./store";

const STATE_TONE = { new: "ok", changed: "warn", same: "idle" } as const;

export function UploadPage() {
  const { t } = useTranslation(["upload", "common"]);
  const s = useUpload();
  const repos = useRepoList().data;
  const defaultBranch = repos?.find((r) => r.full_name === s.repo)?.default_branch ?? "";
  const branches = useQuery({
    queryKey: ["upload", "branches", s.repo],
    queryFn: () => unwrap(commands.pullsBranches(s.repo)),
    enabled: !!s.repo,
    staleTime: 60_000,
  });
  const branch = s.branch || defaultBranch;
  const ready = !!s.repo && !!branch && !!s.folder.trim();
  const plan = useQuery({
    queryKey: ["upload", "plan", s.repo, branch, s.folder, s.into],
    queryFn: () => unwrap(commands.uploadPlan(s.repo, branch, s.folder.trim(), s.into.trim())),
    enabled: ready,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const files = useMemo(() => plan.data?.files ?? [], [plan.data]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => setPicked(defaultPicks(files)), [files]);
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);
  const [description, setDescription] = useState("");
  const suggested = suggestMessage(files, picked);
  useEffect(() => {
    if (!touched) setMessage(suggested);
  }, [suggested, touched]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ commit: CommitResult; count: number } | null>(null);
  useEffect(() => {
    const un = events.uploadProgress.listen((e) => setProgress(e.payload));
    return () => void un.then((f) => f());
  }, []);

  const chosen = files.filter((f) => picked.has(f.rel));
  const bytes = chosen.reduce((n, f) => n + f.size, 0);
  const counts = { new: 0, changed: 0, same: 0 };
  for (const f of files) counts[f.state]++;

  const upload = async () => {
    if (!plan.data || !chosen.length || !message.trim()) return;
    setProgress({ done: 0, total: chosen.length });
    try {
      const full = description.trim() ? `${message.trim()}\n\n${description.trim()}` : message.trim();
      const commit = await unwrap(
        commands.uploadRun(
          s.repo,
          branch,
          plan.data.base_commit,
          s.folder.trim(),
          s.into.trim(),
          chosen.map((f) => f.rel),
          full,
        ),
      );
      s.remember({ repo: s.repo, branch, folder: s.folder.trim(), into: s.into.trim() });
      setResult({ commit, count: chosen.length });
      setTouched(false);
      setDescription("");
    } catch (e) {
      toastError(e);
    } finally {
      setProgress(null);
    }
  };
  const again = () => {
    setResult(null);
    void plan.refetch();
  };
  const chooseFolder = async () => {
    const dir = await open({ directory: true, multiple: false, defaultPath: s.folder || undefined });
    if (typeof dir === "string") s.set({ folder: dir });
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader kicker={t("kicker")} title={t("title")} meta={<span>{t("subtitle")}</span>} />
      <div className="grid min-h-0 flex-1 grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4 overflow-y-auto border-r border-line bg-surface p-4">
          <div>
            <Label>{t("repo")}</Label>
            <RepoPicker
              value={s.repo || null}
              writable
              onChange={(repo) => s.set({ repo, branch: "" })}
              placeholder={t("repoPlaceholder")}
            />
          </div>
          <div>
            <Label>{t("branch")}</Label>
            <Select value={branch} onChange={(e) => s.set({ branch: e.target.value })} disabled={!s.repo}>
              {!branches.data?.length && <option value={branch}>{branch || t("branchNone")}</option>}
              {(branches.data ?? []).map((b) => (
                <option key={b} value={b}>
                  {b === defaultBranch ? `${b} · ${t("default")}` : b}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t("folder")}</Label>
            <div className="flex gap-2">
              <Input
                value={s.folder}
                onChange={(e) => s.set({ folder: e.target.value })}
                placeholder={t("folderPlaceholder")}
                className="num"
              />
              <Button icon={FolderOpen} onClick={() => void chooseFolder()}>
                {t("choose")}
              </Button>
            </div>
          </div>
          <div>
            <Label hint={t("intoHint")}>{t("into")}</Label>
            <Input
              value={s.into}
              onChange={(e) => s.set({ into: e.target.value })}
              placeholder={t("intoPlaceholder")}
              className="num"
            />
          </div>
          {s.recent.length > 0 && (
            <div>
              <div className="annot mb-1.5">{t("recent")}</div>
              <div className="space-y-1">
                {s.recent.map((r) => (
                  <button
                    key={`${r.repo}|${r.branch}|${r.folder}|${r.into}`}
                    onClick={() => (setResult(null), s.set(r))}
                    className="flex w-full cursor-default items-center gap-2 rounded-[3px] border border-line px-2 py-1.5 text-left hover:border-accent"
                  >
                    <RotateCcw size={12} className="shrink-0 text-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="num block truncate text-[12px]">
                        {r.repo} <span className="text-faint">@ {r.branch}</span>
                      </span>
                      <span className="num block truncate text-[11px] text-faint">
                        {r.folder}
                        {r.into && ` → /${r.into}`}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2 border-t border-line pt-4">
            <Label>{t("message")}</Label>
            <Input
              value={message}
              onChange={(e) => (setMessage(e.target.value), setTouched(true))}
              placeholder={t("messagePlaceholder")}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("descriptionPlaceholder")}
              className="w-full resize-y rounded-[var(--radius)] border border-line-strong bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent"
            />
          </div>
          {progress ? (
            <div className="space-y-1.5">
              <Meter value={progress.total ? (progress.done / progress.total) * 100 : 0} />
              <div className="num text-[11.5px] text-dim">
                {t("uploading", { done: progress.done, total: progress.total })}
              </div>
            </div>
          ) : (
            <Button
              variant="primary"
              icon={CloudUpload}
              className="h-11 w-full justify-center text-[14px]"
              disabled={!plan.data || !chosen.length || !message.trim()}
              onClick={() => void upload()}
            >
              {chosen.length
                ? t("upload", { count: chosen.length, size: formatBytes(bytes) })
                : t("uploadNothing")}
            </Button>
          )}
          <p className="text-[11.5px] text-faint">{t("note")}</p>
        </div>

        <div className="flex min-h-0 flex-col">
          {result ? (
            <Done result={result} repo={s.repo} onAgain={again} />
          ) : !ready ? (
            <EmptyState icon={<CloudUpload size={22} />} title={t("startTitle")} body={t("startBody")} />
          ) : plan.isFetching ? (
            <Plotter />
          ) : plan.error ? (
            <EmptyState
              title={errorMessage(plan.error)}
              action={<Button onClick={() => void plan.refetch()}>{t("common:actions.retry")}</Button>}
            />
          ) : plan.data ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
                <span className="num text-[12px]">
                  {t("picked", { count: chosen.length, total: files.length })}
                </span>
                <Badge tone="ok">{t("state.new", { count: counts.new })}</Badge>
                <Badge tone="warn">{t("state.changed", { count: counts.changed })}</Badge>
                <Badge>{t("state.same", { count: counts.same })}</Badge>
                {!plan.data.base_commit && <Badge tone="info">{t("emptyRepo")}</Badge>}
                <span className="flex-1" />
                <Button size="sm" variant="ghost" onClick={() => setPicked(defaultPicks(files))}>
                  {t("pickChanged")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(files.map((f) => f.rel)))}>
                  {t("pickAll")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
                  {t("pickNone")}
                </Button>
                <Checkbox
                  checked={s.showSame}
                  onChange={(showSame) => s.set({ showSame })}
                  label={<span className="text-[12px]">{t("showSame")}</span>}
                />
                <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => void plan.refetch()}>
                  {t("rescan")}
                </Button>
              </div>
              <Notices plan={plan.data} />
              <div className="min-h-0 flex-1 overflow-y-auto py-1">
                {files.length === 0 ? (
                  <EmptyState title={t("noFiles")} />
                ) : (
                  <FileTree files={files} picked={picked} setPicked={setPicked} showSame={s.showSame} />
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Notices({ plan }: { plan: UploadPlan }) {
  const { t } = useTranslation("upload");
  if (!plan.too_large.length && !plan.truncated && !plan.skipped_count) return null;
  return (
    <div className="space-y-1 border-b border-line px-4 py-2 text-[12px]">
      {plan.too_large.length > 0 && (
        <p className="text-warn">
          {t("tooLarge", { count: plan.too_large.length, list: plan.too_large.slice(0, 3).join(", ") })}
        </p>
      )}
      {plan.truncated && <p className="text-warn">{t("truncated", { count: plan.files.length })}</p>}
      {plan.skipped_count > 0 && (
        <details className="text-faint">
          <summary className="cursor-default">{t("skipped", { count: plan.skipped_count })}</summary>
          <div className="num mt-1 max-h-[120px] overflow-y-auto text-[11.5px]">
            {plan.skipped.map((x) => (
              <div key={x}>{x}</div>
            ))}
            {plan.skipped_count > plan.skipped.length && <div>…</div>}
          </div>
        </details>
      )}
    </div>
  );
}

function FileTree({
  files,
  picked,
  setPicked,
  showSame,
}: {
  files: PlanFile[];
  picked: Set<string>;
  setPicked: (s: Set<string>) => void;
  showSame: boolean;
}) {
  const visible = useMemo(
    () => (showSame ? files : files.filter((f) => f.state !== "same" || picked.has(f.rel))),
    [files, showSame, picked],
  );
  const tree = useMemo(() => buildTree(visible), [visible]);
  const { t } = useTranslation("upload");
  if (!tree.children.length) return <EmptyState title={t("allSame")} body={t("allSameBody")} />;
  return (
    <>
      {tree.children.map((n) => (
        <Row key={n.path} n={n} depth={0} picked={picked} setPicked={setPicked} />
      ))}
    </>
  );
}

function Row({
  n,
  depth,
  picked,
  setPicked,
}: {
  n: UNode;
  depth: number;
  picked: Set<string>;
  setPicked: (s: Set<string>) => void;
}) {
  const { t } = useTranslation("upload");
  const [open, setOpen] = useState(depth < 1);
  const st = tickState(n, picked);
  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-[3px] hover:bg-surface-2",
          st === "none" && "opacity-55",
        )}
        style={{ paddingLeft: 16 + depth * 18 }}
      >
        <Checkbox
          checked={st === "all"}
          indeterminate={st === "some"}
          onChange={(on) => setPicked(toggle(picked, n, on))}
        />
        {n.dir ? (
          <button
            className="flex min-w-0 flex-1 cursor-default items-center gap-1.5 text-left"
            onClick={() => setOpen(!open)}
          >
            {open ? (
              <ChevronDown size={12} className="shrink-0 text-faint" />
            ) : (
              <ChevronRight size={12} className="shrink-0 text-faint" />
            )}
            <Folder size={13} className="shrink-0 text-info" />
            <span className="num truncate text-[12.5px]">{n.name}</span>
            <span className="num shrink-0 text-[10.5px] text-faint">{n.files.length}</span>
          </button>
        ) : (
          <span className="num min-w-0 flex-1 truncate pl-[18px] text-[12.5px]">{n.name}</span>
        )}
        {n.state && <Badge tone={STATE_TONE[n.state]}>{t(`stateShort.${n.state}`)}</Badge>}
        <span className="num w-[70px] shrink-0 text-right text-[10.5px] text-faint">
          {formatBytes(n.size)}
        </span>
      </div>
      {n.dir &&
        open &&
        n.children.map((c) => (
          <Row key={c.path} n={c} depth={depth + 1} picked={picked} setPicked={setPicked} />
        ))}
    </>
  );
}

function Done({
  result,
  repo,
  onAgain,
}: {
  result: { commit: CommitResult; count: number };
  repo: string;
  onAgain: () => void;
}) {
  const { t } = useTranslation("upload");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
      <Panel ticks className="max-w-[460px] space-y-3 px-8 py-7">
        <CloudUpload size={30} className="mx-auto text-ok" />
        <div className="text-[17px] font-semibold">{t("doneTitle", { count: result.count })}</div>
        <p className="num text-[12.5px] text-dim">
          {repo} @ {result.commit.branch} · {result.commit.sha.slice(0, 7)}
        </p>
        <div className="flex justify-center gap-2 pt-1">
          <Button icon={ExternalLink} onClick={() => void openUrl(result.commit.url)}>
            {t("openCommit")}
          </Button>
          <Button variant="primary" icon={RotateCcw} onClick={onAgain}>
            {t("again")}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
