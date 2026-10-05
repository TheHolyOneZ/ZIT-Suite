import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChevronLeft, ExternalLink, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { commands, unwrap, type Ruleset, type RulesetDraft } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { queryClient } from "@/core/query";
import { toast } from "@/core/store/toasts";
import { Badge, Button, Checkbox, Dialog, Input, Label, Plotter, Segmented, useConfirmClick } from "@/ui";
import { branchesKey, useRulesets } from "./api";

const EMPTY: RulesetDraft = {
  name: "",
  enforcement: "active",
  include: ["~DEFAULT_BRANCH"],
  exclude: [],
  block_deletion: true,
  block_force_push: true,
  linear_history: false,
  signed_commits: false,
  restrict_creation: false,
  restrict_update: false,
  pull_request: null,
  status_checks: null,
  other_rules: [],
};

const lines = (s: string) =>
  s
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);


export function RulesetsDialog({ repo, onClose }: { repo: string; onClose: () => void }) {
  const { t } = useTranslation("branches");
  const list = useRulesets(repo);
  const [editing, setEditing] = useState<Ruleset | "new" | null>(null);
  return (
    <Dialog open onClose={onClose} kicker={repo} title={t("rulesets.title")} width={680}>
      {editing ? (
        <Editor repo={repo} ruleset={editing === "new" ? null : editing} onBack={() => setEditing(null)} />
      ) : (
        <div className="space-y-3">
          <p className="text-[12.5px] text-dim">{t("rulesets.intro")}</p>
          {list.isLoading ? (
            <Plotter />
          ) : (
            <div className="rounded-[var(--radius)] border border-line">
              {(list.data ?? []).map((r) => {
                const own = !r.source_type || r.source_type === "Repository";
                return (
                  <button
                    key={r.id}
                    disabled={!own}
                    onClick={() => setEditing(r)}
                    className="flex w-full cursor-default items-center gap-2.5 border-b border-line px-3 py-2 text-left last:border-b-0 enabled:hover:bg-surface-2"
                  >
                    <ShieldCheck
                      size={14}
                      className={r.enforcement === "active" ? "text-ok" : "text-faint"}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{r.name}</span>
                    {!own && <Badge>{t("rulesets.fromOrg")}</Badge>}
                    <Badge
                      tone={
                        r.enforcement === "active" ? "ok" : r.enforcement === "evaluate" ? "info" : "idle"
                      }
                    >
                      {t(`rulesets.enf.${r.enforcement as "active"}`)}
                    </Badge>
                  </button>
                );
              })}
              {!list.data?.length && (
                <div className="px-3 py-3 text-[12px] text-faint">{t("rulesets.none")}</div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>
              {t("rulesets.new")}
            </Button>
            <Button
              variant="ghost"
              icon={ExternalLink}
              onClick={() => void openUrl(`https://github.com/${repo}/settings/rules`)}
            >
              {t("rulesets.onGitHub")}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Editor({ repo, ruleset, onBack }: { repo: string; ruleset: Ruleset | null; onBack: () => void }) {
  const q = useQuery({
    queryKey: ["branches", "ruleset", repo, ruleset?.id],
    queryFn: () => unwrap(commands.rulesetsGet(repo, ruleset!.id)),
    enabled: !!ruleset,
    gcTime: 0,
  });
  if (ruleset && q.isLoading) return <Plotter />;
  if (q.error) return <div className="text-[12px] text-danger">{errorMessage(q.error)}</div>;
  return (
    <Form
      key={ruleset?.id ?? "new"}
      repo={repo}
      id={ruleset?.id ?? null}
      initial={q.data ?? EMPTY}
      onBack={onBack}
    />
  );
}

function Form({
  repo,
  id,
  initial,
  onBack,
}: {
  repo: string;
  id: number | null;
  initial: RulesetDraft;
  onBack: () => void;
}) {
  const { t } = useTranslation("branches");
  const [d, setD] = useState<RulesetDraft>(initial);
  const [include, setInclude] = useState(initial.include.join("\n"));
  const [exclude, setExclude] = useState(initial.exclude.join("\n"));
  const [checks, setChecks] = useState((initial.status_checks?.contexts ?? []).join("\n"));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<RulesetDraft>) => setD({ ...d, ...p });
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: branchesKey.rulesets(repo) });
    onBack();
  };
  const save = async () => {
    const draft: RulesetDraft = {
      ...d,
      include: lines(include),
      exclude: lines(exclude),
      status_checks: d.status_checks ? { ...d.status_checks, contexts: lines(checks) } : null,
    };
    setBusy(true);
    try {
      await unwrap(
        id == null ? commands.rulesetsCreate(repo, draft) : commands.rulesetsUpdate(repo, id, draft),
      );
      toast({ kind: "success", title: t("rulesets.saved", { name: draft.name }) });
      done();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const del = useConfirmClick(async () => {
    try {
      await unwrap(commands.rulesetsDelete(repo, id!));
      toast({ kind: "success", title: t("rulesets.deleted", { name: d.name }) });
      done();
    } catch (e) {
      toastError(e);
    }
  });
  const flag = (
    k:
      | "block_deletion"
      | "block_force_push"
      | "linear_history"
      | "signed_commits"
      | "restrict_creation"
      | "restrict_update",
  ) => (
    <Checkbox
      checked={d[k]}
      onChange={(v) => set({ [k]: v })}
      label={<span className="text-[12.5px]">{t(`rulesets.rule.${k}`)}</span>}
    />
  );
  const pr = d.pull_request;
  return (
    <div className="space-y-4">
      <button
        className="flex cursor-default items-center gap-1 text-[12px] text-dim hover:text-accent"
        onClick={onBack}
      >
        <ChevronLeft size={13} />
        {t("rulesets.back")}
      </button>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4">
        <div>
          <Label>{t("rulesets.name")}</Label>
          <Input
            autoFocus
            value={d.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder={t("rulesets.namePlaceholder")}
          />
        </div>
        <div>
          <Label>{t("rulesets.enforcement")}</Label>
          <Segmented<string>
            size="sm"
            value={d.enforcement}
            onChange={(enforcement) => set({ enforcement })}
            options={(["active", "evaluate", "disabled"] as const).map((v) => ({
              value: v,
              label: t(`rulesets.enf.${v}`),
            }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>{t("rulesets.include")}</Label>
          <textarea
            value={include}
            onChange={(e) => setInclude(e.target.value)}
            rows={3}
            className="num w-full rounded-[var(--radius)] border border-line-strong bg-surface px-2 py-1.5 text-[12px] outline-none focus:border-accent"
          />
          <p className="mt-1 text-[11px] text-faint">{t("rulesets.patternHint")}</p>
        </div>
        <div>
          <Label>{t("rulesets.exclude")}</Label>
          <textarea
            value={exclude}
            onChange={(e) => setExclude(e.target.value)}
            rows={3}
            className="num w-full rounded-[var(--radius)] border border-line-strong bg-surface px-2 py-1.5 text-[12px] outline-none focus:border-accent"
          />
        </div>
      </div>
      <div>
        <Label>{t("rulesets.rules")}</Label>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {flag("block_deletion")}
          {flag("block_force_push")}
          {flag("linear_history")}
          {flag("signed_commits")}
          {flag("restrict_creation")}
          {flag("restrict_update")}
        </div>
      </div>
      <div className="space-y-1.5 rounded-[var(--radius)] border border-line p-3">
        <Checkbox
          checked={!!pr}
          onChange={(on) =>
            set({
              pull_request: on
                ? {
                    approvals: 1,
                    dismiss_stale: true,
                    code_owners: false,
                    last_push: false,
                    resolve_threads: false,
                  }
                : null,
            })
          }
          label={<span className="text-[12.5px] font-medium">{t("rulesets.rule.pull_request")}</span>}
        />
        {pr && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pl-6">
            <label className="flex items-center gap-2 text-[12.5px]">
              <Input
                type="number"
                min={0}
                max={10}
                value={pr.approvals}
                onChange={(e) =>
                  set({
                    pull_request: {
                      ...pr,
                      approvals: Math.max(0, Math.min(10, Number(e.target.value) || 0)),
                    },
                  })
                }
                className="num h-7 w-16"
              />
              {t("rulesets.approvals")}
            </label>
            <Checkbox
              checked={pr.dismiss_stale}
              onChange={(v) => set({ pull_request: { ...pr, dismiss_stale: v } })}
              label={<span className="text-[12.5px]">{t("rulesets.dismissStale")}</span>}
            />
            <Checkbox
              checked={pr.code_owners}
              onChange={(v) => set({ pull_request: { ...pr, code_owners: v } })}
              label={<span className="text-[12.5px]">{t("rulesets.codeOwners")}</span>}
            />
            <Checkbox
              checked={pr.last_push}
              onChange={(v) => set({ pull_request: { ...pr, last_push: v } })}
              label={<span className="text-[12.5px]">{t("rulesets.lastPush")}</span>}
            />
            <Checkbox
              checked={pr.resolve_threads}
              onChange={(v) => set({ pull_request: { ...pr, resolve_threads: v } })}
              label={<span className="text-[12.5px]">{t("rulesets.resolveThreads")}</span>}
            />
          </div>
        )}
      </div>
      <div className="space-y-1.5 rounded-[var(--radius)] border border-line p-3">
        <Checkbox
          checked={!!d.status_checks}
          onChange={(on) => set({ status_checks: on ? { strict: false, contexts: [] } : null })}
          label={<span className="text-[12.5px] font-medium">{t("rulesets.rule.status_checks")}</span>}
        />
        {d.status_checks && (
          <div className="space-y-1.5 pl-6">
            <textarea
              value={checks}
              onChange={(e) => setChecks(e.target.value)}
              rows={2}
              placeholder={t("rulesets.checksPlaceholder")}
              className="num w-full rounded-[var(--radius)] border border-line-strong bg-surface px-2 py-1.5 text-[12px] outline-none focus:border-accent"
            />
            <Checkbox
              checked={d.status_checks.strict}
              onChange={(strict) => set({ status_checks: { ...d.status_checks!, strict } })}
              label={<span className="text-[12.5px]">{t("rulesets.strict")}</span>}
            />
          </div>
        )}
      </div>
      {d.other_rules.length > 0 && (
        <p className="text-[11.5px] text-faint">
          {t("rulesets.otherRules", { list: d.other_rules.join(", ") })}
        </p>
      )}
      <div className="flex items-center gap-2 border-t border-line pt-3">
        {id != null && (
          <Button
            variant={del.armed ? "danger" : "ghost"}
            icon={Trash2}
            onClick={del.onClick}
          >
            {del.armed ? t("rulesets.confirmDelete") : t("rulesets.delete")}
          </Button>
        )}
        <span className="flex-1" />
        <Button onClick={onBack}>{t("rulesets.cancel")}</Button>
        <Button
          variant="primary"
          loading={busy}
          disabled={!d.name.trim() || !lines(include).length}
          onClick={() => void save()}
        >
          {id == null ? t("rulesets.create") : t("rulesets.save")}
        </Button>
      </div>
    </div>
  );
}
