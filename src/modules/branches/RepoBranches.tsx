import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ExternalLink,
  FilePen,
  GitBranchPlus,
  GitCompareArrows,
  GitPullRequest,
  Lock,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react";
import { commands, unwrap, type RemoteBranch } from "@/core/ipc";
import { refreshRepos } from "@/core/data/repos";
import { errorMessage, toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { formatNumber } from "@/core/i18n/format";
import { getModule } from "@/core/modules/registry";
import { sheets } from "@/core/sheets/store";
import { useModuleSetting } from "@/core/store/moduleSettings";
import { toast } from "@/core/store/toasts";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  IconButton,
  Input,
  Mark,
  Plotter,
  RelTime,
  Segmented,
  useConfirmClick,
} from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { reloadBranches, useBranches, useRepoMeta, useRulesets } from "./api";
import { RulesetsDialog } from "./RulesetsDialog";
import { NewBranchDialog, ProtectDialog, RenameDialog } from "./dialogs";
import { factsOf, filterBranches, sortBranches, type BranchFacts, type BranchFilter } from "./model";
import { useBranchesUi } from "./store";

type Open =
  { kind: "new" } | { kind: "rename"; b: RemoteBranch } | { kind: "protect"; b: RemoteBranch } | null;

const deleteAll = (repo: string, names: string[]) =>
  useQueue.getState().requestRun(names.map((name) => ({ repo, action: { kind: "branch_delete", name } })));


export function RepoBranches({ repo }: { repo: string }) {
  const { t } = useTranslation(["branches", "common"]);
  const ui = useBranchesUi();
  const meta = useRepoMeta(repo);
  const defaultBranch = meta?.default_branch ?? null;
  const canWrite = meta?.permissions?.push ?? false;
  const isAdmin = meta?.permissions?.admin ?? false;
  const staleDays = useModuleSetting<number>("branches", "staleDays");
  const q = useBranches(repo, defaultBranch);
  const rulesets = useRulesets(repo).data ?? [];
  const [open, setOpen] = useState<Open>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const list = useMemo(() => sortBranches(q.data?.branches ?? [], defaultBranch), [q.data, defaultBranch]);
  const facts = useMemo(() => {
    const now = Date.now();
    const m = new Map(list.map((b) => [b.name, factsOf(b, defaultBranch, staleDays, now)]));
    return (b: RemoteBranch) => m.get(b.name)!;
  }, [list, defaultBranch, staleDays]);
  const shown = useMemo(() => filterBranches(list, ui.filter, ui.q, facts), [list, ui.filter, ui.q, facts]);
  const counts = useMemo(
    () => ({
      stale: list.filter((b) => facts(b).stale).length,
      merged: list.filter((b) => facts(b).merged).length,
      pr: list.filter((b) => b.prs > 0).length,
      protected: list.filter((b) => b.protected).length,
    }),
    [list, facts],
  );
  const removable = list.filter((b) => facts(b).removable);
  const maxDiff = Math.max(1, ...list.map((b) => Math.max(b.ahead ?? 0, b.behind ?? 0)));
  const toggle = (name: string) =>
    setSelected((s) => (s.has(name) ? (s.delete(name), new Set(s)) : new Set(s).add(name)));

  if (q.isLoading || q.isPending) return <Plotter />;
  if (q.error) return <EmptyState title={errorMessage(q.error)} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {rulesOpen && <RulesetsDialog repo={repo} onClose={() => setRulesOpen(false)} />}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-line px-4 py-3">
        <Stat label={t("stats.branches")} value={formatNumber(list.length)} />
        <Stat
          label={t("stats.stale", { days: staleDays })}
          value={formatNumber(counts.stale)}
          tone={counts.stale ? "warn" : undefined}
        />
        <Stat label={t("stats.merged")} value={formatNumber(counts.merged)} />
        <Stat label={t("stats.protected")} value={formatNumber(counts.protected)} />
        {(rulesets.length > 0 || isAdmin) && (
          <button
            className="cursor-default text-left"
            onClick={() =>
              isAdmin ? setRulesOpen(true) : void openUrl(`https://github.com/${repo}/settings/rules`)
            }
            title={rulesets.map((r) => `${r.name} · ${r.enforcement}`).join("\n")}
          >
            <div className="annot !text-[9.5px]">{t("stats.rulesets")}</div>
            <div className="num text-[17px] text-info hover:underline">{formatNumber(rulesets.length)}</div>
          </button>
        )}
        <span className="ml-auto flex items-center gap-2">
          {canWrite && removable.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              icon={Trash2}
              onClick={() => setSelected(new Set(removable.map((b) => b.name)))}
            >
              {t("cleanup", { count: removable.length })}
            </Button>
          )}
          <IconButton icon={RefreshCw} label={t("refresh")} onClick={() => reloadBranches(repo)} />
          {canWrite && (
            <Button
              variant="primary"
              icon={GitBranchPlus}
              disabled={!defaultBranch}
              onClick={() => setOpen({ kind: "new" })}
            >
              {t("new.button")}
            </Button>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <Segmented<BranchFilter>
          size="sm"
          value={ui.filter}
          onChange={(filter) => ui.set({ filter })}
          options={[
            { value: "all", label: t("filter.all") },
            { value: "stale", label: `${t("filter.stale")} · ${counts.stale}` },
            { value: "merged", label: `${t("filter.merged")} · ${counts.merged}` },
            { value: "pr", label: `${t("filter.pr")} · ${counts.pr}` },
            { value: "protected", label: `${t("filter.protected")} · ${counts.protected}` },
          ]}
        />
        <div className="w-[240px]">
          <Input
            icon={Search}
            value={ui.q}
            onChange={(e) => ui.set({ q: e.target.value })}
            placeholder={t("find")}
            className="!h-7 text-[12px]"
          />
        </div>
        {selected.size > 0 ? (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-[12px] text-dim">{t("selected", { count: selected.size })}</span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              {t("clear")}
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={Trash2}
              onClick={() => (deleteAll(repo, [...selected]), setSelected(new Set()))}
            >
              {t("deleteSelected", { count: selected.size })}
            </Button>
          </span>
        ) : (
          <span className="num ml-auto text-[11px] text-faint">{t("legend")}</span>
        )}
      </div>
      {q.data?.truncated && (
        <div className="border-b border-line px-4 py-1.5 text-[11.5px] text-warn">{t("truncated")}</div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 && (
          <div className="px-4 py-8 text-center text-[12.5px] text-faint">
            {list.length ? t("noMatch") : t("none")}
          </div>
        )}
        {shown.map((b) => (
          <BranchRow
            key={b.name}
            repo={repo}
            b={b}
            f={facts(b)}
            defaultBranch={defaultBranch}
            maxDiff={maxDiff}
            canWrite={canWrite}
            isAdmin={isAdmin}
            selected={selected.has(b.name)}
            onSelect={() => toggle(b.name)}
            onRename={() => setOpen({ kind: "rename", b })}
            onProtect={() => setOpen({ kind: "protect", b })}
          />
        ))}
      </div>
      {open?.kind === "new" && defaultBranch && (
        <NewBranchDialog repo={repo} branches={list} from={defaultBranch} onClose={() => setOpen(null)} />
      )}
      {open?.kind === "rename" && (
        <RenameDialog
          repo={repo}
          branch={open.b.name}
          isDefault={open.b.name === defaultBranch}
          branches={list}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === "protect" && (
        <ProtectDialog repo={repo} branch={open.b} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div>
      <div className="annot !text-[9.5px]">{label}</div>
      <div className={cn("num text-[17px]", tone === "warn" && "text-warn")}>{value}</div>
    </div>
  );
}


function AheadBehind({ ahead, behind, max }: { ahead: number | null; behind: number | null; max: number }) {
  const { t } = useTranslation("branches");
  if (ahead == null || behind == null) return <span className="text-[11px] text-faint">—</span>;
  const w = (n: number) => `${n ? Math.max(6, (n / max) * 100) : 0}%`;
  return (
    <span
      className="grid grid-cols-[1fr_1px_1fr] items-center gap-1"
      title={t("aheadBehind", { ahead, behind })}
    >
      <span className="flex items-center justify-end gap-1">
        <span className="num text-[10.5px] text-faint">{behind || ""}</span>
        <span
          className="h-[5px] rounded-l-[1px] bg-[var(--text-faint)] opacity-60"
          style={{ width: w(behind) }}
        />
      </span>
      <span className="h-3 bg-[var(--line-strong)]" />
      <span className="flex items-center gap-1">
        <span className="h-[5px] rounded-r-[1px] bg-[var(--accent)]" style={{ width: w(ahead) }} />
        <span className="num text-[10.5px] text-accent">{ahead || ""}</span>
      </span>
    </span>
  );
}

function BranchRow({
  repo,
  b,
  f,
  defaultBranch,
  maxDiff,
  canWrite,
  isAdmin,
  selected,
  onSelect,
  onRename,
  onProtect,
}: {
  repo: string;
  b: RemoteBranch;
  f: BranchFacts;
  defaultBranch: string | null;
  maxDiff: number;
  canWrite: boolean;
  isAdmin: boolean;
  selected: boolean;
  onSelect: () => void;
  onRename: () => void;
  onProtect: () => void;
}) {
  const { t } = useTranslation(["branches", "common"]);
  const setDefault = useConfirmClick(async () => {
    try {
      await unwrap(commands.branchesSetDefault(repo, b.name));
      toast({ kind: "success", title: t("defaultSet", { name: b.name }) });
      reloadBranches(repo);
      refreshRepos();
    } catch (e) {
      toastError(e);
    }
  });
  const deletable = canWrite && !f.isDefault && !b.protected;
  const compare = `https://github.com/${repo}/compare/${encodeURIComponent(defaultBranch ?? "")}...${encodeURIComponent(b.name)}`;
  return (
    <div
      className={cn(
        "group grid grid-cols-[22px_minmax(0,1.3fr)_150px_minmax(0,1.2fr)_200px] items-center gap-3 border-b border-line px-4 py-2 hover:bg-surface-2",
        selected && "bg-surface-2",
      )}
    >
      <span>{deletable && <Checkbox checked={selected} onChange={onSelect} label={null} />}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="num truncate text-[12.5px]" title={b.name}>
            {b.name}
          </span>
          {f.isDefault && <Badge tone="accent">{t("badge.default")}</Badge>}
          {b.protected && (
            <span
              className="text-info"
              title={b.rule ? t("badge.protectedBy", { rule: b.rule }) : t("badge.protected")}
            >
              <Lock size={11} />
            </span>
          )}
          {f.merged && <Badge tone="ok">{t("badge.merged")}</Badge>}
          {f.stale && (
            <span title={t("badge.stale", { days: f.age })}>
              <Mark glyph="hourglass" tone="warn" size={10} />
            </span>
          )}
        </div>
        {b.pr && (
          <button
            className="flex max-w-full cursor-default items-center gap-1 text-[11px] text-dim hover:text-accent"
            onClick={() =>
              getModule("pulls")
                ? sheets.push("pulls", "pull", { repo, number: b.pr!.number, title: b.pr!.title })
                : void openUrl(`https://github.com/${repo}/pull/${b.pr!.number}`)
            }
          >
            <GitPullRequest size={11} className="shrink-0" />
            <span className="num">#{b.pr.number}</span>
            <span className="truncate">{b.pr.title}</span>
            {b.pr.draft && <span className="text-faint">· {t("badge.draft")}</span>}
            {b.prs > 1 && <span className="text-faint">+{b.prs - 1}</span>}
          </button>
        )}
      </div>
      {f.isDefault ? (
        <span className="text-center text-[11px] text-faint">{t("isBase")}</span>
      ) : (
        <AheadBehind ahead={b.ahead} behind={b.behind} max={maxDiff} />
      )}
      <div className="min-w-0 text-[12px]">
        <div className="truncate" title={b.message}>
          {b.message}
        </div>
        <div className="flex gap-2 text-[11px] text-faint">
          <span className="num">{b.sha.slice(0, 7)}</span>
          {(b.author_login || b.author) && <span>{b.author_login ? `@${b.author_login}` : b.author}</span>}
          {b.date && <RelTime at={b.date} />}
        </div>
      </div>
      <span className="flex items-center justify-end opacity-50 group-hover:opacity-100">
        {getModule("files") && (
          <IconButton
            icon={FilePen}
            label={t("open.files")}
            size={13}
            className="size-7"
            onClick={() => sheets.openWith("files", { repo, branch: b.name })}
          />
        )}
        {!f.isDefault && (
          <IconButton
            icon={GitCompareArrows}
            label={b.prs ? t("open.compare") : t("open.newPr")}
            size={13}
            className="size-7"
            onClick={() => void openUrl(b.prs || !b.ahead ? compare : `${compare}?expand=1`)}
          />
        )}
        {canWrite && (
          <IconButton
            icon={Pencil}
            label={t("rename.button")}
            size={13}
            className="size-7"
            onClick={onRename}
          />
        )}
        {isAdmin && (
          <IconButton
            icon={ShieldCheck}
            label={b.protected ? t("protect.edit") : t("protect.button")}
            size={13}
            className={cn("size-7", b.protected && "text-info")}
            onClick={onProtect}
          />
        )}
        {isAdmin && !f.isDefault && (
          <button
            className={cn(
              "inline-flex h-7 w-7 cursor-default items-center justify-center rounded-[3px] hover:bg-surface-3",
              setDefault.armed ? "text-accent" : "text-dim",
            )}
            title={setDefault.armed ? t("confirmDefault") : t("makeDefault")}
            onClick={setDefault.onClick}
          >
            <Star size={13} fill={setDefault.armed ? "currentColor" : "none"} />
          </button>
        )}
        {deletable && (
          <IconButton
            icon={Trash2}
            label={t("delete")}
            size={13}
            className="size-7 hover:text-danger"
            onClick={() => deleteAll(repo, [b.name])}
          />
        )}
        <IconButton
          icon={ExternalLink}
          label={t("openOnGitHub")}
          size={13}
          className="size-7"
          onClick={() => void openUrl(`https://github.com/${repo}/tree/${encodeURIComponent(b.name)}`)}
        />
      </span>
    </div>
  );
}
