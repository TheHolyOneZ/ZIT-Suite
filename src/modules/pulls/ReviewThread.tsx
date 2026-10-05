import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Trash2 } from "lucide-react";
import { commands, unwrap, type ReviewComment } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { createReconciled, sameBody } from "@/core/data/reconcile";
import { useActiveAccount } from "@/core/store/session";

import { Avatar, Button, IconButton, Markdown, MarkdownEditor, useConfirmClick, RelTime } from "@/ui";
import { toast } from "@/core/store/toasts";
import { refreshPull, usePull } from "./api";
import { applySuggestion, findSuggestion } from "./suggestion";
import type { Thread } from "./threads";

const key = (repo: string, number: number) => ["pulls", "reviewComments", repo, number];


export function ReviewThread({
  repo,
  number,
  thread,
  outdated,
}: {
  repo: string;
  number: number;
  thread: Thread;
  outdated?: boolean;
}) {
  const { t } = useTranslation(["pulls", "common"]);
  const qc = useQueryClient();
  const me = useActiveAccount()?.login;
  const [replying, setReplying] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const reply = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const c = await createReconciled(
        () => unwrap(commands.pullsReviewCommentReply(repo, number, thread.root.id, body)),
        () => unwrap(commands.pullsReviewComments(repo, number)),
        (c) => c.user.login === me && c.in_reply_to_id === thread.root.id && sameBody(c.body, body),
        (qc.getQueryData<ReviewComment[]>(key(repo, number)) ?? []).map((c) => c.id),
      );
      qc.setQueryData<ReviewComment[]>(key(repo, number), (l) => [...(l ?? []), c]);
      setBody("");
      setReplying(false);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="my-1.5 ml-[104px] mr-4 overflow-hidden rounded-[var(--radius)] border border-line-strong bg-surface font-sans shadow-[0_1px_0_var(--line)]"
      style={{ whiteSpace: "normal" }}
    >
      {outdated && (
        <div className="annot border-b border-line bg-surface-2 px-3 py-1 !text-[9.5px]">
          {t("review.outdatedAt", { line: thread.root.original_line ?? "?" })}
        </div>
      )}
      {[thread.root, ...thread.replies].map((c) => (
        <CommentRow key={c.id} repo={repo} number={number} c={c} />
      ))}
      <div className="border-t border-line px-3 py-2">
        {replying ? (
          <div className="space-y-2">
            <MarkdownEditor
              autoFocus
              value={body}
              onChange={setBody}
              minRows={3}
              onSubmit={reply}
              placeholder={t("review.replyPlaceholder")}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>
                {t("common:actions.cancel")}
              </Button>
              <Button size="sm" variant="primary" loading={busy} disabled={!body.trim()} onClick={reply}>
                {t("review.reply")}
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setReplying(true)}
            className="h-7 w-full rounded-[3px] border border-line bg-surface-2 px-2 text-left text-[12px] text-faint hover:border-line-strong cursor-text"
          >
            {t("review.replyPlaceholder")}
          </button>
        )}
      </div>
    </div>
  );
}

function CommentRow({ repo, number, c }: { repo: string; number: number; c: ReviewComment }) {
  const { t } = useTranslation(["pulls", "common"]);
  const qc = useQueryClient();
  const me = useActiveAccount()?.login;
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(c.body);
  const save = async () => {
    try {
      const u = await unwrap(commands.pullsReviewCommentUpdate(repo, c.id, body));
      qc.setQueryData<ReviewComment[]>(key(repo, number), (l) => l?.map((x) => (x.id === u.id ? u : x)));
      setEditing(false);
    } catch (e) {
      toastError(e);
    }
  };
  const del = useConfirmClick(async () => {
    try {
      await unwrap(commands.pullsReviewCommentDelete(repo, c.id));
      qc.setQueryData<ReviewComment[]>(key(repo, number), (l) => l?.filter((x) => x.id !== c.id));
    } catch (e) {
      toastError(e);
    }
  });
  return (
    <div className="border-b border-line px-3 py-2 last:border-b-0">
      <div className="flex items-center gap-1.5 text-[11.5px] text-dim">
        <Avatar src={c.user.avatar_url} alt={c.user.login} size={16} />
        <span className="num text-text">{c.user.login}</span>
        <span>
          <RelTime at={c.created_at} />
        </span>
        {c.start_line && c.line && c.start_line !== c.line && (
          <span className="num text-faint">
            · L{c.start_line}–{c.line}
          </span>
        )}
        {c.user.login === me && !editing && (
          <span className="ml-auto flex items-center">
            <IconButton
              icon={Pencil}
              label={t("review.edit")}
              size={12}
              className="size-6"
              onClick={() => setEditing(true)}
            />
            <button
              onClick={del.onClick}
              className="flex h-6 items-center gap-1 px-1 text-faint hover:text-danger cursor-default"
              aria-label={t("review.delete")}
            >
              <Trash2 size={12} />
              {del.armed && <span className="text-[10.5px] text-danger">?</span>}
            </button>
          </span>
        )}
      </div>
      <div className="mt-1">
        {editing ? (
          <div className="space-y-2">
            <MarkdownEditor autoFocus value={body} onChange={setBody} minRows={3} onSubmit={save} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => (setBody(c.body), setEditing(false))}>
                {t("common:actions.cancel")}
              </Button>
              <Button size="sm" variant="primary" onClick={save}>
                {t("common:actions.save")}
              </Button>
            </div>
          </div>
        ) : (
          <CommentBody repo={repo} number={number} c={c} />
        )}
      </div>
    </div>
  );
}


function CommentBody({ repo, number, c }: { repo: string; number: number; c: ReviewComment }) {
  const { t } = useTranslation("pulls");
  const pr = usePull(repo, number).data;
  const [busy, setBusy] = useState(false);
  const s = findSuggestion(c.body);
  if (!s) return <Markdown source={c.body} className="text-[12.5px]" />;

  const sameRepo = !!pr && pr.head.label.split(":")[0] === repo.split("/")[0];
  const canApply = !!pr && pr.state === "open" && sameRepo && c.side === "RIGHT" && c.line != null;
  const apply = async () => {
    if (!pr || c.line == null) return;
    setBusy(true);
    try {
      const branch = pr.head.ref;
      const tree = await unwrap(commands.filesTree(repo, branch, true));
      const item = tree.items.find((i) => i.path === c.path);
      const blob = item ? await unwrap(commands.filesBlob(repo, item.sha)) : null;
      if (blob?.text == null) throw new Error(t("suggest.noFile"));
      const next = applySuggestion(blob.text, c.start_line ?? c.line, c.line, s.code);
      await unwrap(
        commands.filesCommit(repo, branch, tree.commit, false, t("suggest.message", { path: c.path }), [
          { kind: "text", path: c.path, text: next, executable: null },
        ]),
      );
      toast({ kind: "success", title: t("suggest.applied") });
      await refreshPull(repo, number);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1.5">
      {s.before && <Markdown source={s.before} className="text-[12.5px]" />}
      <div className="overflow-hidden rounded-[var(--radius)] border border-line">
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-2 py-1 text-[11px] text-dim">
          <span className="flex-1">{t("suggest.title")}</span>
          {canApply ? (
            <Button size="sm" variant="secondary" icon={Check} loading={busy} onClick={() => void apply()}>
              {t("suggest.apply")}
            </Button>
          ) : (
            <span className="text-faint">{t("suggest.cantApply")}</span>
          )}
        </div>
        <pre className="num overflow-x-auto bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-2 py-1 text-[12px] whitespace-pre">
          {s.code || t("suggest.deleteLines")}
        </pre>
      </div>
      {s.after && <Markdown source={s.after} className="text-[12.5px]" />}
    </div>
  );
}
