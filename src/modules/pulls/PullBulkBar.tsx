import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Download,
  GitMerge,
  MoreHorizontal,
  RefreshCcw,
  RotateCcw,
  Tag,
  Users,
  X,
} from "lucide-react";
import type { NewQueueItem, PullSummary, QueueAction } from "@/core/ipc";
import { toastError } from "@/core/errors";

import { save } from "@tauri-apps/plugin-dialog";
import { commands, unwrap } from "@/core/ipc";
import { Button, IconButton, Input, MenuItem, MenuSeparator, Popover } from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { pullKey } from "./query";
import { usePullsPrefs, usePullsUi } from "./store";

const csv = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function exportPulls(pulls: PullSummary[]) {
  const path = await save({
    defaultPath: "pull-requests.csv",
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return;
  const head = "repo,number,title,state,draft,author,head,base,checks,review,additions,deletions,url";
  const rows = pulls.map((p) =>
    [
      p.repo,
      p.number,
      p.title,
      p.state,
      p.is_draft,
      p.author?.login,
      p.head_ref,
      p.base_ref,
      p.checks,
      p.review_decision,
      p.additions,
      p.deletions,
      p.url,
    ]
      .map(csv)
      .join(","),
  );
  await unwrap(commands.exportTextFile(path, [head, ...rows].join("\n") + "\n"));
}

export function PullBulkBar({ pulls }: { pulls: PullSummary[] }) {
  const { t } = useTranslation(["pulls", "issues"]);
  const selected = usePullsUi((s) => s.selected);
  const setSelected = usePullsUi((s) => s.setSelected);
  const mergeMethod = usePullsPrefs((s) => s.mergeMethod);
  const picked = useMemo(
    () => pulls.filter((p) => selected.has(pullKey(p.repo, p.number))),
    [pulls, selected],
  );
  const [login, setLogin] = useState("");
  const [label, setLabel] = useState("");
  const run = (fn: (p: PullSummary) => QueueAction) =>
    useQueue.getState().requestRun(picked.map((p): NewQueueItem => ({ repo: p.repo, action: fn(p) })));

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
            <span className="annot">{t("bulk.selected")}</span>
          </span>
          <Popover
            placement="top-start"
            trigger={(p) => (
              <Button {...p} size="sm" icon={GitMerge} trailing={<ChevronDown size={12} />}>
                {t("bulk.merge")}
              </Button>
            )}
          >
            {(c) =>
              (["squash", "merge", "rebase"] as const).map((m) => (
                <MenuItem
                  key={m}
                  active={m === mergeMethod}
                  onClick={() => (c(), run((p) => ({ kind: "pr_merge", number: p.number, method: m })))}
                >
                  {t(`merge.methods.${m}`)}
                </MenuItem>
              ))
            }
          </Popover>
          <Popover
            placement="top-start"
            className="w-[260px]"
            trigger={(p) => (
              <Button {...p} size="sm" icon={Users}>
                {t("bulk.requestReview")}
              </Button>
            )}
          >
            {(c) => (
              <form
                className="flex gap-1.5 p-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (login.trim()) {
                    c();
                    run((p) => ({
                      kind: "pr_request_reviewers",
                      number: p.number,
                      reviewers: [login.trim()],
                    }));
                  }
                }}
              >
                <div className="flex-1">
                  <Input
                    autoFocus
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    placeholder="login"
                    className="num h-7 text-[12px]"
                  />
                </div>
                <Button size="sm" type="submit">
                  {t("bulk.request")}
                </Button>
              </form>
            )}
          </Popover>
          <Popover
            placement="top-start"
            className="w-[260px]"
            trigger={(p) => (
              <Button {...p} size="sm" icon={Tag}>
                {t("triage.labels")}
              </Button>
            )}
          >
            {(c) => (
              <form
                className="flex gap-1.5 p-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (label.trim()) {
                    c();
                    run((p) => ({ kind: "issue_add_labels", number: p.number, labels: [label.trim()] }));
                  }
                }}
              >
                <div className="flex-1">
                  <Input
                    autoFocus
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={t("issues:bulk.labelPlaceholder")}
                    className="h-7 text-[12px]"
                  />
                </div>
              </form>
            )}
          </Popover>
          <Popover
            placement="top-end"
            trigger={(p) => <IconButton {...p} icon={MoreHorizontal} label={t("bulk.more")} />}
          >
            {(c) => (
              <>
                <MenuItem
                  icon={RefreshCcw}
                  onClick={() => (c(), run((p) => ({ kind: "pr_update_branch", number: p.number })))}
                >
                  {t("actions.updateBranch")}
                </MenuItem>
                <MenuItem
                  icon={X}
                  onClick={() => (c(), run((p) => ({ kind: "pr_close", number: p.number })))}
                >
                  {t("actions.close")}
                </MenuItem>
                <MenuItem
                  icon={RotateCcw}
                  onClick={() => (c(), run((p) => ({ kind: "pr_reopen", number: p.number })))}
                >
                  {t("actions.reopen")}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon={Download}
                  onClick={() => (c(), exportPulls(picked).catch((e) => toastError(e)))}
                >
                  {t("bulk.export")}
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
