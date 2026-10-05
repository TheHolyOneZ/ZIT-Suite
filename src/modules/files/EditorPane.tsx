import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Columns2, Eye, History, Maximize2, Minimize2, RotateCcw, ScanText, X } from "lucide-react";
import type { TreeItem } from "@/core/ipc";
import { cn } from "@/core/cn";
import { Badge, Button, Checkbox, EmptyState, IconButton, Markdown, Plotter, RelTime } from "@/ui";
import { formatBytes } from "@/modules/home/model";
import { useBlob, useFileHistory } from "./api";
import { BlameView } from "./BlameView";
import { CodeEditor } from "./CodeEditor";
import { imageMime, isImage, isMarkdown, stageEdit, type StagedMap } from "./model";
import { commands, unwrap } from "@/core/ipc";
import { useQuery } from "@tanstack/react-query";
import { useFiles } from "./store";


export function EditorPane({
  k,
  repo,
  branch,
  items,
  staged,
  onStage,
  tabs,
  active,
}: {
  k: string;
  repo: string;
  branch: string;
  items: TreeItem[];
  staged: StagedMap;
  onStage: (s: StagedMap) => void;
  tabs: string[];
  active: string | null;
}) {
  const { t } = useTranslation("files");
  const ui = useFiles();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="no-scrollbar flex shrink-0 items-stretch overflow-x-auto border-b border-line bg-surface">
        {tabs.map((p) => {
          const s = staged[p];
          return (
            <div
              key={p}
              className={cn(
                "group flex h-9 shrink-0 items-center gap-1.5 border-r border-line pr-1 pl-3 text-[12px]",
                p === active
                  ? "bg-bg text-text shadow-[inset_0_2px_0_var(--accent)]"
                  : "text-dim hover:text-text",
              )}
            >
              <button className="num cursor-default" onClick={() => ui.open(k, p)} title={p}>
                {p.split("/").pop()}
              </button>
              {s && s.kind !== "delete" && (
                <span className="num text-[10.5px] text-warn" title={t("tabs.unsaved")}>
                  ~
                </span>
              )}
              <IconButton
                icon={X}
                label={t("tabs.close")}
                size={11}
                className="size-5 opacity-50 group-hover:opacity-100"
                onClick={() => ui.close(k, p)}
              />
            </div>
          );
        })}
      </div>
      {active ? (
        <FileView
          key={`${k}:${active}`}
          k={k}
          repo={repo}
          branch={branch}
          path={active}
          items={items}
          staged={staged}
          onStage={onStage}
        />
      ) : (
        <EmptyState title={t("editor.pick")} body={t("editor.pickBody")} />
      )}
    </div>
  );
}

function FileView({
  repo,
  branch,
  path,
  items,
  staged,
  onStage,
}: {
  k: string;
  repo: string;
  branch: string;
  path: string;
  items: TreeItem[];
  staged: StagedMap;
  onStage: (s: StagedMap) => void;
}) {
  const { t } = useTranslation("files");
  const ui = useFiles();
  const [showHistory, setShowHistory] = useState(false);
  const [blame, setBlame] = useState(false);
  const [atCommit, setAtCommit] = useState<string | null>(null);
  const s = staged[path];
  const src = s?.kind === "rename" ? s.from : path;
  const item = items.find((i) => i.path === src && i.kind === "blob");
  const blob = useBlob(repo, s?.kind === "new" || s?.kind === "upload" ? null : (item?.sha ?? null));
  const old = useQuery({
    queryKey: ["files", "at", repo, atCommit, src],
    queryFn: () => unwrap(commands.filesAtCommit(repo, atCommit!, src)),
    enabled: !!atCommit,
    staleTime: Infinity,
  });

  if (s?.kind === "delete") return <EmptyState title={t("editor.deleted")} />;
  if (s?.kind === "upload") {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6">
        {isImage(path) ? (
          <img
            src={`data:${imageMime(path)};base64,${s.base64}`}
            alt=""
            className="max-h-[70%] max-w-full rounded-[var(--radius)] border border-line"
          />
        ) : null}
        <Badge tone="ok">{t("editor.uploadStaged", { size: formatBytes(s.size) })}</Badge>
      </div>
    );
  }
  if (blob.isLoading) return <Plotter />;
  const original = s?.kind === "new" ? "" : (blob.data?.text ?? null);
  const text =
    s?.kind === "edit"
      ? s.text
      : s?.kind === "new"
        ? s.text
        : s?.kind === "rename" && s.text !== undefined
          ? s.text
          : original;
  const binary = s?.kind !== "new" && blob.data && blob.data.text === null;
  const md = isMarkdown(path);
  const executable =
    s?.kind === "edit" && s.executable !== undefined ? s.executable : item?.mode === "100755";
  const change = (v: string) => onStage(stageEdit(staged, path, v, original ?? ""));
  const revert = () => {
    const n = { ...staged };
    if (s?.kind === "rename") n[path] = { kind: "rename", from: s.from };
    else delete n[path];
    onStage(n);
  };
  const historic = atCommit ? (old.data?.text ?? null) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-1.5">
        <span className="num min-w-0 flex-1 truncate text-[11.5px] text-dim" title={path}>
          {path}
          {item && <span className="text-faint"> · {formatBytes(item.size)}</span>}
          {s?.kind === "rename" && (
            <span className="text-info"> · {t("editor.movedFrom", { from: s.from })}</span>
          )}
        </span>
        {atCommit && (
          <Badge tone="info">
            {t("editor.viewing", { sha: atCommit.slice(0, 7) })}
            <button className="ml-1 cursor-default" onClick={() => setAtCommit(null)}>
              <X size={10} />
            </button>
          </Badge>
        )}
        {!binary && !atCommit && item && (item.mode === "100755" || /\.(sh|bash|py|pl|rb)$/.test(path)) && (
          <Checkbox
            checked={executable}
            onChange={(on) =>
              onStage({
                ...staged,
                [path]: { kind: "edit", text: text ?? "", original: original ?? "", executable: on },
              })
            }
            label={<span className="text-[11.5px]">{t("editor.executable")}</span>}
          />
        )}
        {md && (
          <IconButton
            icon={ui.preview ? Columns2 : Eye}
            label={ui.preview ? t("editor.hidePreview") : t("editor.preview")}
            size={14}
            className={cn("size-7", ui.preview && "text-accent")}
            onClick={() => ui.set({ preview: !ui.preview })}
          />
        )}
        {item && !binary && !s && (
          <IconButton
            icon={ScanText}
            label={blame ? t("blame.hide") : t("blame.show")}
            size={14}
            className={cn("size-7", blame && "text-accent")}
            onClick={() => setBlame(!blame)}
          />
        )}
        {item && (
          <IconButton
            icon={History}
            label={t("editor.history")}
            size={14}
            className={cn("size-7", showHistory && "text-accent")}
            onClick={() => setShowHistory(!showHistory)}
          />
        )}
        {s && s.kind !== "new" && (
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={revert}>
            {t("editor.revert")}
          </Button>
        )}
        <IconButton
          icon={ui.focus ? Minimize2 : Maximize2}
          label={ui.focus ? t("editor.unfocus") : t("editor.focus")}
          size={14}
          className="size-7"
          onClick={() => ui.set({ focus: !ui.focus })}
        />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {binary ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              {isImage(path) && blob.data?.base64 ? (
                <img
                  src={`data:${imageMime(path)};base64,${blob.data.base64}`}
                  alt=""
                  className="max-h-[70%] max-w-full rounded-[var(--radius)] border border-line"
                />
              ) : null}
              <span className="text-[12px] text-faint">
                {t("editor.binary", { size: formatBytes(blob.data?.size ?? 0) })}
              </span>
            </div>
          ) : blame && !s && !atCommit ? (
            <BlameView repo={repo} branch={branch} path={path} text={original ?? ""} />
          ) : atCommit ? (
            old.isLoading ? (
              <Plotter />
            ) : historic === null ? (
              <EmptyState title={t("editor.notThere")} />
            ) : (
              <CodeEditor path={path} value={historic} readOnly />
            )
          ) : md && ui.preview ? (
            <div className="grid h-full grid-cols-2">
              <div className="min-h-0 border-r border-line">
                <CodeEditor path={path} value={text ?? ""} onChange={change} />
              </div>
              <div className="min-h-0 overflow-y-auto p-5">
                <Markdown source={text ?? ""} className="text-[13px]" />
              </div>
            </div>
          ) : (
            <CodeEditor path={path} value={text ?? ""} onChange={change} />
          )}
        </div>
        {showHistory && (
          <HistoryList repo={repo} branch={branch} path={src} active={atCommit} onPick={setAtCommit} />
        )}
      </div>
    </div>
  );
}

function HistoryList({
  repo,
  branch,
  path,
  active,
  onPick,
}: {
  repo: string;
  branch: string;
  path: string;
  active: string | null;
  onPick: (sha: string | null) => void;
}) {
  const { t } = useTranslation("files");
  const q = useFileHistory(repo, branch, path, true);
  return (
    <div className="flex w-[280px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="annot border-b border-line px-3 py-2">{t("editor.history")}</div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {q.isLoading && <Plotter />}
        {(q.data ?? []).map((c, i) => (
          <div
            key={c.sha}
            className={cn(
              "group border-b border-line px-3 py-2",
              active === c.sha && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
            )}
          >
            <button
              className="block w-full cursor-default text-left"
              onClick={() => onPick(i === 0 ? null : c.sha)}
            >
              <span className="block truncate text-[12px]">{c.message}</span>
              <span className="flex gap-2 text-[10.5px] text-faint">
                <span className="num">{c.sha.slice(0, 7)}</span>
                <span>{c.author}</span>
                <RelTime at={c.date} />
                {i === 0 && <span className="text-ok">{t("editor.current")}</span>}
              </span>
            </button>
            <button
              className="cursor-default text-[10.5px] text-dim opacity-0 group-hover:opacity-100 hover:text-accent"
              onClick={() => void openUrl(c.url)}
            >
              {t("editor.openCommit")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
