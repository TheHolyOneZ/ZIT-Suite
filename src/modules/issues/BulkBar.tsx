import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Download,
  Lock,
  LockOpen,
  MoreHorizontal,
  RotateCcw,
  Tag,
  UserMinus,
  UserPlus,
  X,
  CircleCheck,
  Milestone as MilestoneIcon,
} from "lucide-react";
import type { Issue, NewQueueItem, QueueAction } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { useActiveAccount } from "@/core/store/session";

import { Button, IconButton, Input, MenuItem, MenuLabel, MenuSeparator, Popover } from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { useLabels } from "./api";
import { exportIssues } from "./exportIssues";
import { LabelChip } from "./LabelChip";
import { MilestonePicker } from "./Pickers";
import { issueKey } from "./query";
import { useIssuesUi } from "./store";

type PerIssue = (i: Issue) => QueueAction;


export function BulkBar({ issues }: { issues: Issue[] }) {
  const { t } = useTranslation(["issues", "common"]);
  const selected = useIssuesUi((s) => s.selected);
  const setSelected = useIssuesUi((s) => s.setSelected);
  const picked = useMemo(
    () => issues.filter((i) => selected.has(issueKey(i.repo, i.number))),
    [issues, selected],
  );
  const repos = useMemo(() => [...new Set(picked.map((i) => i.repo))], [picked]);
  const singleRepo = repos.length === 1 ? repos[0] : null;

  const run = (fn: PerIssue) => {
    const items: NewQueueItem[] = picked.map((i) => ({ repo: i.repo, action: fn(i) }));
    useQueue.getState().requestRun(items);
  };

  return (
    <AnimatePresence>
      {picked.length > 0 && (
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 16, opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="absolute bottom-4 left-3 z-20 flex items-center gap-1.5 rounded-[var(--radius)] border border-line-strong bg-surface py-1.5 pr-1.5 pl-3 whitespace-nowrap shadow-[var(--shadow)]"
        >
          <span className="num mr-1 flex items-center gap-2 text-[12px]">
            <span className="flex h-5 min-w-5 items-center justify-center rounded-[3px] bg-accent px-1 text-accent-fg">
              {picked.length}
            </span>
            <span className="annot">
              {repos.length > 1 ? t("bulk.acrossRepos", { count: repos.length }) : t("bulk.selected")}
            </span>
          </span>

          <Popover
            placement="top-start"
            trigger={(p) => (
              <Button {...p} size="sm" icon={CircleCheck} trailing={<ChevronDown size={12} />}>
                {t("bulk.close")}
              </Button>
            )}
          >
            {(c) => (
              <>
                <MenuItem
                  onClick={() => (
                    c(),
                    run((i) => ({ kind: "issue_close", number: i.number, reason: "completed" }))
                  )}
                >
                  {t("composer.closeCompleted")}
                </MenuItem>
                <MenuItem
                  onClick={() => (
                    c(),
                    run((i) => ({ kind: "issue_close", number: i.number, reason: "not_planned" }))
                  )}
                >
                  {t("composer.closeNotPlanned")}
                </MenuItem>
              </>
            )}
          </Popover>

          <LabelAction
            repo={singleRepo}
            issues={picked}
            onAdd={(l) => run((i) => ({ kind: "issue_add_labels", number: i.number, labels: [l] }))}
            onRemove={(l) => run((i) => ({ kind: "issue_remove_label", number: i.number, label: l }))}
          />
          <AssignAction
            onAssign={(u) => run((i) => ({ kind: "issue_assign", number: i.number, assignees: [u] }))}
            onUnassign={(u) => run((i) => ({ kind: "issue_unassign", number: i.number, assignees: [u] }))}
          />

          {singleRepo && (
            <MilestonePicker
              repo={singleRepo}
              value={null}
              onPick={(m) =>
                run((i) => ({ kind: "issue_set_milestone", number: i.number, milestone: m?.number ?? null }))
              }
              trigger={(p) => (
                <Button {...p} size="sm" icon={MilestoneIcon}>
                  {t("detail.milestone")}
                </Button>
              )}
            />
          )}

          <Popover
            placement="top-end"
            trigger={(p) => <IconButton {...p} icon={MoreHorizontal} label={t("bulk.more")} />}
          >
            {(c) => (
              <>
                <MenuItem
                  icon={RotateCcw}
                  onClick={() => (c(), run((i) => ({ kind: "issue_reopen", number: i.number })))}
                >
                  {t("composer.reopen")}
                </MenuItem>
                <MenuItem
                  icon={Lock}
                  onClick={() => (c(), run((i) => ({ kind: "issue_lock", number: i.number })))}
                >
                  {t("composer.lock")}
                </MenuItem>
                <MenuItem
                  icon={LockOpen}
                  onClick={() => (c(), run((i) => ({ kind: "issue_unlock", number: i.number })))}
                >
                  {t("composer.unlock")}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon={Download}
                  onClick={() => (c(), exportIssues(picked, "csv").catch((e) => toastError(e)))}
                >
                  {t("export.csv")}
                </MenuItem>
                <MenuItem
                  icon={Download}
                  onClick={() => (c(), exportIssues(picked, "json").catch((e) => toastError(e)))}
                >
                  {t("export.json")}
                </MenuItem>
              </>
            )}
          </Popover>
          <IconButton icon={X} label={t("bulk.clear")} onClick={() => setSelected([])} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LabelAction({
  repo,
  issues,
  onAdd,
  onRemove,
}: {
  repo: string | null;
  issues: Issue[];
  onAdd: (l: string) => void;
  onRemove: (l: string) => void;
}) {
  const { t } = useTranslation("issues");
  const repoLabels = useLabels(repo);
  const [q, setQ] = useState("");

  const options = useMemo(() => {
    const src = repo ? (repoLabels.data ?? []) : issues.flatMap((i) => i.labels);
    const m = new Map(src.map((l) => [l.name, l]));
    return [...m.values()].filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase()));
  }, [repo, repoLabels.data, issues, q]);
  const onSelection = new Set(issues.flatMap((i) => i.labels.map((l) => l.name)));

  return (
    <Popover
      placement="top-start"
      className="w-[300px] p-0"
      trigger={(p) => (
        <Button {...p} size="sm" icon={Tag}>
          {t("detail.labels")}
        </Button>
      )}
    >
      {(c) => (
        <div>
          <form
            className="border-b border-line p-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) {
                c();
                onAdd(q.trim());
              }
            }}
          >
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("bulk.labelPlaceholder")}
              className="h-7 text-[12px]"
            />
          </form>
          <div className="max-h-[260px] overflow-y-auto p-1">
            <MenuLabel>{t("bulk.addLabel")}</MenuLabel>
            {options.map((l) => (
              <MenuItem key={`a-${l.name}`} onClick={() => (c(), onAdd(l.name))}>
                <LabelChip label={l} />
              </MenuItem>
            ))}
            {[...onSelection].length > 0 && (
              <>
                <MenuSeparator />
                <MenuLabel>{t("bulk.removeLabel")}</MenuLabel>
                {[...onSelection].map((n) => (
                  <MenuItem key={`r-${n}`} onClick={() => (c(), onRemove(n))}>
                    <span className="text-dim">− {n}</span>
                  </MenuItem>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}

function AssignAction({
  onAssign,
  onUnassign,
}: {
  onAssign: (u: string) => void;
  onUnassign: (u: string) => void;
}) {
  const { t } = useTranslation("issues");
  const me = useActiveAccount()?.login ?? "";
  const [login, setLogin] = useState("");
  return (
    <Popover
      placement="top-start"
      className="w-[260px]"
      trigger={(p) => (
        <Button {...p} size="sm" icon={UserPlus}>
          {t("detail.assignees")}
        </Button>
      )}
    >
      {(c) => (
        <div className="space-y-1">
          <MenuItem icon={UserPlus} onClick={() => (c(), onAssign(me))}>
            {t("bulk.assignMe")}
          </MenuItem>
          <MenuItem icon={UserMinus} onClick={() => (c(), onUnassign(me))}>
            {t("bulk.unassignMe")}
          </MenuItem>
          <MenuSeparator />
          <form
            className="flex gap-1.5 p-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (login.trim()) {
                c();
                onAssign(login.trim());
              }
            }}
          >
            <div className="flex-1">
              <Input
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder={t("bulk.loginPlaceholder")}
                className="num h-7 text-[12px]"
              />
            </div>
            <Button size="sm" type="submit">
              {t("bulk.assign")}
            </Button>
          </form>
        </div>
      )}
    </Popover>
  );
}
