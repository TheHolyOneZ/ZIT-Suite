import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileUp,
  Folder,
  FolderOpen,
  FolderUp,
  Pencil,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import { commands, unwrap, type FolderScan, type TreeItem } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { toast } from "@/core/store/toasts";
import { IconButton, Input } from "@/ui";
import { colorOf } from "@/modules/audit/colors";
import { buildTree, effectiveFiles, stageDelete, type Node, type StagedMap } from "./model";
import { FolderUploadDialog } from "./FolderUploadDialog";
import { PathDialog, type PathRequest } from "./PathDialog";
import { useFiles } from "./store";

const MARK: Record<string, { sign: string; color: string }> = {
  new: { sign: "+", color: "var(--ok)" },
  edit: { sign: "~", color: "var(--warn)" },
  rename: { sign: "→", color: "var(--info)" },
};


export function FileTree({
  k,
  items,
  staged,
  onStage,
  onOpen,
  activePath,
}: {
  k: string;
  items: TreeItem[];
  staged: StagedMap;
  onStage: (s: StagedMap) => void;
  onOpen: (path: string) => void;
  activePath: string | null;
}) {
  const { t } = useTranslation("files");
  const [filter, setFilter] = useState("");
  const [req, setReq] = useState<PathRequest | null>(null);
  const [scan, setScan] = useState<FolderScan | null>(null);
  const folder = useFiles((s) => s.folder);
  const set = useFiles((s) => s.set);
  const files = useMemo(() => effectiveFiles(items, staged), [items, staged]);
  const tree = useMemo(() => buildTree(files, filter), [files, filter]);
  const deleted = Object.entries(staged)
    .filter(([, s]) => s.kind === "delete")
    .map(([p]) => p);
  const taken = useMemo(() => new Set(files.map((f) => f.path)), [files]);

  const upload = async () => {
    const picked = await open({ multiple: true, directory: false });
    if (!picked) return;
    let next = { ...staged };
    for (const p of Array.isArray(picked) ? picked : [picked]) {
      const name = p.split(/[\\/]/).pop()!;
      const path = folder ? `${folder}/${name}` : name;
      try {
        const base64 = await unwrap(commands.filesReadLocal(p));
        next = { ...next, [path]: { kind: "upload", base64, size: Math.floor((base64.length * 3) / 4) } };
      } catch (e) {
        toastError(e);
      }
    }
    onStage(next);
    toast({
      kind: "success",
      title: t("tree.uploaded", { count: Array.isArray(picked) ? picked.length : 1, folder: folder || "/" }),
    });
  };

  const uploadFolder = async () => {
    const picked = await open({ multiple: false, directory: true });
    if (typeof picked !== "string") return;
    try {
      setScan(await unwrap(commands.filesScanFolder(picked)));
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-line bg-surface">
      <div className="space-y-2 border-b border-line p-2">
        <Input
          icon={Search}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("tree.filter")}
          className="!h-7 text-[12px]"
        />
        <div className="flex items-center gap-1">
          <span className="num min-w-0 flex-1 truncate text-[11px] text-faint" title={t("tree.folderHint")}>
            {t("tree.into")} /{folder}
          </span>
          <IconButton
            icon={FilePlus2}
            label={t("tree.newFile")}
            size={14}
            className="size-7"
            onClick={() => setReq({ mode: "new", path: folder ? `${folder}/` : "" })}
          />
          <IconButton
            icon={FileUp}
            label={t("tree.upload")}
            size={14}
            className="size-7"
            onClick={() => void upload()}
          />
          <IconButton
            icon={FolderUp}
            label={t("tree.uploadFolder")}
            size={14}
            className="size-7"
            onClick={() => void uploadFolder()}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1" data-tree>
        {tree.children.map((n) => (
          <Row
            key={n.path}
            n={n}
            depth={0}
            onOpen={onOpen}
            activePath={activePath}
            folder={folder}
            onFolder={(f) => set({ folder: f })}
            forceOpen={!!filter}
            onRename={(p) => setReq({ mode: "rename", from: p, path: p })}
            onDelete={(p) => onStage(stageDelete(staged, p))}
          />
        ))}
        {deleted.length > 0 && (
          <div className="mt-2 border-t border-line px-2 pt-2">
            <div className="annot mb-1 !text-[9.5px]">{t("tree.deleted")}</div>
            {deleted.map((p) => (
              <div key={p} className="group flex items-center gap-1.5 py-0.5 text-[12px] text-danger">
                <span className="num line-through">{p}</span>
                <button
                  className="ml-auto cursor-default text-faint opacity-0 group-hover:opacity-100 hover:text-text"
                  title={t("tree.restore")}
                  onClick={() => {
                    const n = { ...staged };
                    delete n[p];
                    onStage(n);
                  }}
                >
                  <Undo2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {scan && (
        <FolderUploadDialog
          scan={scan}
          folder={folder}
          items={items}
          staged={staged}
          onStage={onStage}
          onClose={() => setScan(null)}
        />
      )}
      {req && (
        <PathDialog
          k={k}
          req={req}
          taken={taken}
          items={items}
          staged={staged}
          onStage={onStage}
          onOpen={onOpen}
          onClose={() => setReq(null)}
        />
      )}
    </div>
  );
}

function Row({
  n,
  depth,
  onOpen,
  activePath,
  folder,
  onFolder,
  forceOpen,
  onRename,
  onDelete,
}: {
  n: Node;
  depth: number;
  onOpen: (p: string) => void;
  activePath: string | null;
  folder: string;
  onFolder: (f: string) => void;
  forceOpen: boolean;
  onRename: (p: string) => void;
  onDelete: (p: string) => void;
}) {
  const { t } = useTranslation("files");
  const [open, setOpen] = useState(depth === 0 && n.changed);
  const expanded = open || forceOpen;
  const mark = n.file?.status ? MARK[n.file.status] : null;
  const pad = { paddingLeft: 8 + depth * 14 };
  if (n.dir)
    return (
      <>
        <button
          style={pad}
          onClick={() => (setOpen(!expanded), onFolder(n.path))}
          className={cn(
            "flex h-7 w-full cursor-default items-center gap-1.5 pr-2 text-left text-[12.5px] hover:bg-surface-2",
            folder === n.path && "text-accent",
          )}
        >
          {expanded ? (
            <ChevronDown size={12} className="shrink-0 text-faint" />
          ) : (
            <ChevronRight size={12} className="shrink-0 text-faint" />
          )}
          {expanded ? (
            <FolderOpen size={13} className="shrink-0 text-info" />
          ) : (
            <Folder size={13} className="shrink-0 text-info" />
          )}
          <span className="truncate">{n.name}</span>
          {n.changed && <span className="num ml-auto text-[10px] text-warn">~</span>}
        </button>
        {expanded &&
          n.children.map((c) => (
            <Row
              key={c.path}
              n={c}
              depth={depth + 1}
              onOpen={onOpen}
              activePath={activePath}
              folder={folder}
              onFolder={onFolder}
              forceOpen={forceOpen}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
      </>
    );
  return (
    <div
      style={pad}
      className={cn(
        "group flex h-7 items-center gap-1.5 pr-1 hover:bg-surface-2",
        activePath === n.path && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
      )}
    >
      <span className="w-3 shrink-0" />
      <span
        className="size-2 shrink-0 rounded-[2px]"
        style={{ background: colorOf(languageOfName(n.name)) }}
      />
      <button
        className="min-w-0 flex-1 cursor-default truncate text-left text-[12.5px]"
        onClick={() => onOpen(n.path)}
        title={n.path}
      >
        {n.name}
      </button>
      {mark && (
        <span
          className="num text-[11px] font-semibold"
          style={{ color: mark.color }}
          title={t(`status.${n.file!.status as "new"}`)}
        >
          {mark.sign}
        </span>
      )}
      <span className="hidden group-hover:flex">
        <IconButton
          icon={Pencil}
          label={t("tree.rename")}
          size={12}
          className="size-6"
          onClick={() => onRename(n.path)}
        />
        <IconButton
          icon={Trash2}
          label={t("tree.delete")}
          size={12}
          className="size-6 hover:text-danger"
          onClick={() => onDelete(n.path)}
        />
      </span>
    </div>
  );
}


function languageOfName(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const m: Record<string, string> = {
    rs: "Rust",
    ts: "TypeScript",
    tsx: "TSX",
    js: "JavaScript",
    jsx: "JSX",
    py: "Python",
    go: "Go",
    java: "Java",
    cs: "C#",
    cpp: "C++",
    c: "C",
    md: "Markdown",
    json: "JSON",
    yml: "YAML",
    yaml: "YAML",
    toml: "TOML",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    sh: "Shell",
    lua: "Lua",
    rb: "Ruby",
    php: "PHP",
    vue: "Vue",
    svelte: "Svelte",
    sql: "SQL",
    xml: "XML",
    kt: "Kotlin",
    swift: "Swift",
    dart: "Dart",
  };
  return m[ext] ?? null;
}
