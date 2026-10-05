import { DUE_FMT } from "./dates";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ChevronDown,
  Copy,
  ExternalLink,
  Lock,
  LockOpen,
  MessageSquare,
  Milestone as MilestoneIcon,
  Pencil,
  RotateCcw,
  Tag,
  Trash2,
  UserPlus,
} from "lucide-react";
import { commands, unwrap, type Comment, type Issue, type IssuePatch } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { createReconciled, sameBody } from "@/core/data/reconcile";
import { formatDate, formatRelative } from "@/core/i18n/format";
import { useActiveAccount } from "@/core/store/session";
import { toast } from "@/core/store/toasts";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Markdown,
  MarkdownEditor,
  MenuItem,
  Plotter,
  Popover,
  useConfirmClick,
  RelTime,
  useNow,
} from "@/ui";
import { putIssue, useComments, useIssue } from "./api";
import { IssueActions, Reactions, SubIssues, TimelineLine, useTimeline } from "./IssueExtras";
import { IssueStateMark, issueGlyph } from "./IssueState";
import { LabelChip } from "./LabelChip";
import { AssigneePicker, LabelPicker, MilestonePicker } from "./Pickers";
import { parseKey } from "./query";
import { useIssuesUi } from "./store";

async function patchIssue(repo: string, number: number, patch: Partial<IssuePatch>) {
  try {
    const full: IssuePatch = {
      title: null,
      body: null,
      state: null,
      state_reason: null,
      labels: null,
      assignees: null,
      milestone: null,
      clear_milestone: false,
      ...patch,
    };
    putIssue(await unwrap(commands.issuesUpdate(repo, number, full)));
  } catch (e) {
    toastError(e);
  }
}

export function IssueDetail({ issueKey, fallback }: { issueKey: string | null; fallback?: Issue }) {
  const { t } = useTranslation("issues");
  if (!issueKey) {
    return (
      <EmptyState icon={<MessageSquare size={20} />} title={t("detail.none")} body={t("detail.noneHint")} />
    );
  }
  return <DetailBody key={issueKey} issueKey={issueKey} fallback={fallback} />;
}

function DetailBody({ issueKey, fallback }: { issueKey: string; fallback?: Issue }) {
  useNow();
  const { t } = useTranslation(["issues", "common"]);
  const { repo, number } = parseKey(issueKey);
  const { data: issue, isError, error } = useIssue(repo, number, fallback);
  const comments = useComments(repo, number);
  const timeline = useTimeline(repo, number);
  const me = useActiveAccount()?.login;
  const picker = useIssuesUi((s) => s.picker);
  const setUi = useIssuesUi((s) => s.set);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [editingBody, setEditingBody] = useState(false);
  const [body, setBody] = useState("");

  if (isError && !issue) return <EmptyState title={errorMessage(error)} />;
  if (!issue) return <Plotter />;

  const st = issueGlyph(issue);
  const pickerOpen = (k: "labels" | "assignees" | "milestone") => picker?.kind === k;
  const setPicker = (k: "labels" | "assignees" | "milestone") => (v: boolean) =>
    setUi({ picker: v ? { kind: k, n: Date.now() } : null });

  return (
    <div className="flex h-full flex-col">

      <div className="border-b border-line px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 text-[11.5px] text-dim">
          <IssueStateMark issue={issue} />
          <span>{t(`state.${st.key}`)}</span>
          <span className="text-faint">·</span>
          <span className="num">{issue.repo}</span>
          <span className="num text-faint">#{issue.number}</span>
          {issue.locked && <Lock size={11} className="text-warn" aria-label={t("detail.locked")} />}
          <span className="ml-auto flex gap-0.5">
            <IssueActions issue={issue} />
            <IconButton
              icon={Copy}
              label={t("detail.copyLink")}
              onClick={() =>
                navigator.clipboard
                  .writeText(issue.html_url)
                  .then(() => toast({ kind: "success", title: t("detail.linkCopied") }))
              }
            />
            <IconButton
              icon={ExternalLink}
              label={t("detail.openGithub")}
              onClick={() => openUrl(issue.html_url)}
            />
          </span>
        </div>
        {editingTitle ? (
          <form
            className="mt-2 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (title.trim() && title !== issue.title)
                await patchIssue(repo, number, { title: title.trim() });
              setEditingTitle(false);
            }}
          >
            <div className="flex-1">
              <Input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setEditingTitle(false)}
              />
            </div>
            <Button type="submit" variant="primary" size="md">
              {t("common:actions.save")}
            </Button>
          </form>
        ) : (
          <h2
            className="group mt-1.5 cursor-text text-[17px] leading-snug font-semibold tracking-[-0.01em]"
            onDoubleClick={() => (setTitle(issue.title), setEditingTitle(true))}
            data-selectable
          >
            {issue.title}
            <button
              onClick={() => (setTitle(issue.title), setEditingTitle(true))}
              className="ml-2 align-middle text-faint opacity-0 group-hover:opacity-100 cursor-default"
              aria-label={t("detail.editTitle")}
            >
              <Pencil size={13} />
            </button>
          </h2>
        )}
        <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-dim">
          <Avatar src={issue.user.avatar_url} alt={issue.user.login} size={14} />
          <span className="num">{issue.user.login}</span>
          <span>{t("detail.opened", { when: formatRelative(issue.created_at) })}</span>
          {issue.closed_at && (
            <span>· {t("detail.closedAt", { when: formatRelative(issue.closed_at) })}</span>
          )}
        </div>


        <div className="mt-3 grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 text-[12px]">
          <LabelPicker
            repo={repo}
            value={issue.labels.map((l) => l.name)}
            open={pickerOpen("labels")}
            onOpenChange={setPicker("labels")}
            onToggle={(l, on) =>
              patchIssue(repo, number, {
                labels: on
                  ? [...issue.labels.map((x) => x.name), l.name]
                  : issue.labels.map((x) => x.name).filter((n) => n.toLowerCase() !== l.name.toLowerCase()),
              })
            }
            trigger={(p) => <TriageButton {...p} icon={Tag} label={t("detail.labels")} kbd="L" />}
          />
          <div className="flex min-h-7 flex-wrap items-center gap-1">
            {issue.labels.length ? (
              issue.labels.map((l) => <LabelChip key={l.name} label={l} />)
            ) : (
              <span className="text-faint">{t("detail.none_")}</span>
            )}
          </div>
          <AssigneePicker
            repo={repo}
            value={issue.assignees.map((a) => a.login)}
            open={pickerOpen("assignees")}
            onOpenChange={setPicker("assignees")}
            onToggle={(u, on) =>
              patchIssue(repo, number, {
                assignees: on
                  ? [...issue.assignees.map((a) => a.login), u.login]
                  : issue.assignees.map((a) => a.login).filter((x) => x !== u.login),
              })
            }
            trigger={(p) => <TriageButton {...p} icon={UserPlus} label={t("detail.assignees")} kbd="A" />}
          />
          <div className="flex min-h-7 flex-wrap items-center gap-2">
            {issue.assignees.length ? (
              issue.assignees.map((a) => (
                <span key={a.login} className="flex items-center gap-1.5">
                  <Avatar src={a.avatar_url} alt={a.login} size={16} />
                  <span className="num">{a.login}</span>
                </span>
              ))
            ) : (
              <button
                className="text-faint hover:text-accent cursor-default"
                onClick={() => me && patchIssue(repo, number, { assignees: [me] })}
              >
                {t("detail.assignSelf")}
              </button>
            )}
          </div>
          <MilestonePicker
            repo={repo}
            value={issue.milestone?.number ?? null}
            open={pickerOpen("milestone")}
            onOpenChange={setPicker("milestone")}
            onPick={(m) => patchIssue(repo, number, m ? { milestone: m.number } : { clear_milestone: true })}
            trigger={(p) => (
              <TriageButton {...p} icon={MilestoneIcon} label={t("detail.milestone")} kbd="M" />
            )}
          />
          <div className="flex min-h-7 items-center">
            {issue.milestone ? (
              <span className="flex items-center gap-2">
                <span>{issue.milestone.title}</span>
                {issue.milestone.due_on && (
                  <span className="num text-[11px] text-faint">
                    {formatDate(issue.milestone.due_on, DUE_FMT)}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-faint">{t("detail.none_")}</span>
            )}
          </div>
        </div>
      </div>


      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <section className="relative rounded-[var(--radius)] border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-[11.5px] text-dim">
            <span className="flex items-center gap-1.5">
              <span className="num text-text">{issue.user.login}</span>
              {issue.author_association !== "NONE" && (
                <Badge mono>{issue.author_association.toLowerCase()}</Badge>
              )}
            </span>
            {!editingBody && (
              <IconButton
                icon={Pencil}
                label={t("detail.editBody")}
                size={13}
                className="size-6"
                onClick={() => (setBody(issue.body ?? ""), setEditingBody(true))}
              />
            )}
          </div>
          <div className="px-3 py-3">
            {editingBody ? (
              <div className="space-y-2">
                <MarkdownEditor
                  autoFocus
                  value={body}
                  onChange={setBody}
                  minRows={8}
                  onSubmit={async () => (await patchIssue(repo, number, { body }), setEditingBody(false))}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingBody(false)}>
                    {t("common:actions.cancel")}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={async () => (await patchIssue(repo, number, { body }), setEditingBody(false))}
                  >
                    {t("common:actions.save")}
                  </Button>
                </div>
              </div>
            ) : issue.body?.trim() ? (
              <Markdown source={issue.body} />
            ) : (
              <span className="text-[12px] text-faint italic">{t("detail.noBody")}</span>
            )}
          </div>
        </section>

        <Reactions repo={repo} target={`issue/${number}`} known={issue.reactions} />
        <SubIssues issue={issue} />

        {comments.isLoading && <Plotter />}

        {[
          ...(comments.data ?? []).map((c) => ({
            at: c.created_at,
            key: `c${c.id}`,
            node: (
              <CommentCard
                key={`c${c.id}`}
                repo={repo}
                number={number}
                comment={c}
                mine={c.user.login === me}
              />
            ),
          })),
          ...(timeline.data ?? []).map((e) => ({
            at: e.created_at,
            key: `e${e.id}`,
            node: <TimelineLine key={`e${e.id}`} e={e} />,
          })),
        ]
          .sort((a, b) => a.at.localeCompare(b.at))
          .map((x) => x.node)}

        <Composer issue={issue} />
      </div>
    </div>
  );
}

function TriageButton({
  icon: Icon,
  label,
  kbd,
  ...p
}: { icon: typeof Tag; label: string; kbd: string } & React.ButtonHTMLAttributes<HTMLButtonElement> & {
    ref?: React.Ref<HTMLButtonElement>;
  }) {
  return (
    <button
      {...p}
      type="button"
      className="flex h-7 w-[118px] items-center gap-1.5 rounded-[3px] px-1.5 text-left text-dim hover:bg-surface-2 hover:text-text cursor-default"
    >
      <Icon size={13} />
      <span className="annot !text-dim flex-1">{label}</span>
      <span className="num text-[9.5px] text-faint">{kbd}</span>
    </button>
  );
}

function CommentCard({
  repo,
  number,
  comment,
  mine,
}: {
  repo: string;
  number: number;
  comment: Comment;
  mine: boolean;
}) {
  const { t } = useTranslation(["issues", "common"]);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const key = ["issues", "comments", repo, number];

  const save = async () => {
    try {
      const updated = await unwrap(commands.issuesCommentUpdate(repo, comment.id, body));
      qc.setQueryData<Comment[]>(key, (list) => list?.map((c) => (c.id === updated.id ? updated : c)));
      setEditing(false);
    } catch (e) {
      toastError(e);
    }
  };
  const del = useConfirmClick(async () => {
    try {
      await unwrap(commands.issuesCommentDelete(repo, comment.id));
      qc.setQueryData<Comment[]>(key, (list) => list?.filter((c) => c.id !== comment.id));
    } catch (e) {
      toastError(e);
    }
  });

  return (
    <section className="rounded-[var(--radius)] border border-line bg-surface">
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-1.5 text-[11.5px] text-dim">
        <Avatar src={comment.user.avatar_url} alt={comment.user.login} size={16} />
        <span className="num text-text">{comment.user.login}</span>
        {comment.author_association !== "NONE" && (
          <Badge mono>{comment.author_association.toLowerCase()}</Badge>
        )}
        <span title={formatDate(comment.created_at, { dateStyle: "medium", timeStyle: "short" })}>
          <RelTime at={comment.created_at} />
        </span>
        {comment.updated_at !== comment.created_at && (
          <span className="text-faint">· {t("detail.edited")}</span>
        )}
        {mine && !editing && (
          <span className="ml-auto flex items-center gap-0.5">
            <IconButton
              icon={Pencil}
              label={t("detail.editComment")}
              size={13}
              className="size-6"
              onClick={() => setEditing(true)}
            />
            <button
              onClick={del.onClick}
              className="flex h-6 items-center gap-1 rounded-[3px] px-1.5 text-faint hover:text-danger cursor-default"
              aria-label={t("detail.deleteComment")}
            >
              <Trash2 size={13} />
              {del.armed && <span className="text-[11px] text-danger">{t("detail.confirmDelete")}</span>}
            </button>
          </span>
        )}
      </div>
      <div className="px-3 py-3">
        {editing ? (
          <div className="space-y-2">
            <MarkdownEditor autoFocus value={body} onChange={setBody} onSubmit={save} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => (setBody(comment.body), setEditing(false))}>
                {t("common:actions.cancel")}
              </Button>
              <Button variant="primary" size="sm" onClick={save}>
                {t("common:actions.save")}
              </Button>
            </div>
          </div>
        ) : (
          <Markdown source={comment.body} />
        )}
      </div>
      <div className="border-t border-line px-3 py-1.5">
        <Reactions repo={repo} target={`comment/${comment.id}`} />
      </div>
    </section>
  );
}


function Composer({ issue }: { issue: Issue }) {
  const { t } = useTranslation(["issues", "common"]);
  const qc = useQueryClient();
  const me = useActiveAccount()?.login;
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const focus = useIssuesUi((s) => s.focusComposer);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);

  const comment = async () => {
    if (!body.trim()) return true;
    try {
      const c = await createReconciled(
        () => unwrap(commands.issuesCommentCreate(issue.repo, issue.number, body)),
        () => unwrap(commands.issuesComments(issue.repo, issue.number)),
        (c) => c.user.login === me && sameBody(c.body, body),
        (qc.getQueryData<Comment[]>(["issues", "comments", issue.repo, issue.number]) ?? []).map((c) => c.id),
      );
      qc.setQueryData<Comment[]>(["issues", "comments", issue.repo, issue.number], (l) => [...(l ?? []), c]);
      putIssue({ ...issue, comments: issue.comments + 1 });
      setBody("");
      return true;
    } catch (e) {
      toastError(e);
      return false;
    }
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const close = (reason: "completed" | "not_planned") =>
    run(
      async () =>
        (await comment()) && patchIssue(issue.repo, issue.number, { state: "closed", state_reason: reason }),
    );
  const open = issue.state === "open";

  return (
    <section className="space-y-2 pt-2">
      <MarkdownEditor
        textareaRef={ref}
        value={body}
        onChange={setBody}
        placeholder={t("composer.placeholder")}
        onSubmit={() => run(comment)}
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          icon={issue.locked ? LockOpen : Lock}
          onClick={() =>
            run(async () => {
              try {
                await unwrap(commands.issuesSetLocked(issue.repo, issue.number, !issue.locked));
                putIssue({ ...issue, locked: !issue.locked });
              } catch (e) {
                toastError(e);
              }
            })
          }
        >
          {issue.locked ? t("composer.unlock") : t("composer.lock")}
        </Button>
        <span className="flex-1" />
        {open ? (
          <div className="flex">
            <Button size="sm" className="rounded-r-none" disabled={busy} onClick={() => close("completed")}>
              {body.trim() ? t("composer.closeWithComment") : t("composer.close")}
            </Button>
            <Popover
              placement="top-end"
              trigger={(p) => (
                <Button
                  {...p}
                  size="sm"
                  className="-ml-px rounded-l-none px-1.5"
                  aria-label={t("composer.closeAs")}
                >
                  <ChevronDown size={13} />
                </Button>
              )}
            >
              {(c) => (
                <>
                  <MenuItem onClick={() => (c(), close("completed"))}>
                    {t("composer.closeCompleted")}
                  </MenuItem>
                  <MenuItem onClick={() => (c(), close("not_planned"))}>
                    {t("composer.closeNotPlanned")}
                  </MenuItem>
                </>
              )}
            </Popover>
          </div>
        ) : (
          <Button
            size="sm"
            icon={RotateCcw}
            disabled={busy}
            onClick={() =>
              run(async () => (await comment()) && patchIssue(issue.repo, issue.number, { state: "open" }))
            }
          >
            {t("composer.reopen")}
          </Button>
        )}
        <Button
          size="sm"
          variant="primary"
          icon={MessageSquare}
          loading={busy}
          disabled={!body.trim()}
          onClick={() => run(comment)}
        >
          {t("composer.comment")}
        </Button>
      </div>
    </section>
  );
}
