import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitBranchPlus, Pencil, Plus, ShieldCheck, ShieldOff, X } from "lucide-react";
import { errorMessage, toastError } from "@/core/errors";
import { commands, toAppError, unwrap, type Protection, type RemoteBranch } from "@/core/ipc";
import { cn } from "@/core/cn";
import { toast } from "@/core/store/toasts";
import { Button, Checkbox, Dialog, Input, Label, Plotter, Segmented, Select, useConfirmClick } from "@/ui";
import { reloadBranches, useProtection } from "./api";
import { cleanBranchName, validBranchName } from "./model";

export const DEFAULT_PROTECTION: Protection = {
  require_pr: true,
  approvals: 0,
  dismiss_stale: true,
  code_owners: false,
  last_push_approval: false,
  status_checks: false,
  strict: false,
  contexts: [],
  enforce_admins: false,
  linear_history: false,
  conversation_resolution: false,
  force_pushes: false,
  deletions: false,
};

function NameField({
  value,
  onChange,
  taken,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  taken: Set<string>;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation("branches");
  const v = value.trim();
  return (
    <>
      <Input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(cleanBranchName(e.target.value))}
        placeholder="feature/my-change"
        className="num"
      />
      {v && !validBranchName(v) && <p className="mt-1 text-[11.5px] text-warn">{t("name.invalid")}</p>}
      {v && taken.has(v) && <p className="mt-1 text-[11.5px] text-warn">{t("name.taken")}</p>}
    </>
  );
}

export function NewBranchDialog({
  repo,
  branches,
  from: initialFrom,
  onClose,
}: {
  repo: string;
  branches: RemoteBranch[];
  from: string;
  onClose: () => void;
}) {
  const { t } = useTranslation(["branches", "common"]);
  const [name, setName] = useState("");
  const [from, setFrom] = useState(initialFrom);
  const [busy, setBusy] = useState(false);
  const taken = new Set(branches.map((b) => b.name));
  const n = name.trim();
  const ok = validBranchName(n) && !taken.has(n);
  const create = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      await unwrap(commands.branchesCreate(repo, n, from));
      toast({ kind: "success", title: t("created", { name: n, from }) });
      reloadBranches(repo);
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      width={480}
      kicker={repo}
      title={t("new.title")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={GitBranchPlus}
            loading={busy}
            disabled={!ok}
            onClick={() => void create()}
          >
            {t("new.create")}
          </Button>
        </>
      }
    >
      <div className="space-y-4" onKeyDown={(e) => e.key === "Enter" && void create()}>
        <div>
          <Label>{t("new.name")}</Label>
          <NameField value={name} onChange={setName} taken={taken} autoFocus />
        </div>
        <div>
          <Label hint={t("new.fromHint")}>{t("new.from")}</Label>
          <Select value={from} onChange={(e) => setFrom(e.target.value)}>
            {branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Dialog>
  );
}

export function RenameDialog({
  repo,
  branch,
  isDefault,
  branches,
  onClose,
}: {
  repo: string;
  branch: string;
  isDefault: boolean;
  branches: RemoteBranch[];
  onClose: () => void;
}) {
  const { t } = useTranslation(["branches", "common"]);
  const [name, setName] = useState(branch);
  const [busy, setBusy] = useState(false);
  const taken = new Set(branches.map((b) => b.name).filter((b) => b !== branch));
  const n = name.trim();
  const ok = validBranchName(n) && !taken.has(n) && n !== branch;
  const rename = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      await unwrap(commands.branchesRename(repo, branch, n));
      toast({ kind: "success", title: t("renamed", { from: branch, to: n }) });
      reloadBranches(repo);
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      width={480}
      kicker={repo}
      title={t("rename.title", { name: branch })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="primary" icon={Pencil} loading={busy} disabled={!ok} onClick={() => void rename()}>
            {t("rename.button")}
          </Button>
        </>
      }
    >
      <div className="space-y-2" onKeyDown={(e) => e.key === "Enter" && void rename()}>
        <NameField value={name} onChange={setName} taken={taken} autoFocus />
        <p className="text-[12px] text-dim">{t("rename.note")}</p>
        {isDefault && <p className="text-[12px] text-warn">{t("rename.defaultNote")}</p>}
      </div>
    </Dialog>
  );
}


export function ProtectionForm({
  value: p,
  onChange,
  suggestions,
}: {
  value: Protection;
  onChange: (p: Protection) => void;
  suggestions: string[];
}) {
  const { t } = useTranslation("branches");
  const [check, setCheck] = useState("");
  const set = (patch: Partial<Protection>) => onChange({ ...p, ...patch });
  const addCheck = (c: string) => {
    const x = c.trim();
    if (x && !p.contexts.includes(x)) set({ contexts: [...p.contexts, x] });
    setCheck("");
  };
  const Row = ({ k, sub }: { k: keyof Protection; sub?: boolean }) => (
    <div className={cn(sub && "pl-6")}>
      <Checkbox
        checked={!!p[k]}
        onChange={(v) => set({ [k]: v } as Partial<Protection>)}
        label={
          <span>
            <span className="text-[12.5px]">{t(`rules.${k as "require_pr"}.name`)}</span>
            <span className="block text-[11.5px] text-faint">{t(`rules.${k as "require_pr"}.what`)}</span>
          </span>
        }
      />
    </div>
  );
  return (
    <div className="space-y-2.5">
      <Row k="require_pr" />
      {p.require_pr && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-3 pl-6">
            <span className="text-[12px] text-dim">{t("rules.approvals")}</span>
            <Segmented<string>
              size="sm"
              value={String(p.approvals)}
              onChange={(v) => set({ approvals: Number(v) })}
              options={["0", "1", "2", "3", "4", "5", "6"].map((n) => ({ value: n, label: n }))}
            />
          </div>
          <Row k="dismiss_stale" sub />
          <Row k="code_owners" sub />
          <Row k="last_push_approval" sub />
        </div>
      )}
      <Row k="status_checks" />
      {p.status_checks && (
        <div className="space-y-2 pl-6">
          <Row k="strict" />
          <div className="flex flex-wrap items-center gap-1.5">
            {p.contexts.map((c) => (
              <span
                key={c}
                className="num inline-flex items-center gap-1 rounded-[3px] border border-line-strong bg-surface-2 px-1.5 py-0.5 text-[11.5px]"
              >
                {c}
                <button
                  className="cursor-default text-faint hover:text-danger"
                  onClick={() => set({ contexts: p.contexts.filter((x) => x !== c) })}
                  aria-label={t("rules.removeCheck")}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            {p.contexts.length === 0 && (
              <span className="text-[11.5px] text-warn">{t("rules.noChecks")}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={check}
              onChange={(e) => setCheck(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCheck(check))}
              placeholder={t("rules.checkName")}
              className="num !h-7 text-[12px]"
            />
            <Button
              size="sm"
              variant="secondary"
              icon={Plus}
              disabled={!check.trim()}
              onClick={() => addCheck(check)}
            >
              {t("rules.addCheck")}
            </Button>
          </div>
          {suggestions.filter((s) => !p.contexts.includes(s)).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
              {t("rules.seen")}
              {suggestions
                .filter((s) => !p.contexts.includes(s))
                .map((s) => (
                  <button
                    key={s}
                    className="num cursor-default rounded-[3px] border border-dashed border-line-strong px-1.5 py-0.5 hover:border-accent hover:text-text"
                    onClick={() => addCheck(s)}
                  >
                    + {s}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
      <Row k="conversation_resolution" />
      <Row k="linear_history" />
      <Row k="enforce_admins" />
      <div className="border-t border-line pt-2.5">
        <div className="annot mb-1.5 !text-[9.5px]">{t("rules.allow")}</div>
        <div className="space-y-2.5">
          <Row k="force_pushes" />
          <Row k="deletions" />
        </div>
      </div>
    </div>
  );
}

export function ProtectDialog({
  repo,
  branch,
  onClose,
}: {
  repo: string;
  branch: RemoteBranch;
  onClose: () => void;
}) {
  const { t } = useTranslation(["branches", "common"]);
  const q = useProtection(repo, branch.name);
  const [rules, setRules] = useState<Protection | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data !== undefined && rules === null) setRules(q.data ?? DEFAULT_PROTECTION);
  }, [q.data, rules]);
  useEffect(() => {
    if (branch.sha)
      void unwrap(commands.branchesCheckNames(repo, branch.sha)).then(setSuggestions, () => undefined);
  }, [repo, branch.sha]);
  const save = async () => {
    if (!rules) return;
    setBusy(true);
    try {
      await unwrap(commands.branchesProtect(repo, branch.name, rules));
      toast({ kind: "success", title: t("protect.saved", { name: branch.name }) });
      reloadBranches(repo);
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = useConfirmClick(async () => {
    try {
      await unwrap(commands.branchesUnprotect(repo, branch.name));
      toast({ kind: "success", title: t("protect.removed", { name: branch.name }) });
      reloadBranches(repo);
      onClose();
    } catch (e) {
      toastError(e);
    }
  });
  const unavailable = !!q.error && toAppError(q.error).code === "branches.protection_unavailable";
  return (
    <Dialog
      open
      onClose={onClose}
      width={620}
      kicker={repo}
      title={t("protect.title", { name: branch.name })}
      footer={
        <>
          {q.data && (
            <Button
              variant="ghost"
              icon={ShieldOff}
              className={cn(
                "mr-auto w-[210px] justify-start",
                remove.armed ? "text-danger" : "text-faint hover:text-danger",
              )}
              onClick={remove.onClick}
            >
              {remove.armed ? t("protect.confirmRemove") : t("protect.remove")}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={ShieldCheck}
            loading={busy}
            disabled={!rules || unavailable}
            onClick={() => void save()}
          >
            {q.data ? t("protect.update") : t("protect.button")}
          </Button>
        </>
      }
    >
      {q.isLoading ? (
        <Plotter />
      ) : q.error ? (
        <p className={cn("text-[12.5px]", unavailable ? "text-warn" : "text-danger")}>
          {errorMessage(q.error)}
        </p>
      ) : rules ? (
        <>
          {branch.rule && branch.rule !== branch.name && (
            <p className="mb-3 text-[12px] text-info">{t("protect.byPattern", { rule: branch.rule })}</p>
          )}
          <ProtectionForm value={rules} onChange={setRules} suggestions={suggestions} />
        </>
      ) : null}
    </Dialog>
  );
}
