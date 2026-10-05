import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  FilePen,
  ListPlus,
  MessageSquarePlus,
  MessagesSquare,
  X,
} from "lucide-react";
import { commands, unwrap, type ReviewComment } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { createReconciled, sameBody } from "@/core/data/reconcile";
import { useActiveAccount } from "@/core/store/session";
import { useHotkeys } from "@/core/keyboard";
import { sheets, type SheetParams } from "@/core/sheets/store";

import { cn } from "@/core/cn";
import { Badge, Button, EmptyState, IconButton, Kbd, MarkdownEditor, Plotter } from "@/ui";
import { usePull, usePullFiles, useReviewComments } from "./api";
import { parsePatch, type DiffRow } from "./diff";
import { FILE_STATUS } from "./PullSheet";
import { ReviewThread } from "./ReviewThread";
import { noDrafts, prKey, useReviewDrafts } from "./drafts";
import { suggestionBlock } from "./suggestion";
import { anchorKey, buildThreads, type Thread } from "./threads";

type Side = "LEFT" | "RIGHT";
interface Draft {
  side: Side;
  line: number;
  start: number | null;
}


function anchorOf(r: DiffRow): { side: Side; line: number } | null {
  if (r.kind === "del" && r.oldNo != null) return { side: "LEFT", line: r.oldNo };
  if ((r.kind === "add" || r.kind === "ctx") && r.newNo != null) return { side: "RIGHT", line: r.newNo };
  return null;
}


export function FileDiffSheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["pulls", "common"]);
  const qc = useQueryClient();
  const repo = String(params.repo);
  const number = Number(params.number);
  const { data, isLoading } = usePullFiles(repo, number);
  const pr = usePull(repo, number).data;
  const comments = useReviewComments(repo, number);
  const idx = data?.findIndex((f) => f.filename === params.filename) ?? -1;
  const file = idx >= 0 ? data![idx] : undefined;
  const rows = useMemo(() => (file?.patch ? parsePatch(file.patch) : []), [file]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const me = useActiveAccount()?.login;
  const pending = useReviewDrafts((s) => s.pending[prKey(repo, number)] ?? noDrafts);
  const drafts = useReviewDrafts();

  const { anchored, outdated } = useMemo(() => {
    const mine = (comments.data ?? []).filter((c) => c.path === file?.filename);
    const threads = buildThreads(mine);
    const anchored = new Map<string, Thread[]>();
    const outdated: Thread[] = [];
    for (const th of threads) {
      if (th.root.line == null) outdated.push(th);
      else {
        const k = anchorKey(th.root.side, th.root.line);
        anchored.set(k, [...(anchored.get(k) ?? []), th]);
      }
    }
    return { anchored, outdated };
  }, [comments.data, file?.filename]);

  const go = (d: number) => {
    const next = data?.[idx + d];
    if (next)
      sheets.push("pulls", "file", {
        repo,
        number,
        filename: next.filename,
        title: next.filename.slice(next.filename.lastIndexOf("/") + 1),
      });
  };
  useHotkeys({ "[": () => go(-1), "]": () => go(1) });

  const pick = (a: { side: Side; line: number }, extend: boolean) => {
    if (extend && draft && draft.side === a.side && draft.line !== a.line) {
      const lo = Math.min(draft.start ?? draft.line, a.line);
      const hi = Math.max(draft.line, a.line);
      setDraft({ side: a.side, line: hi, start: lo });
    } else setDraft({ ...a, start: null });
  };

  const inRange = (r: DiffRow) => {
    if (!draft) return false;
    const n = draft.side === "LEFT" ? (r.kind === "add" ? null : r.oldNo) : r.kind === "del" ? null : r.newNo;
    return n != null && n >= (draft.start ?? draft.line) && n <= draft.line;
  };

  const submit = async () => {
    if (!draft || !body.trim() || !pr || !file) return;
    setBusy(true);
    try {
      const c = await createReconciled(
        () =>
          unwrap(
            commands.pullsReviewCommentCreate(repo, number, {
              body,
              commit_id: pr.head.sha,
              path: file.filename,
              line: draft.line,
              side: draft.side,
              start_line: draft.start,
            }),
          ),
        () => unwrap(commands.pullsReviewComments(repo, number)),
        (c) =>
          c.user.login === me &&
          c.path === file.filename &&
          c.side === draft.side &&
          c.line === draft.line &&
          sameBody(c.body, body),
        (comments.data ?? []).map((c) => c.id),
      );
      qc.setQueryData<ReviewComment[]>(["pulls", "reviewComments", repo, number], (l) => [...(l ?? []), c]);
      setDraft(null);
      setBody("");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };


  const suggest = () => {
    if (!draft || draft.side !== "RIGHT") return;
    const from = draft.start ?? draft.line;
    const lines = rows
      .filter(
        (r) =>
          r.kind !== "del" &&
          r.kind !== "hunk" &&
          r.newNo != null &&
          r.newNo >= from &&
          r.newNo <= draft.line,
      )
      .map((r) => r.text);
    setBody((b) => `${b ? `${b}\n\n` : ""}${suggestionBlock(lines)}`);
  };
  const addToReview = () => {
    if (!draft || !body.trim() || !file) return;
    drafts.add(prKey(repo, number), {
      path: file.filename,
      line: draft.line,
      side: draft.side,
      start_line: draft.start,
      body,
    });
    setDraft(null);
    setBody("");
  };

  if (isLoading) return <Plotter />;
  if (!file) return <EmptyState title={t("files.gone")} />;
  const st = FILE_STATUS[file.status] ?? FILE_STATUS.changed;
  const threadCount = [...anchored.values()].reduce((a, l) => a + l.length, 0) + outdated.length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-line-strong bg-surface px-5 py-3">
        <Badge tone={st.tone} mono>
          {st.letter}
        </Badge>
        <span className="num min-w-0 flex-1 truncate text-[12.5px]" data-selectable>
          {file.filename}
        </span>
        {threadCount > 0 && (
          <span className="num flex items-center gap-1 text-[11px] text-dim">
            <MessagesSquare size={12} />
            {threadCount}
          </span>
        )}
        <span className="num text-[11.5px] text-ok">+{file.additions}</span>
        <span className="num text-[11.5px] text-danger">−{file.deletions}</span>
        <span className="num text-[11px] text-faint">
          {idx + 1}/{data!.length}
        </span>
        <IconButton icon={ChevronLeft} label={t("files.prev")} disabled={idx <= 0} onClick={() => go(-1)} />
        <IconButton
          icon={ChevronRight}
          label={t("files.next")}
          disabled={idx >= data!.length - 1}
          onClick={() => go(1)}
        />
        <span className="flex gap-1">
          <Kbd>[</Kbd>
          <Kbd>]</Kbd>
        </span>
      </header>
      {!file.patch ? (
        <EmptyState title={t("files.noPatch")} body={t("files.noPatchHint")} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto bg-surface" data-selectable>
          {outdated.length > 0 && (
            <div className="border-b border-line py-1">
              {outdated.map((th) => (
                <ReviewThread key={th.root.id} repo={repo} number={number} thread={th} outdated />
              ))}
            </div>
          )}
          <table className="num w-full border-collapse text-[12px] leading-[1.55]">
            <tbody>
              {rows.map((r, i) => {
                const a = anchorOf(r);
                const threads = a
                  ? [
                      ...(anchored.get(anchorKey(a.side, a.line)) ?? []),
                      ...(r.kind === "ctx" && r.oldNo != null
                        ? (anchored.get(anchorKey("LEFT", r.oldNo)) ?? [])
                        : []),
                    ]
                  : [];
                const isDraftEnd = !!draft && !!a && a.side === draft.side && a.line === draft.line;
                return (
                  <Fragment key={i}>
                    {r.kind === "hunk" ? (
                      <tr className="bg-[color-mix(in_srgb,var(--info)_9%,transparent)] text-info">
                        <td colSpan={5} className="px-3 py-1 text-[11px]">
                          {r.text}
                        </td>
                      </tr>
                    ) : (
                      <tr
                        className={cn(
                          "group",
                          r.kind === "add" && "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)]",
                          r.kind === "del" && "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]",
                          r.kind === "meta" && "text-faint italic",
                          inRange(r) &&
                            "shadow-[inset_3px_0_0_var(--accent)] !bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]",
                        )}
                      >
                        <td className="w-6 text-center select-none">
                          {a && (
                            <button
                              onClick={(e) => pick(a, e.shiftKey)}
                              title={t("review.addHint")}
                              className="flex size-5 items-center justify-center rounded-[3px] bg-accent text-accent-fg opacity-0 group-hover:opacity-100 cursor-default"
                            >
                              <MessageSquarePlus size={11} />
                            </button>
                          )}
                        </td>
                        <td className="w-12 border-r border-line px-2 text-right text-faint select-none">
                          {r.oldNo ?? ""}
                        </td>
                        <td className="w-12 border-r border-line px-2 text-right text-faint select-none">
                          {r.newNo ?? ""}
                        </td>
                        <td
                          className={cn(
                            "w-5 text-center select-none",
                            r.kind === "add" ? "text-ok" : r.kind === "del" ? "text-danger" : "text-faint",
                          )}
                        >
                          {r.kind === "add" ? "+" : r.kind === "del" ? "−" : ""}
                        </td>
                        <td className="pr-4 whitespace-pre text-text">{r.text}</td>
                      </tr>
                    )}
                    {threads.length > 0 && (
                      <tr>
                        <td colSpan={5} className="bg-bg py-0.5">
                          {threads.map((th) => (
                            <ReviewThread key={th.root.id} repo={repo} number={number} thread={th} />
                          ))}
                        </td>
                      </tr>
                    )}
                    {a &&
                      file &&
                      pending
                        .filter((d) => d.path === file.filename && d.side === a.side && d.line === a.line)
                        .map((d) => (
                          <tr key={d.id}>
                            <td colSpan={5} className="bg-bg py-1">
                              <div
                                className="mr-4 ml-[104px] flex items-start gap-2 rounded-[var(--radius)] border border-dashed border-accent px-3 py-2 font-sans text-[12.5px]"
                                style={{ whiteSpace: "pre-wrap" }}
                              >
                                <span className="annot !text-[9.5px] text-accent">{t("batch.pending")}</span>
                                <span className="min-w-0 flex-1">{d.body}</span>
                                <IconButton
                                  icon={X}
                                  label={t("batch.remove")}
                                  size={12}
                                  className="size-6"
                                  onClick={() => drafts.remove(prKey(repo, number), d.id)}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                    {isDraftEnd && (
                      <tr>
                        <td colSpan={5} className="bg-bg py-2">
                          <div
                            className="mr-4 ml-[104px] space-y-2 font-sans"
                            style={{ whiteSpace: "normal" }}
                          >
                            <div className="annot !text-[9.5px]">
                              {draft!.start
                                ? t("review.onRange", {
                                    from: draft!.start,
                                    to: draft!.line,
                                    side: t(`review.side.${draft!.side}`),
                                  })
                                : t("review.onLine", {
                                    line: draft!.line,
                                    side: t(`review.side.${draft!.side}`),
                                  })}
                            </div>
                            <MarkdownEditor
                              autoFocus
                              value={body}
                              onChange={setBody}
                              minRows={3}
                              onSubmit={submit}
                              placeholder={t("review.placeholder")}
                            />
                            <div className="flex items-center justify-end gap-2">
                              <span className="mr-auto text-[11px] text-faint">{t("review.rangeHint")}</span>
                              {draft!.side === "RIGHT" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={FilePen}
                                  onClick={suggest}
                                  title={t("suggest.insertHint")}
                                >
                                  {t("suggest.insert")}
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => (setDraft(null), setBody(""))}>
                                {t("common:actions.cancel")}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                icon={ListPlus}
                                disabled={!body.trim()}
                                onClick={addToReview}
                                title={t("batch.addHint")}
                              >
                                {t("batch.add")}
                              </Button>
                              <Button
                                size="sm"
                                variant="primary"
                                loading={busy}
                                disabled={!body.trim() || !pr}
                                onClick={submit}
                              >
                                {t("review.add")}
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
