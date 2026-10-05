import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowRightLeft, ListTree, Pin, PinOff, Plus, SmilePlus, X } from "lucide-react";
import { commands, unwrap, type Issue, type TimelineEvent } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { queryClient } from "@/core/query";
import { useActiveAccount } from "@/core/store/session";
import { toast } from "@/core/store/toasts";
import { RepoPicker } from "@/app/RepoPicker";
import { Button, Dialog, IconButton, Input, Label, Mark, Popover, RelTime } from "@/ui";

export const REACTIONS: { content: string; emoji: string }[] = [
  { content: "+1", emoji: "👍" },
  { content: "-1", emoji: "👎" },
  { content: "laugh", emoji: "😄" },
  { content: "hooray", emoji: "🎉" },
  { content: "confused", emoji: "😕" },
  { content: "heart", emoji: "❤️" },
  { content: "rocket", emoji: "🚀" },
  { content: "eyes", emoji: "👀" },
];

const reactKey = (repo: string, target: string) => ["issues", "reactions", repo, target] as const;


export function Reactions({ repo, target, known }: { repo: string; target: string; known?: number }) {
  const { t } = useTranslation("issues");
  const me = useActiveAccount()?.login;
  const q = useQuery({
    queryKey: reactKey(repo, target),
    queryFn: () => unwrap(commands.issuesReactions(repo, target, false)),
    staleTime: 60_000,
    enabled: known === undefined || known > 0,
  });
  const list = q.data ?? [];
  const reload = async () =>
    queryClient.setQueryData(
      reactKey(repo, target),
      await unwrap(commands.issuesReactions(repo, target, true)),
    );
  const toggle = async (content: string) => {
    const mine = list.find((r) => r.content === content && r.user === me);
    try {
      if (mine) await unwrap(commands.issuesUnreact(repo, target, mine.id));
      else await unwrap(commands.issuesReact(repo, target, content));
      await reload();
    } catch (e) {
      toastError(e);
    }
  };
  const groups = REACTIONS.map((r) => ({
    ...r,
    users: list.filter((x) => x.content === r.content).map((x) => x.user),
  })).filter((g) => g.users.length);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {groups.map((g) => (
        <button
          key={g.content}
          onClick={() => void toggle(g.content)}
          title={g.users.join(", ")}
          className={cn(
            "inline-flex h-6 cursor-default items-center gap-1 rounded-full border px-2 text-[11.5px]",
            me && g.users.includes(me)
              ? "border-accent bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
              : "border-line hover:border-line-strong",
          )}
        >
          <span>{g.emoji}</span>
          <span className="num">{g.users.length}</span>
        </button>
      ))}
      <Popover
        trigger={(p) => (
          <IconButton
            {...p}
            icon={SmilePlus}
            label={t("extras.react")}
            size={13}
            className="size-6 text-faint"
          />
        )}
      >
        {(close) => (
          <div className="flex gap-0.5 p-1">
            {REACTIONS.map((r) => (
              <button
                key={r.content}
                className="size-8 cursor-default rounded-[3px] text-[16px] hover:bg-surface-2"
                onClick={() => (close(), void toggle(r.content))}
                title={r.content}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        )}
      </Popover>
    </div>
  );
}

export const useTimeline = (repo: string, number: number) =>
  useQuery({
    queryKey: ["issues", "timeline", repo, number],
    queryFn: () => unwrap(commands.issuesTimeline(repo, number)),
    staleTime: 30_000,
  });


export function TimelineLine({ e }: { e: TimelineEvent }) {
  const { t } = useTranslation("issues");
  const what = t(`timeline.${e.event.replace(/-/g, "_") as "labeled"}`, {
    subject: e.subject ?? "",
    from: e.from ?? "",
    defaultValue: e.event.replace(/[_-]/g, " "),
  });
  return (
    <div className="flex items-center gap-2 pl-3 text-[11.5px] text-dim">
      <span className="h-4 w-px bg-line-strong" />
      {e.actor && <span className="num text-text">@{e.actor}</span>}
      <span>{what}</span>
      {e.color && e.subject && (
        <span className="inline-block size-2.5 rounded-[2px]" style={{ background: `#${e.color}` }} />
      )}
      {e.source_title && (
        <button
          className="min-w-0 cursor-default truncate text-accent hover:underline"
          onClick={() => e.source_url && void openUrl(e.source_url)}
        >
          {e.source_title}
        </button>
      )}
      <span className="text-faint">
        · <RelTime at={e.created_at} />
      </span>
    </div>
  );
}


export function IssueActions({ issue }: { issue: Issue }) {
  const { t } = useTranslation("issues");
  const q = useQuery({
    queryKey: ["issues", "extras", issue.repo, issue.number],
    queryFn: () => unwrap(commands.issuesExtras(issue.repo, issue.number)),
    staleTime: 30_000,
  });
  const [transferring, setTransferring] = useState(false);
  const x = q.data;
  const pin = async () => {
    if (!x) return;
    try {
      await unwrap(commands.issuesSetPinned(x.node_id, !x.pinned));
      toast({ kind: "success", title: x.pinned ? t("extras.unpinned") : t("extras.pinned") });
      await q.refetch();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <>
      {x && !issue.is_pull_request && (
        <IconButton
          icon={x.pinned ? PinOff : Pin}
          label={x.pinned ? t("extras.unpin") : x.pinned_count >= 3 ? t("extras.pinFull") : t("extras.pin")}
          disabled={!x.pinned && x.pinned_count >= 3}
          className={x.pinned ? "text-accent" : undefined}
          onClick={() => void pin()}
        />
      )}
      {x && !issue.is_pull_request && (
        <IconButton
          icon={ArrowRightLeft}
          label={t("extras.transfer")}
          onClick={() => setTransferring(true)}
        />
      )}
      {transferring && x && (
        <TransferDialog issue={issue} nodeId={x.node_id} onClose={() => setTransferring(false)} />
      )}
    </>
  );
}

function TransferDialog({ issue, nodeId, onClose }: { issue: Issue; nodeId: string; onClose: () => void }) {
  const { t } = useTranslation(["issues", "common"]);
  const owner = issue.repo.split("/")[0];
  const [to, setTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!to) return;
    setBusy(true);
    try {
      const url = await unwrap(commands.issuesTransfer(nodeId, to));
      toast({ kind: "success", title: t("extras.transferred", { repo: to }), body: url });
      void queryClient.invalidateQueries({ queryKey: ["issues"] });
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const ok = !!to && to !== issue.repo && to.split("/")[0] === owner;
  return (
    <Dialog
      open
      onClose={onClose}
      width={520}
      kicker={`${issue.repo} #${issue.number}`}
      title={t("extras.transferTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={ArrowRightLeft}
            loading={busy}
            disabled={!ok}
            onClick={() => void run()}
          >
            {t("extras.transferRun")}
          </Button>
        </>
      }
    >
      <Label hint={t("extras.transferHint", { owner })}>{t("extras.transferTo")}</Label>
      <RepoPicker value={to} onChange={setTo} writable />
      {to && to.split("/")[0] !== owner && (
        <p className="mt-1 text-[11.5px] text-warn">{t("extras.transferOwner", { owner })}</p>
      )}
      <p className="mt-3 text-[11.5px] text-faint">{t("extras.transferNote")}</p>
    </Dialog>
  );
}


export function SubIssues({ issue }: { issue: Issue }) {
  const { t } = useTranslation("issues");
  const key = ["issues", "subs", issue.repo, issue.number];
  const q = useQuery({
    queryKey: key,
    queryFn: () => unwrap(commands.issuesSubIssues(issue.repo, issue.number)),
    staleTime: 30_000,
    enabled: !issue.is_pull_request,
  });
  const [adding, setAdding] = useState(false);
  const [num, setNum] = useState("");
  const list = q.data ?? [];
  const done = list.filter((s) => s.state === "closed").length;
  const reload = () => void queryClient.invalidateQueries({ queryKey: key });
  const add = async () => {
    const n = Number(num.replace("#", ""));
    if (!n) return;
    try {
      await unwrap(commands.issuesAddSubIssue(issue.repo, issue.number, n));
      setNum("");
      setAdding(false);
      reload();
    } catch (e) {
      toastError(e);
    }
  };
  if (issue.is_pull_request) return null;
  return (
    <section className="rounded-[var(--radius)] border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[11.5px] text-dim">
        <ListTree size={13} />
        <span className="annot flex-1">{t("extras.subIssues")}</span>
        {list.length > 0 && <span className="num">{t("extras.subDone", { done, total: list.length })}</span>}
        <IconButton
          icon={adding ? X : Plus}
          label={t("extras.addSub")}
          size={13}
          className="size-6"
          onClick={() => setAdding(!adding)}
        />
      </div>
      {adding && (
        <form
          className="flex gap-2 border-b border-line px-3 py-2"
          onSubmit={(e) => (e.preventDefault(), void add())}
        >
          <Input
            autoFocus
            value={num}
            onChange={(e) => setNum(e.target.value)}
            placeholder={t("extras.subPlaceholder")}
            className="num !h-7 text-[12px]"
          />
          <Button size="sm" type="submit" disabled={!Number(num.replace("#", ""))}>
            {t("extras.addSub")}
          </Button>
        </form>
      )}
      {list.length === 0 && !adding && (
        <div className="px-3 py-2 text-[11.5px] text-faint">{t("extras.noSubs")}</div>
      )}
      {list.map((s) => (
        <div key={s.id} className="group flex items-center gap-2 px-3 py-1.5 text-[12px]">
          <Mark
            glyph={s.state === "closed" ? "closed" : "open"}
            tone={s.state === "closed" ? "accent" : "ok"}
            size={10}
          />
          <button
            className="min-w-0 flex-1 cursor-default truncate text-left hover:text-accent"
            onClick={() => void openUrl(s.html_url)}
          >
            <span className="num text-faint">#{s.number}</span> {s.title}
          </button>
          <IconButton
            icon={X}
            label={t("extras.removeSub")}
            size={12}
            className="size-6 opacity-0 group-hover:opacity-100"
            onClick={() =>
              void unwrap(commands.issuesRemoveSubIssue(issue.repo, issue.number, s.id)).then(
                reload,
                toastError,
              )
            }
          />
        </div>
      ))}
    </section>
  );
}
