import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Pencil, Send } from "lucide-react";
import { useRepoList } from "@/core/data/repos";
import { cn } from "@/core/cn";
import { RepoChecklist } from "@/app/RepoChecklist";
import { Badge, Button, Checkbox, Input, Label, PageHeader, Panel, Segmented } from "@/ui";
import { requestQueue, useQueue } from "@/modules/queue/store";
import {
  NO_RULES,
  planRenames,
  validRepoName,
  type CaseMode,
  type PlanStatus,
  type RenameRules,
} from "./model";

type Mode = "rename" | "transfer";

const STATUS_TONE: Record<PlanStatus, "ok" | "idle" | "warn" | "danger"> = {
  ok: "ok",
  same: "idle",
  invalid: "danger",
  duplicate: "warn",
  taken: "warn",
};


export function MigrationPage() {
  const { t } = useTranslation(["migration", "common"]);
  const { data = [] } = useRepoList();
  const [mode, setMode] = useState<Mode>("rename");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const admin = useMemo(
    () =>
      data
        .filter((r) => r.permissions?.admin)
        .map((r) => r.full_name)
        .sort((a, b) => a.localeCompare(b)),
    [data],
  );
  const repos = [...picked].filter((r) => admin.includes(r)).sort((a, b) => a.localeCompare(b));

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={<span>{t("subtitle")}</span>}
        actions={
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "rename", label: t("modes.rename"), icon: Pencil },
              { value: "transfer", label: t("modes.transfer"), icon: Send },
            ]}
          />
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1200px] gap-4 p-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <Panel className="h-fit p-3">
            <RepoChecklist
              repos={admin}
              value={picked}
              onChange={setPicked}
              title={t("pick", { count: repos.length })}
              height={560}
            />
            <p className="mt-2 text-[11px] text-faint">{t("adminOnly")}</p>
          </Panel>
          {mode === "rename" ? (
            <RenamePlan repos={repos} existing={data.map((r) => r.full_name)} />
          ) : (
            <TransferPlan repos={repos} />
          )}
        </div>
      </div>
    </div>
  );
}

function RenamePlan({ repos, existing }: { repos: string[]; existing: string[] }) {
  const { t } = useTranslation("migration");
  const [rules, setRules] = useState<RenameRules>(NO_RULES);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const set = (p: Partial<RenameRules>) => setRules({ ...rules, ...p });
  const rows = useMemo(
    () => planRenames(repos, rules, overrides, existing),
    [repos, rules, overrides, existing],
  );
  const ready = rows.filter((r) => r.status === "ok");
  const field = (k: keyof RenameRules, label: string, ph = "") => (
    <div>
      <Label>{label}</Label>
      <Input
        value={rules[k] as string}
        onChange={(e) => set({ [k]: e.target.value } as Partial<RenameRules>)}
        placeholder={ph}
        className="num !h-8"
      />
    </div>
  );
  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <div className="annot mb-3">{t("rules.title")}</div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {field("stripPrefix", t("rules.stripPrefix"), "old-")}
          {field("stripSuffix", t("rules.stripSuffix"), "-legacy")}
          {field("prefix", t("rules.prefix"), "z-")}
          {field("suffix", t("rules.suffix"), "-archive")}
          {field("find", t("rules.find"))}
          {field("replace", t("rules.replace"))}
          <div className="sm:col-span-2">
            <Label>{t("rules.case")}</Label>
            <Segmented<CaseMode>
              size="sm"
              className="w-full"
              value={rules.caseMode}
              onChange={(caseMode) => set({ caseMode })}
              options={(["keep", "lower", "kebab", "snake"] as const).map((c) => ({
                value: c,
                label: t(`case.${c}`),
              }))}
            />
          </div>
          <div className="flex items-end pb-1.5">
            <Checkbox
              checked={rules.regex}
              onChange={(regex) => set({ regex })}
              label={<span className="text-[12px]">{t("rules.regex")}</span>}
            />
          </div>
        </div>
        <p className="mt-3 text-[11.5px] text-faint">{t("rules.order")}</p>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-3 py-2">
          <span className="annot flex-1">{t("plan.title", { count: rows.length })}</span>
          {Object.keys(overrides).length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setOverrides({})}>
              {t("plan.resetEdits")}
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            icon={Pencil}
            disabled={!ready.length}
            onClick={() =>
              useQueue
                .getState()
                .requestRun(
                  ready.map((r) => ({ repo: r.repo, action: { kind: "repo_rename", new_name: r.to } })),
                )
            }
          >
            {t("plan.run", { count: ready.length })}
          </Button>
        </div>
        {rows.length === 0 && (
          <div className="px-3 py-8 text-center text-[12.5px] text-faint">{t("plan.pickFirst")}</div>
        )}
        {rows.map((r) => (
          <div
            key={r.repo}
            className="grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)_110px] items-center gap-3 border-b border-line px-3 py-1.5 last:border-b-0"
          >
            <span className="num truncate text-[12.5px] text-dim" title={r.repo}>
              {r.from}
            </span>
            <ArrowRight size={12} className="text-faint" />
            <Input
              value={r.to}
              onChange={(e) => setOverrides({ ...overrides, [r.repo]: e.target.value })}
              className={cn(
                "num !h-7 text-[12.5px]",
                r.status !== "ok" && r.status !== "same" && "!border-warn",
              )}
            />
            <Badge tone={STATUS_TONE[r.status]}>{t(`status.${r.status}`)}</Badge>
          </div>
        ))}
      </Panel>
      <Notes keys={["renameRedirects", "renamePages", "renameClones"]} />
    </div>
  );
}

function TransferPlan({ repos }: { repos: string[] }) {
  const { t } = useTranslation("migration");
  const [owner, setOwner] = useState("");
  const [newName, setNewName] = useState("");
  const o = owner.trim();
  const ownerOk = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(o);
  const single = repos.length === 1;
  const nameOk = !newName.trim() || validRepoName(newName.trim());
  return (
    <div className="space-y-4">
      <Panel className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label hint={t("transfer.ownerHint")}>{t("transfer.owner")}</Label>
            <Input
              value={owner}
              onChange={(e) => setOwner(e.target.value.replace(/\s+/g, ""))}
              placeholder="my-org"
              className="num"
            />
            {o && !ownerOk && <p className="mt-1 text-[11.5px] text-warn">{t("transfer.badOwner")}</p>}
          </div>
          <div>
            <Label hint={single ? t("transfer.newNameHint") : t("transfer.newNameMany")}>
              {t("transfer.newName")}
            </Label>
            <Input
              value={newName}
              disabled={!single}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={single ? repos[0].split("/")[1] : ""}
              className="num"
            />
            {!nameOk && <p className="mt-1 text-[11.5px] text-warn">{t("transfer.badName")}</p>}
          </div>
        </div>
        <div className="space-y-1">
          {repos.map((r) => (
            <div key={r} className="num flex items-center gap-2 text-[12.5px]">
              <span className="text-dim">{r}</span>
              <ArrowRight size={12} className="text-faint" />
              <span className={o ? "text-text" : "text-faint"}>
                {o || "…"}/{(single && newName.trim()) || r.split("/")[1]}
              </span>
            </div>
          ))}
          {!repos.length && <p className="text-[12.5px] text-faint">{t("plan.pickFirst")}</p>}
        </div>
        <Button
          variant="danger"
          icon={Send}
          disabled={!repos.length || !ownerOk || !nameOk}
          onClick={() =>
            requestQueue(repos, {
              kind: "repo_transfer",
              new_owner: o,
              new_name: single && newName.trim() ? newName.trim() : null,
            })
          }
        >
          {o
            ? t("transfer.run", { count: repos.length, owner: o })
            : t("transfer.runNoOwner", { count: repos.length })}
        </Button>
      </Panel>
      <Notes keys={["transferMoves", "transferUser", "transferOrg", "transferAccess"]} />
    </div>
  );
}

function Notes({ keys }: { keys: string[] }) {
  const { t } = useTranslation("migration");
  return (
    <Panel className="p-4">
      <div className="annot mb-2">{t("notes.title")}</div>
      <ul className="list-disc space-y-1 pl-5 text-[12px] text-dim">
        {keys.map((k) => (
          <li key={k}>{t(`notes.${k as "renameRedirects"}`)}</li>
        ))}
      </ul>
    </Panel>
  );
}
