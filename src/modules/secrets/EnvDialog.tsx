import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, Layers } from "lucide-react";
import type { BranchPolicy, EnvConfig } from "@/core/ipc";
import { cn } from "@/core/cn";
import { Badge, Button, Checkbox, Dialog, Input, Label, Segmented } from "@/ui";
import { RepoChecklist } from "@/app/RepoChecklist";
import { useQueue } from "@/modules/queue/store";
import { useSecretsIndex, useSecretTargets } from "./api";
import { useSecretsUi } from "./store";

const EMPTY: EnvConfig = {
  wait_timer: 0,
  reviewers: [],
  prevent_self_review: false,
  branch_policy: "all",
  patterns: [],
  can_admins_bypass: true,
};


export function EnvDialog() {
  const { t } = useTranslation(["secrets", "common", "errors"]);
  const req = useSecretsUi((s) => s.env);
  const set = useSecretsUi((s) => s.set);
  const targets = useSecretTargets();
  const { index } = useSecretsIndex();
  const [name, setName] = useState("");
  const [cfg, setCfg] = useState<EnvConfig>(EMPTY);
  const [reviewers, setReviewers] = useState("");
  const [patterns, setPatterns] = useState("");
  const [repos, setRepos] = useState<Set<string>>(new Set());
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!req) return;
    const c = req.config ?? EMPTY;
    setName(req.name ?? "");
    setCfg(c);
    setReviewers(c.reviewers.join(", "));
    setPatterns(c.patterns.join("\n"));
    setRepos(new Set(req.repos ?? []));
    setTried(false);
  }, [req]);

  const has = useMemo(
    () => new Set(index.environments.find((g) => g.name === name.trim())?.repos.map((r) => r.repo) ?? []),
    [index, name],
  );
  const logins = reviewers
    .split(/[\s,]+/)
    .map((r) => r.replace(/^@/, "").trim())
    .filter(Boolean);
  const close = () => set({ env: null });
  const submit = () => {
    setTried(true);
    if (!name.trim() || repos.size === 0 || logins.length > 6) return;
    const config: EnvConfig = {
      ...cfg,
      reviewers: logins,
      prevent_self_review: logins.length > 0 && cfg.prevent_self_review,
      patterns:
        cfg.branch_policy === "custom"
          ? patterns
              .split("\n")
              .map((p) => p.trim())
              .filter(Boolean)
          : [],
    };
    close();
    useQueue
      .getState()
      .requestRun(
        [...repos].map((repo) => ({ repo, action: { kind: "env_upsert", name: name.trim(), config } })),
      );
  };

  return (
    <Dialog
      open={!!req}
      onClose={close}
      width={req?.fixed ? 600 : 920}
      kicker={t("title")}
      title={t("envDialog.title")}
      footer={
        <>
          <span className="num mr-auto text-[11.5px] text-faint">
            {t("dialog.summary", { count: repos.size })}
          </span>
          <Button variant="ghost" onClick={close}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="primary" icon={Layers} disabled={repos.size === 0} onClick={submit}>
            {t("envDialog.submit")}
          </Button>
        </>
      }
    >
      <div className={cn("gap-6", req?.fixed ? "space-y-4" : "grid grid-cols-2")}>
        <div className="space-y-4">
          <div>
            <Label
              hint={
                tried && !name.trim() ? (
                  <span className="text-danger">{t("envDialog.nameRequired")}</span>
                ) : undefined
              }
            >
              {t("envDialog.name")}
            </Label>
            <Input
              autoFocus={!req?.name}
              value={name}
              readOnly={!!req?.name}
              onChange={(e) => setName(e.target.value)}
              placeholder="production"
              className={cn("num", req?.name && "opacity-70")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("envDialog.waitTimer")}</Label>
              <Input
                type="number"
                min={0}
                max={43200}
                value={cfg.wait_timer}
                onChange={(e) =>
                  setCfg({ ...cfg, wait_timer: Math.max(0, Math.min(43200, Number(e.target.value) || 0)) })
                }
                trailing={<span className="text-[11px] text-faint">{t("envDialog.minutes")}</span>}
                className="num pr-16"
              />
            </div>
            <div className="flex items-end pb-1.5">
              <Checkbox
                checked={cfg.can_admins_bypass}
                onChange={(can_admins_bypass) => setCfg({ ...cfg, can_admins_bypass })}
                label={t("envDialog.bypass")}
              />
            </div>
          </div>
          <div>
            <Label
              hint={
                logins.length > 6 ? (
                  <span className="text-danger">{t("errors:secrets.too_many_reviewers")}</span>
                ) : (
                  t("envDialog.reviewersHint")
                )
              }
            >
              {t("envDialog.reviewers")}
            </Label>
            <Input
              value={reviewers}
              onChange={(e) => setReviewers(e.target.value)}
              placeholder="octocat, hubot"
              className="num"
            />
            <Checkbox
              className="mt-1.5"
              checked={logins.length > 0 && cfg.prevent_self_review}
              onChange={(prevent_self_review) => setCfg({ ...cfg, prevent_self_review })}
              label={
                <span className={cn("text-[12px]", !logins.length && "opacity-50")}>
                  {t("envDialog.selfReview")}
                </span>
              }
            />
          </div>
          <div>
            <Label>{t("envDialog.branches")}</Label>
            <Segmented<BranchPolicy>
              size="sm"
              className="w-full"
              value={cfg.branch_policy}
              onChange={(branch_policy) => setCfg({ ...cfg, branch_policy })}
              options={(["all", "protected", "custom"] as const).map((b) => ({
                value: b,
                label: t(`rules.branch.${b}`),
              }))}
            />
            {cfg.branch_policy === "custom" && (
              <div className="mt-2">
                <Label hint={t("envDialog.patternsHint")}>{t("envDialog.patterns")}</Label>
                <textarea
                  value={patterns}
                  onChange={(e) => setPatterns(e.target.value)}
                  rows={3}
                  spellCheck={false}
                  placeholder={"main\nrelease/*"}
                  className="num w-full resize-y rounded-[var(--radius)] border border-line-strong bg-surface px-2.5 py-2 text-[12px] outline-none focus:border-accent"
                />
              </div>
            )}
          </div>
          <p className="flex items-start gap-1.5 text-[11.5px] text-faint">
            <Info size={12} className="mt-0.5 shrink-0" /> {req?.fixed ? `${t("envDialog.fixedNote")} ` : ""}
            {t("envDialog.planNote")}
          </p>
        </div>
        {!req?.fixed && (
          <RepoChecklist
            repos={targets}
            value={repos}
            onChange={setRepos}
            title={t("envDialog.repos")}
            height={470}
            note={(r) => (has.has(r) ? <Badge tone="info">{t("envDialog.has")}</Badge> : null)}
          />
        )}
      </div>
    </Dialog>
  );
}
