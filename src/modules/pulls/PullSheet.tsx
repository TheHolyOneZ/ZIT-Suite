import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  Hourglass,
  ListChecks,
  MessageSquare,
  Milestone as MilestoneIcon,
  Pencil,
  RefreshCcw,
  RotateCcw,
  Tag,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  commands,
  unwrap,
  type Comment,
  type IssuePatch,
  type MergeMethod,
  type Pull,
  type PullSummary,
  type Review,
  type ReviewComment,
} from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { createReconciled, sameBody } from "@/core/data/reconcile";
import { formatDate, formatRelative } from "@/core/i18n/format";

import { sheets, useTopSheet, type SheetParams } from "@/core/sheets/store";
import { useActiveAccount } from "@/core/store/session";
import { toast } from "@/core/store/toasts";
import { cn } from "@/core/cn";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Mark,
  Markdown,
  MarkdownEditor,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  Plotter,
  Popover,
  type Glyph,
  type Tone,
  RelTime,
  useNow,
  TabBar,
  type TabDef,
} from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { useComments } from "@/modules/issues/api";
import { LabelChip } from "@/modules/issues/LabelChip";
import { AssigneePicker, LabelPicker, MilestonePicker } from "@/modules/issues/Pickers";
import {
  refreshPull,
  useChecks,
  useMergeSettings,
  usePull,
  usePullCommits,
  usePullFiles,
  usePullReviews,
  useReviewComments,
} from "./api";
import { noDrafts, prKey, useReviewDrafts } from "./drafts";
import { PullStateMark, pullStateKey } from "./PullMarks";
import { usePullsPrefs } from "./store";

export function openPull(p: Pick<PullSummary, "repo" | "number" | "title">) {
  sheets.push("pulls", "pull", { repo: p.repo, number: p.number, title: p.title });
}

const blankPatch: IssuePatch = {
  title: null,
  body: null,
  state: null,
  state_reason: null,
  labels: null,
  assignees: null,
  milestone: null,
  clear_milestone: false,
};

async function act(fn: () => Promise<unknown>, repo: string, number: number) {
  try {
    await fn();
    await refreshPull(repo, number);
  } catch (e) {
    toastError(e);
  }
}

type Tab = "conversation" | "files" | "commits" | "checks";

export function PullSheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["pulls", "common"]);
  const repo = String(params.repo);
  const number = Number(params.number);
  const { data: pr, isError, error } = usePull(repo, number);
  const [tab, setTab] = useState<Tab>("conversation");

  if (isError && !pr) return <EmptyState title={errorMessage(error)} />;
  if (!pr) return <Plotter />;

  const tabs: TabDef<Tab>[] = [
    { id: "conversation", icon: MessageSquare, label: t("tabs.conversation"), count: pr.comments },
    { id: "files", icon: FileDiff, label: t("tabs.files"), count: pr.changed_files },
    { id: "commits", icon: GitCommitHorizontal, label: t("tabs.commits"), count: pr.commits },
    { id: "checks", icon: ListChecks, label: t("tabs.checks") },
  ];

  return (
    <div className="flex h-full flex-col">
      <PullHeader pr={pr} />
      <TabBar tabs={tabs} value={tab} onChange={setTab} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "conversation" && <Conversation pr={pr} />}
        {tab === "files" && <FilesTab pr={pr} />}
        {tab === "commits" && <CommitsTab pr={pr} />}
        {tab === "checks" && <ChecksTab pr={pr} />}
      </div>
    </div>
  );
}

function PullHeader({ pr }: { pr: Pull }) {
  useNow();
  const { t } = useTranslation(["pulls", "common"]);
  const me = useActiveAccount()?.login;
  const preferred = usePullsPrefs((s) => s.mergeMethod);
  const settings = useMergeSettings(pr.repo).data;
  const allowed = (m: MergeMethod) => !settings || settings[m];

  const mergeMethod = allowed(preferred)
    ? preferred
    : ((["squash", "merge", "rebase"] as const).find(allowed) ?? preferred);
  const setPrefs = usePullsPrefs((s) => s.set);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(pr.title);
  const checks = useChecks(pr.repo, pr.head.sha);
  const state = pullStateKey(pr);
  const open = pr.state === "open";
  const r = (fn: () => Promise<unknown>) => act(fn, pr.repo, pr.number);
  const patchIssue = (patch: Partial<IssuePatch>) =>
    r(() => unwrap(commands.issuesUpdate(pr.repo, pr.number, { ...blankPatch, ...patch })));

  const runs = checks.data ?? [];
  const failed = runs.filter(
    (c) => c.conclusion && ["failure", "timed_out", "cancelled", "action_required"].includes(c.conclusion),
  ).length;
  const running = runs.filter((c) => c.status !== "completed").length;
  const passed = runs.filter(
    (c) => c.conclusion === "success" || c.conclusion === "skipped" || c.conclusion === "neutral",
  ).length;
  const checksCell: { glyph: Glyph; tone: Tone; text: string } =
    runs.length === 0
      ? { glyph: "pending", tone: "idle", text: t("checks.none") }
      : failed
        ? { glyph: "cross", tone: "danger", text: t("checks.summaryFailed", { failed, total: runs.length }) }
        : running
          ? {
              glyph: "running",
              tone: "accent",
              text: t("checks.summaryRunning", { running, total: runs.length }),
            }
          : { glyph: "tick", tone: "ok", text: t("checks.summaryPassed", { passed, total: runs.length }) };

  const mergeCell: { glyph: Glyph; tone: Tone; text: string } = pr.merged
    ? { glyph: "merge", tone: "done", text: t("merge.merged") }
    : pr.auto_merge
      ? {
          glyph: "hourglass",
          tone: "accent",
          text: t("autoMerge.on", {
            method: t(`merge.methods.${(pr.auto_merge_method ?? "MERGE").toLowerCase() as MergeMethod}`),
          }),
        }
      : !open
        ? { glyph: "notPlanned", tone: "idle", text: t("state.closed") }
        : pr.mergeable === false || pr.mergeable_state === "dirty"
          ? { glyph: "warn", tone: "danger", text: t("merge.conflicts") }
          : pr.mergeable_state === "behind"
            ? { glyph: "warn", tone: "warn", text: t("merge.behind") }
            : pr.mergeable_state === "blocked"
              ? { glyph: "block", tone: "warn", text: t("merge.blocked") }
              : pr.mergeable_state === "clean" ||
                  pr.mergeable_state === "unstable" ||
                  pr.mergeable_state === "has_hooks"
                ? { glyph: "tick", tone: "ok", text: t("merge.clean") }
                : { glyph: "running", tone: "idle", text: t("merge.computing") };

  const queueMerge = (method: MergeMethod) => {
    setPrefs({ mergeMethod: method });
    useQueue
      .getState()
      .requestRun([{ repo: pr.repo, action: { kind: "pr_merge", number: pr.number, method } }]);
  };

  return (
    <header className="shrink-0 border-b border-line-strong bg-surface px-6 pt-4 pb-3">
      <div className="flex items-center gap-2 text-[11.5px] text-dim">
        <PullStateMark pull={pr} />
        <span>{t(`state.${state}`)}</span>
        <span className="text-faint">·</span>
        <span className="num">{pr.repo}</span>
        <span className="num text-faint">#{pr.number}</span>
        <span className="ml-2 flex items-center gap-1">
          <BranchChip name={pr.head.ref} />
          <ArrowRight size={11} className="text-faint" />
          <BranchChip name={pr.base.ref} />
        </span>
        <span className="ml-auto flex gap-0.5">
          <IconButton
            icon={Copy}
            label={t("detail.copyLink")}
            onClick={() =>
              navigator.clipboard
                .writeText(pr.html_url)
                .then(() => toast({ kind: "success", title: t("detail.linkCopied") }))
            }
          />
          <IconButton
            icon={ExternalLink}
            label={t("detail.openGithub")}
            onClick={() => openUrl(pr.html_url)}
          />
        </span>
      </div>

      {editing ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (title.trim() && title !== pr.title)
              await r(() => unwrap(commands.pullsUpdate(pr.repo, pr.number, title.trim(), null, null)));
            setEditing(false);
          }}
        >
          <div className="flex-1">
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (e.preventDefault(), setEditing(false))}
            />
          </div>
          <Button type="submit" variant="primary">
            {t("common:actions.save")}
          </Button>
        </form>
      ) : (
        <h2
          className="group mt-1.5 text-[18px] leading-snug font-semibold tracking-[-0.01em]"
          onDoubleClick={() => (setTitle(pr.title), setEditing(true))}
          data-selectable
        >
          {pr.title}
          <button
            onClick={() => (setTitle(pr.title), setEditing(true))}
            className="ml-2 align-middle text-faint opacity-0 group-hover:opacity-100 cursor-default"
            aria-label={t("detail.editTitle")}
          >
            <Pencil size={13} />
          </button>
        </h2>
      )}
      <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-dim">
        <Avatar src={pr.user.avatar_url} alt={pr.user.login} size={14} />
        <span className="num">{pr.user.login}</span>
        <span>{t("detail.opened", { when: formatRelative(pr.created_at) })}</span>
        {pr.merged_at && (
          <span>
            ·{" "}
            {t("detail.mergedBy", { login: pr.merged_by?.login ?? "?", when: formatRelative(pr.merged_at) })}
          </span>
        )}
      </div>


      <div className="mt-3 grid grid-cols-4 border-t border-l border-line">
        <StatusCell label={t("strip.checks")} {...checksCell} />
        <StatusCell
          label={t("strip.review")}
          glyph={pr.requested_reviewers.length ? "pending" : "equal"}
          tone="idle"
          text={
            pr.requested_reviewers.length
              ? t("strip.awaiting", { count: pr.requested_reviewers.length })
              : t("strip.noRequests")
          }
        />
        <StatusCell label={t("strip.merge")} {...mergeCell} />
        <div className="border-r border-b border-line px-3 py-2">
          <div className="annot !text-[9.5px]">{t("strip.diff")}</div>
          <div className="num mt-0.5 flex items-center gap-2 text-[12.5px]">
            <span className="text-ok">+{pr.additions}</span>
            <span className="text-danger">−{pr.deletions}</span>
            <span className="text-faint">· {t("strip.files", { count: pr.changed_files })}</span>
          </div>
        </div>
      </div>


      <div className="mt-3 flex flex-wrap items-center gap-2">
        {open && !pr.merged && (
          <div className="flex">
            <Button
              variant="primary"
              icon={GitMerge}
              className="rounded-r-none"
              disabled={pr.draft}
              onClick={() => queueMerge(mergeMethod)}
            >
              {t(`merge.methods.${mergeMethod}`)}
            </Button>
            <Popover
              placement="bottom-start"
              trigger={(p) => (
                <Button
                  {...p}
                  variant="primary"
                  className="-ml-px rounded-l-none px-1.5"
                  disabled={pr.draft}
                  aria-label={t("merge.choose")}
                >
                  <ChevronDown size={13} />
                </Button>
              )}
            >
              {(c) => (
                <>
                  {(["squash", "merge", "rebase"] as const).map((m) => (
                    <MenuItem
                      key={m}
                      active={m === mergeMethod}
                      disabled={!allowed(m)}
                      trailing={m === mergeMethod ? <Check size={13} className="text-accent" /> : null}
                      onClick={() => (c(), queueMerge(m))}
                    >
                      <span className="flex flex-col">
                        <span>{t(`merge.methods.${m}`)}</span>
                        <span className="text-[11px] text-faint">
                          {allowed(m) ? t(`merge.hints.${m}`) : t("merge.notAllowed")}
                        </span>
                      </span>
                    </MenuItem>
                  ))}
                  {!pr.auto_merge && (
                    <>
                      <MenuSeparator />
                      <MenuLabel>{t("autoMerge.label")}</MenuLabel>
                      {settings && !settings.auto_merge ? (
                        <MenuItem icon={Hourglass} disabled>
                          <span className="text-[11.5px]">{t("autoMerge.off")}</span>
                        </MenuItem>
                      ) : (
                        (["squash", "merge", "rebase"] as const).filter(allowed).map((m) => (
                          <MenuItem
                            key={`auto-${m}`}
                            icon={Hourglass}
                            onClick={() => (c(), r(() => unwrap(commands.pullsSetAutoMerge(pr.node_id, m))))}
                          >
                            {t("autoMerge.enableWith", { method: t(`merge.methods.${m}`) })}
                          </MenuItem>
                        ))
                      )}
                    </>
                  )}
                </>
              )}
            </Popover>
          </div>
        )}
        {open && pr.auto_merge && (
          <Button
            icon={Hourglass}
            onClick={() => r(() => unwrap(commands.pullsSetAutoMerge(pr.node_id, null)))}
          >
            {t("autoMerge.disable")}
          </Button>
        )}
        {open && pr.mergeable_state === "behind" && (
          <Button
            icon={RefreshCcw}
            onClick={() =>
              r(() =>
                unwrap(
                  commands.queueSubmit(
                    [{ repo: pr.repo, action: { kind: "pr_update_branch", number: pr.number } }],
                    0,
                  ),
                ),
              )
            }
          >
            {t("actions.updateBranch")}
          </Button>
        )}
        {open && (
          <Button onClick={() => r(() => unwrap(commands.pullsSetDraft(pr.node_id, !pr.draft)))}>
            {pr.draft ? t("actions.ready") : t("actions.toDraft")}
          </Button>
        )}
        {!pr.merged &&
          (open ? (
            <Button
              variant="ghost"
              icon={X}
              onClick={() =>
                r(() =>
                  unwrap(
                    commands.queueSubmit(
                      [{ repo: pr.repo, action: { kind: "pr_close", number: pr.number } }],
                      0,
                    ),
                  ),
                )
              }
            >
              {t("actions.close")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              icon={RotateCcw}
              onClick={() =>
                r(() =>
                  unwrap(
                    commands.queueSubmit(
                      [{ repo: pr.repo, action: { kind: "pr_reopen", number: pr.number } }],
                      0,
                    ),
                  ),
                )
              }
            >
              {t("actions.reopen")}
            </Button>
          ))}
        <span className="flex-1" />
        <AssigneePicker
          repo={pr.repo}
          value={pr.requested_reviewers.map((u) => u.login)}
          onToggle={(u, on) =>
            r(() => unwrap(commands.pullsRequestReviewers(pr.repo, pr.number, [u.login], !on)))
          }
          trigger={(p) => (
            <TriageChip
              {...p}
              icon={Users}
              label={t("triage.reviewers")}
              users={pr.requested_reviewers}
              disabledLogin={pr.user.login === me ? me : undefined}
            />
          )}
        />
        <LabelPicker
          repo={pr.repo}
          value={pr.labels.map((l) => l.name)}
          onToggle={(l, on) =>
            patchIssue({
              labels: on
                ? [...pr.labels.map((x) => x.name), l.name]
                : pr.labels.map((x) => x.name).filter((n) => n.toLowerCase() !== l.name.toLowerCase()),
            })
          }
          trigger={(p) => (
            <TriageChip {...p} icon={Tag} label={t("triage.labels")} count={pr.labels.length} />
          )}
        />
        <AssigneePicker
          repo={pr.repo}
          value={pr.assignees.map((a) => a.login)}
          onToggle={(u, on) =>
            patchIssue({
              assignees: on
                ? [...pr.assignees.map((a) => a.login), u.login]
                : pr.assignees.map((a) => a.login).filter((x) => x !== u.login),
            })
          }
          trigger={(p) => (
            <TriageChip {...p} icon={UserPlus} label={t("triage.assignees")} users={pr.assignees} />
          )}
        />
        <MilestonePicker
          repo={pr.repo}
          value={pr.milestone?.number ?? null}
          onPick={(m) => patchIssue(m ? { milestone: m.number } : { clear_milestone: true })}
          trigger={(p) => (
            <TriageChip {...p} icon={MilestoneIcon} label={pr.milestone?.title ?? t("triage.milestone")} />
          )}
        />
      </div>
      {pr.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {pr.labels.map((l) => (
            <LabelChip key={l.name} label={l} />
          ))}
        </div>
      )}
    </header>
  );
}

function BranchChip({ name }: { name: string }) {
  return (
    <button
      onClick={() => navigator.clipboard.writeText(name)}
      title={name}
      className="num flex h-[18px] max-w-[180px] items-center gap-1 truncate rounded-[3px] border border-line-strong bg-surface-2 px-1.5 text-[10.5px] text-text hover:border-accent cursor-default"
    >
      <GitBranch size={10} className="shrink-0 text-faint" />
      <span className="truncate">{name}</span>
    </button>
  );
}

function StatusCell({ label, glyph, tone, text }: { label: string; glyph: Glyph; tone: Tone; text: string }) {
  return (
    <div className="border-r border-b border-line px-3 py-2">
      <div className="annot !text-[9.5px]">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px]">
        <Mark glyph={glyph} tone={tone} size={12} />
        <span className="truncate">{text}</span>
      </div>
    </div>
  );
}

function TriageChip({
  icon: Icon,
  label,
  count,
  users,
  disabledLogin: _d,
  ...p
}: {
  icon: typeof Tag;
  label: string;
  count?: number;
  users?: { login: string; avatar_url: string }[];
  disabledLogin?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement> & {
    ref?: React.Ref<HTMLButtonElement>;
  }) {
  return (
    <button
      {...p}
      type="button"
      className="flex h-7 items-center gap-1.5 rounded-[var(--radius)] border border-line px-2 text-[12px] text-dim hover:border-line-strong hover:text-text cursor-default"
    >
      <Icon size={13} />
      <span className="max-w-[120px] truncate">{label}</span>
      {users && users.length > 0 && (
        <span className="flex -space-x-1">
          {users.slice(0, 3).map((u) => (
            <Avatar key={u.login} src={u.avatar_url} alt={u.login} size={14} />
          ))}
        </span>
      )}
      {count ? <span className="num text-[10.5px] text-faint">{count}</span> : null}
    </button>
  );
}


const REVIEW_MARK: Record<string, { glyph: Glyph; tone: Tone }> = {
  APPROVED: { glyph: "tick", tone: "ok" },
  CHANGES_REQUESTED: { glyph: "warn", tone: "warn" },
  COMMENTED: { glyph: "info", tone: "info" },
  DISMISSED: { glyph: "slash", tone: "idle" },
  PENDING: { glyph: "pending", tone: "idle" },
};

function Conversation({ pr }: { pr: Pull }) {
  const { t } = useTranslation(["pulls", "common"]);
  const comments = useComments(pr.repo, pr.number);
  const reviews = usePullReviews(pr.repo, pr.number);
  const inline = useReviewComments(pr.repo, pr.number);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(pr.body ?? "");


  const notesOf = useMemo(() => {
    const m = new Map<number, ReviewComment[]>();
    for (const c of inline.data ?? [])
      if (c.pull_request_review_id != null)
        m.set(c.pull_request_review_id, [...(m.get(c.pull_request_review_id) ?? []), c]);
    return m;
  }, [inline.data]);
  const openFile = (path: string) =>
    sheets.push("pulls", "file", {
      repo: pr.repo,
      number: pr.number,
      filename: path,
      title: path.slice(path.lastIndexOf("/") + 1),
    });

  const timeline = useMemo(() => {
    const items: ({ kind: "comment"; at: string; c: Comment } | { kind: "review"; at: string; r: Review })[] =
      [];
    for (const c of comments.data ?? []) items.push({ kind: "comment", at: c.created_at, c });
    for (const r of reviews.data ?? []) {

      if (r.state === "PENDING" || (r.state === "COMMENTED" && !r.body.trim() && !notesOf.has(r.id)))
        continue;
      items.push({ kind: "review", at: r.submitted_at ?? "", r });
    }
    return items.sort((a, b) => a.at.localeCompare(b.at));
  }, [comments.data, reviews.data, notesOf]);

  return (
    <div className="mx-auto max-w-[920px] space-y-4 px-6 py-5">
      <section className="rounded-[var(--radius)] border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-[11.5px] text-dim">
          <span className="num text-text">{pr.user.login}</span>
          {!editing && (
            <IconButton
              icon={Pencil}
              label={t("detail.editBody")}
              size={13}
              className="size-6"
              onClick={() => (setBody(pr.body ?? ""), setEditing(true))}
            />
          )}
        </div>
        <div className="px-3 py-3">
          {editing ? (
            <div className="space-y-2">
              <MarkdownEditor autoFocus value={body} onChange={setBody} minRows={8} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  {t("common:actions.cancel")}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    act(
                      () => unwrap(commands.pullsUpdate(pr.repo, pr.number, null, body, null)),
                      pr.repo,
                      pr.number,
                    ).then(() => setEditing(false))
                  }
                >
                  {t("common:actions.save")}
                </Button>
              </div>
            </div>
          ) : pr.body?.trim() ? (
            <Markdown source={pr.body} />
          ) : (
            <span className="text-[12px] text-faint italic">{t("detail.noBody")}</span>
          )}
        </div>
      </section>

      {(comments.isLoading || reviews.isLoading) && <Plotter />}
      {timeline.map((it) =>
        it.kind === "comment" ? (
          <section key={`c${it.c.id}`} className="rounded-[var(--radius)] border border-line bg-surface">
            <div className="flex items-center gap-1.5 border-b border-line px-3 py-1.5 text-[11.5px] text-dim">
              <Avatar src={it.c.user.avatar_url} alt={it.c.user.login} size={16} />
              <span className="num text-text">{it.c.user.login}</span>
              <span>
                <RelTime at={it.c.created_at} />
              </span>
            </div>
            <div className="px-3 py-3">
              <Markdown source={it.c.body} />
            </div>
          </section>
        ) : (
          <section key={`r${it.r.id}`} className="rounded-[var(--radius)] border border-line bg-surface">
            <div className="flex items-center gap-1.5 px-3 py-2 text-[12px]">
              <Mark
                glyph={REVIEW_MARK[it.r.state]?.glyph ?? "info"}
                tone={REVIEW_MARK[it.r.state]?.tone ?? "idle"}
                size={12}
              />
              <Avatar src={it.r.user.avatar_url} alt={it.r.user.login} size={16} />
              <span className="num">{it.r.user.login}</span>
              <span className="text-dim">
                {t(`reviewState.${it.r.state}`, { defaultValue: it.r.state.toLowerCase() })}
              </span>
              {notesOf.has(it.r.id) && (
                <span className="text-faint">
                  · {t("review.inline", { count: notesOf.get(it.r.id)!.length })}
                </span>
              )}
              <span className="ml-auto text-[11px] text-faint">
                {it.r.submitted_at ? formatRelative(it.r.submitted_at) : ""}
              </span>
            </div>
            {it.r.body.trim() && (
              <div className="border-t border-line px-3 py-3">
                <Markdown source={it.r.body} />
              </div>
            )}
            {notesOf.get(it.r.id)?.map((c) => (
              <button
                key={c.id}
                onClick={() => openFile(c.path)}
                className="flex w-full cursor-default items-baseline gap-2 border-t border-line px-3 py-1.5 text-left text-[12px] hover:bg-surface-2"
              >
                <span className="num shrink-0 text-dim">
                  {c.path.slice(c.path.lastIndexOf("/") + 1)}
                  {c.line != null &&
                    `:${c.start_line && c.start_line !== c.line ? `${c.start_line}–` : ""}${c.line}`}
                </span>
                {c.line == null && <span className="annot shrink-0">{t("review.outdated")}</span>}
                <span className="truncate">{c.body.split("\n")[0]}</span>
              </button>
            ))}
          </section>
        ),
      )}
      <ReviewComposer pr={pr} />
    </div>
  );
}

function ReviewComposer({ pr }: { pr: Pull }) {
  const { t } = useTranslation(["pulls", "common"]);
  const qc = useQueryClient();
  const me = useActiveAccount()?.login;
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const own = pr.user.login === me;
  const pendingCount = useReviewDrafts((s) => (s.pending[prKey(pr.repo, pr.number)] ?? noDrafts).length);

  const comment = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const c = await createReconciled(
        () => unwrap(commands.issuesCommentCreate(pr.repo, pr.number, body)),
        () => unwrap(commands.issuesComments(pr.repo, pr.number)),
        (c) => c.user.login === me && sameBody(c.body, body),
        (qc.getQueryData<Comment[]>(["issues", "comments", pr.repo, pr.number]) ?? []).map((c) => c.id),
      );
      qc.setQueryData<Comment[]>(["issues", "comments", pr.repo, pr.number], (l) => [...(l ?? []), c]);
      setBody("");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const review = async (event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT") => {
    setBusy(true);
    try {
      const batch = useReviewDrafts.getState().pending[prKey(pr.repo, pr.number)] ?? [];
      await unwrap(
        commands.pullsSubmitReview(
          pr.repo,
          pr.number,
          event,
          body,
          batch.map(({ id: _id, ...d }) => d),
        ),
      );
      useReviewDrafts.getState().clear(prKey(pr.repo, pr.number));
      void qc.invalidateQueries({ queryKey: ["pulls", "reviewComments", pr.repo, pr.number] });
      setBody("");
      await refreshPull(pr.repo, pr.number);
      toast({ kind: "success", title: t(`composer.submitted.${event}`) });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2 pt-2">
      <MarkdownEditor
        value={body}
        onChange={setBody}
        placeholder={t("composer.placeholder")}
        onSubmit={comment}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="annot">{t("composer.review")}</span>
        <Button
          size="sm"
          icon={Check}
          disabled={busy || own}
          title={own ? t("composer.ownPr") : undefined}
          onClick={() => review("APPROVE")}
        >
          {t("composer.approve")}
        </Button>
        <Button
          size="sm"
          disabled={busy || own || !body.trim()}
          title={own ? t("composer.ownPr") : undefined}
          onClick={() => review("REQUEST_CHANGES")}
        >
          {t("composer.requestChanges")}
        </Button>
        {pendingCount > 0 && (
          <span className="num text-[11.5px] text-accent">{t("batch.count", { count: pendingCount })}</span>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || (!body.trim() && !pendingCount)}
          onClick={() => review("COMMENT")}
        >
          {t("composer.reviewComment")}
        </Button>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="primary"
          icon={MessageSquare}
          loading={busy}
          disabled={!body.trim()}
          onClick={comment}
        >
          {t("composer.comment")}
        </Button>
      </div>
    </section>
  );
}


export const FILE_STATUS: Record<string, { letter: string; tone: Tone }> = {
  added: { letter: "A", tone: "ok" },
  removed: { letter: "D", tone: "danger" },
  modified: { letter: "M", tone: "warn" },
  renamed: { letter: "R", tone: "info" },
  copied: { letter: "C", tone: "info" },
  changed: { letter: "M", tone: "warn" },
  unchanged: { letter: "·", tone: "idle" },
};

function FilesTab({ pr }: { pr: Pull }) {
  const { t } = useTranslation("pulls");
  const openFile = useTopSheet("pulls", "file")?.filename;
  const reviewComments = useReviewComments(pr.repo, pr.number);
  const perFile = new Map<string, number>();
  for (const c of reviewComments.data ?? []) perFile.set(c.path, (perFile.get(c.path) ?? 0) + 1);
  const { data, isLoading, isError, error } = usePullFiles(pr.repo, pr.number);
  if (isLoading) return <Plotter />;
  if (isError) return <EmptyState title={errorMessage(error)} />;
  const max = Math.max(1, ...(data ?? []).map((f) => f.additions + f.deletions));
  return (
    <div className="divide-y divide-[var(--line)]">
      {(data ?? []).map((f) => {
        const st = FILE_STATUS[f.status] ?? FILE_STATUS.changed;
        const slash = f.filename.lastIndexOf("/");
        return (
          <button
            key={f.filename}
            onClick={() =>
              sheets.push("pulls", "file", {
                repo: pr.repo,
                number: pr.number,
                filename: f.filename,
                title: f.filename.slice(slash + 1),
              })
            }
            className={cn(
              "grid w-full grid-cols-[24px_minmax(0,1fr)_140px] items-center gap-3 px-6 py-2.5 text-left hover:bg-surface-2 cursor-default",
              openFile === f.filename && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
            )}
          >
            <Badge tone={st.tone} mono>
              {st.letter}
            </Badge>
            <span className="num min-w-0 truncate text-[12px]">
              <span className="text-faint">{f.filename.slice(0, slash + 1)}</span>
              <span className="text-text">{f.filename.slice(slash + 1)}</span>
              {f.previous_filename && <span className="text-faint"> ← {f.previous_filename}</span>}
              {perFile.get(f.filename) ? (
                <span className="ml-2 inline-flex items-center gap-0.5 text-[10.5px] text-accent">
                  <MessageSquare size={10} />
                  {perFile.get(f.filename)}
                </span>
              ) : null}
            </span>
            <span className="num flex items-center justify-end gap-2 text-[11px]">
              <span className="text-ok">+{f.additions}</span>
              <span className="text-danger">−{f.deletions}</span>
              <span className="flex h-1.5 w-12 overflow-hidden bg-surface-3">
                <span className="bg-ok" style={{ width: `${(f.additions / max) * 100}%` }} />
                <span className="bg-danger" style={{ width: `${(f.deletions / max) * 100}%` }} />
              </span>
            </span>
          </button>
        );
      })}
      {data?.length === 0 && <EmptyState title={t("files.none")} />}
    </div>
  );
}

function CommitsTab({ pr }: { pr: Pull }) {
  const { data, isLoading } = usePullCommits(pr.repo, pr.number);
  if (isLoading) return <Plotter />;
  return (
    <div className="divide-y divide-[var(--line)]">
      {(data ?? []).map((c) => (
        <div
          key={c.sha}
          className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 px-6 py-2.5 text-[12.5px]"
        >
          <button
            onClick={() => navigator.clipboard.writeText(c.sha)}
            title={c.sha}
            className="num text-left text-[11.5px] text-accent hover:underline cursor-default"
          >
            {c.sha.slice(0, 7)}
          </button>
          <span className="min-w-0">
            <span className="block truncate">{c.message.split("\n")[0]}</span>
            <span className="text-[11px] text-faint">
              {c.author?.login ?? c.author_name} · <RelTime at={c.date} />
            </span>
          </span>
          <IconButton icon={ExternalLink} label="GitHub" onClick={() => openUrl(c.html_url)} />
        </div>
      ))}
    </div>
  );
}

function ChecksTab({ pr }: { pr: Pull }) {
  const { t } = useTranslation("pulls");
  const { data, isLoading } = useChecks(pr.repo, pr.head.sha);
  if (isLoading) return <Plotter />;
  if (!data?.length) return <EmptyState icon={<ListChecks size={20} />} title={t("checks.none")} />;
  const mark = (c: (typeof data)[number]): { glyph: Glyph; tone: Tone } =>
    c.status !== "completed"
      ? { glyph: "running", tone: "accent" }
      : c.conclusion === "success"
        ? { glyph: "tick", tone: "ok" }
        : c.conclusion === "skipped" || c.conclusion === "neutral"
          ? { glyph: "skip", tone: "idle" }
          : { glyph: "cross", tone: "danger" };
  const dur = (a: string | null, b: string | null) =>
    a && b ? `${Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000))}s` : "";
  return (
    <div className="divide-y divide-[var(--line)]">
      {data.map((c, i) => (
        <div
          key={i}
          className="grid grid-cols-[20px_minmax(0,1fr)_120px_60px_32px] items-center gap-3 px-6 py-2.5 text-[12.5px]"
        >
          <Mark {...mark(c)} size={12} />
          <span className="truncate">{c.name}</span>
          <span className="truncate text-[11.5px] text-faint">{c.app}</span>
          <span className="num text-right text-[11px] text-faint">{dur(c.started_at, c.completed_at)}</span>
          {c.html_url ? (
            <IconButton icon={ExternalLink} label="GitHub" onClick={() => openUrl(c.html_url!)} />
          ) : (
            <span />
          )}
        </div>
      ))}
      <div className="px-6 py-2 text-[11px] text-faint">
        {t("checks.headSha", {
          sha: pr.head.sha.slice(0, 7),
          when: formatDate(pr.updated_at, { dateStyle: "medium", timeStyle: "short" }),
        })}
      </div>
    </div>
  );
}
