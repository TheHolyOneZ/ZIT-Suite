import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { diffLines } from "diff";
import { GitBranchPlus, GitCommitHorizontal, GitPullRequest, Undo2 } from "lucide-react";
import { commands, unwrap, type TreeItem } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { toast } from "@/core/store/toasts";
import { Button, Checkbox, EmptyState, Input, Label, Plotter, Segmented } from "@/ui";
import { formatBytes } from "@/modules/home/model";
import { reloadTree, useBlob } from "./api";
import { diffRows, suggestMessage, toChanges, uploadText, type Staged, type StagedMap } from "./model";
import { keyOf, useFiles } from "./store";

const SIGN: Record<Staged["kind"], { sign: string; color: string }> = {
  new: { sign: "+", color: "var(--ok)" },
  upload: { sign: "+", color: "var(--ok)" },
  edit: { sign: "~", color: "var(--warn)" },
  rename: { sign: "→", color: "var(--info)" },
  delete: { sign: "−", color: "var(--danger)" },
};


export function ChangesPane({
  repo,
  branch,
  commit,
  items,
  staged,
  onStage,
}: {
  repo: string;
  branch: string;
  commit: string;
  items: TreeItem[];
  staged: StagedMap;
  onStage: (s: StagedMap) => void;
}) {
  const { t } = useTranslation(["files", "common"]);
  const entries = Object.entries(staged).sort(([a], [b]) => a.localeCompare(b));
  const [sel, setSel] = useState<string | null>(entries[0]?.[0] ?? null);
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);
  const [target, setTarget] = useState<"same" | "new">("same");
  const [newBranch, setNewBranch] = useState("");
  const [openPr, setOpenPr] = useState(true);
  const [busy, setBusy] = useState(false);
  const ui = useFiles();
  useEffect(() => {
    if (!touched) setMessage(suggestMessage(staged));
  }, [staged, touched]);
  if (!entries.length) return <EmptyState title={t("changes.none")} body={t("changes.noneBody")} />;
  const current = sel && staged[sel] ? sel : entries[0][0];
  const branchOk = target === "same" || /^[A-Za-z0-9._/-]+$/.test(newBranch.trim());

  const save = async () => {
    setBusy(true);
    try {
      const to = target === "same" ? branch : newBranch.trim();
      const r = await unwrap(
        commands.filesCommit(repo, to, commit, target === "new", message, toChanges(staged)),
      );
      onStage({});
      setTouched(false);
      if (target === "new") {

        ui.set({ branch: to, pane: "editor" });
        if (openPr) {
          const pr = await unwrap(
            commands.pullsCreate(repo, {
              title: message.split("\n")[0],
              head: to,
              base: branch,
              body: message.split("\n").slice(1).join("\n").trim() || null,
              draft: false,
            }),
          );
          toast({ kind: "success", title: t("changes.prOpened", { number: pr.number }), body: pr.title });
          void openUrl(pr.html_url);
        } else toast({ kind: "success", title: t("changes.savedNew", { branch: to }) });
      } else {
        toast({
          kind: "success",
          title: t("changes.saved", { count: entries.length }),
          body: r.sha.slice(0, 7),
        });
        ui.set({ pane: "editor" });
      }
      await reloadTree(repo, to);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[320px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="annot border-b border-line px-3 py-2">
          {t("changes.title", { count: entries.length })}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {entries.map(([p, s]) => (
            <div
              key={p}
              className={cn(
                "group flex items-center gap-2 border-b border-line px-3 py-1.5",
                p === current && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
              )}
            >
              <span
                className="num w-3 text-center text-[13px] font-semibold"
                style={{ color: SIGN[s.kind].color }}
              >
                {SIGN[s.kind].sign}
              </span>
              <button className="min-w-0 flex-1 cursor-default text-left" onClick={() => setSel(p)}>
                <span className="num block truncate text-[12px]">{p.split("/").pop()}</span>
                <span className="num block truncate text-[10.5px] text-faint">
                  {s.kind === "rename" ? `${s.from} → ${p}` : p}
                </span>
              </button>
              <button
                className="cursor-default text-faint opacity-0 group-hover:opacity-100 hover:text-text"
                title={t("changes.unstage")}
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
        <div className="space-y-2.5 border-t border-line-strong p-3">
          <div>
            <Label>{t("changes.message")}</Label>
            <textarea
              value={message}
              rows={3}
              onChange={(e) => (setMessage(e.target.value), setTouched(true))}
              className="w-full resize-y rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2.5 py-2 text-[12.5px] outline-none focus:border-accent"
            />
          </div>
          <Segmented<"same" | "new">
            size="sm"
            className="w-full"
            value={target}
            onChange={setTarget}
            options={[
              { value: "same", label: t("changes.toBranch", { branch }) },
              { value: "new", label: t("changes.toNew") },
            ]}
          />
          {target === "new" && (
            <>
              <Input
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value.replace(/\s+/g, "-"))}
                placeholder="fix/typo"
                className="num !h-8"
              />
              <Checkbox
                checked={openPr}
                onChange={setOpenPr}
                label={<span className="text-[12px]">{t("changes.openPr", { base: branch })}</span>}
              />
            </>
          )}
          <Button
            variant="primary"
            className="w-full"
            icon={target === "new" ? (openPr ? GitPullRequest : GitBranchPlus) : GitCommitHorizontal}
            loading={busy}
            disabled={!message.trim() || !branchOk || (target === "new" && !newBranch.trim())}
            onClick={() => void save()}
          >
            {target === "new"
              ? openPr
                ? t("changes.savePr")
                : t("changes.saveNew")
              : t("changes.save", { count: entries.length })}
          </Button>
          <p className="text-[11px] text-faint">{t("changes.oneCommit")}</p>
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-auto">
        <Diff
          key={`${keyOf(repo, branch)}:${current}`}
          repo={repo}
          path={current}
          s={staged[current]}
          items={items}
        />
      </div>
    </div>
  );
}

function Diff({ repo, path, s, items }: { repo: string; path: string; s: Staged; items: TreeItem[] }) {
  const { t } = useTranslation("files");
  const src = s.kind === "rename" ? s.from : path;
  const item = items.find((i) => i.path === src);
  const upText = s.kind === "upload" ? uploadText(s.base64) : null;
  const needsOriginal =
    s.kind === "delete" || (s.kind === "rename" && s.text === undefined) || (upText !== null && !!item);
  const blob = useBlob(repo, needsOriginal ? (item?.sha ?? null) : null);
  const [before, after] = useMemo((): [string, string] => {
    if (s.kind === "edit") return [s.original, s.text];
    if (s.kind === "new") return ["", s.text];
    if (s.kind === "rename")
      return s.text !== undefined
        ? [s.original ?? "", s.text]
        : [blob.data?.text ?? "", blob.data?.text ?? ""];
    if (s.kind === "delete") return [blob.data?.text ?? "", ""];
    if (s.kind === "upload" && upText !== null) return [item ? (blob.data?.text ?? "") : "", upText];
    return ["", ""];
  }, [s, blob.data, upText, item]);
  if (s.kind === "upload" && upText === null)
    return <EmptyState title={t("changes.uploadDiff", { size: formatBytes(s.size) })} />;
  if (needsOriginal && blob.isLoading) return <Plotter />;
  const rows = diffRows(diffLines(before, after));
  const same = rows.every((r) => r.kind !== "add" && r.kind !== "del");
  return (
    <div className="num text-[12px] leading-[18px]">
      <div className="sticky top-0 z-10 border-b border-line bg-surface px-3 py-1.5 text-[11.5px] text-dim">
        {s.kind === "rename" ? `${s.from} → ${path}` : path}
        {same && (
          <span className="ml-2 text-faint">
            · {s.kind === "rename" ? t("changes.onlyMoved") : t("changes.noTextChange")}
          </span>
        )}
      </div>
      {rows.map((r, i) =>
        r.kind === "fold" ? (
          <div key={i} className="bg-surface-2 px-3 text-[11px] text-faint">
            ⋯ {t("changes.unchanged", { count: r.count })}
          </div>
        ) : (
          <Line key={i} o={r.o} n={r.n} text={r.text} kind={r.kind === "same" ? undefined : r.kind} />
        ),
      )}
    </div>
  );
}

function Line({ o, n, text, kind }: { o?: number; n?: number; text: string; kind?: "add" | "del" }) {
  return (
    <div
      className={cn(
        "grid grid-cols-[44px_44px_16px_minmax(0,1fr)]",
        kind === "add" && "bg-[color-mix(in_srgb,var(--ok)_12%,transparent)]",
        kind === "del" && "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]",
      )}
    >
      <span className="pr-2 text-right text-faint select-none">{o ?? ""}</span>
      <span className="pr-2 text-right text-faint select-none">{n ?? ""}</span>
      <span
        className={cn(
          "select-none",
          kind === "add" ? "text-ok" : kind === "del" ? "text-danger" : "text-faint",
        )}
      >
        {kind === "add" ? "+" : kind === "del" ? "−" : " "}
      </span>
      <span className="pr-3 whitespace-pre-wrap break-all">{text || " "}</span>
    </div>
  );
}
