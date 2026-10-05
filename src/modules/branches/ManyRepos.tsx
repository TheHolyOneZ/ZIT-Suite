import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitBranchPlus, ShieldCheck, ShieldOff } from "lucide-react";
import type { Protection } from "@/core/ipc";
import { useRepoList } from "@/core/data/repos";
import { RepoChecklist } from "@/app/RepoChecklist";
import { Button, Input, Label, Panel, Segmented } from "@/ui";
import { requestQueue } from "@/modules/queue/store";
import { DEFAULT_PROTECTION, ProtectionForm } from "./dialogs";
import { cleanBranchName, validBranchName } from "./model";

type Task = "create" | "protect";


export function ManyRepos() {
  const { t } = useTranslation("branches");
  const [task, setTask] = useState<Task>("create");
  const { data = [] } = useRepoList();
  const writable = useMemo(
    () =>
      data
        .filter((r) => !r.archived && r.permissions?.push && r.default_branch)
        .map((r) => r.full_name)
        .sort(),
    [data],
  );
  const admin = useMemo(
    () =>
      data
        .filter((r) => !r.archived && r.permissions?.admin && r.default_branch)
        .map((r) => r.full_name)
        .sort(),
    [data],
  );
  const [repos, setRepos] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [rules, setRules] = useState<Protection>(DEFAULT_PROTECTION);
  const pool = task === "create" ? writable : admin;
  const picked = [...repos].filter((r) => pool.includes(r));
  const n = name.trim();
  const fromName = from.trim();

  return (
    <div className="mx-auto grid max-w-[1100px] gap-4 p-4 md:grid-cols-[minmax(0,1fr)_380px]">
      <Panel className="space-y-4 p-4">
        <Segmented<Task>
          value={task}
          onChange={setTask}
          options={[
            { value: "create", label: t("many.create"), icon: GitBranchPlus },
            { value: "protect", label: t("many.protect"), icon: ShieldCheck },
          ]}
        />
        {task === "create" ? (
          <div className="space-y-4">
            <div>
              <Label>{t("new.name")}</Label>
              <Input
                value={name}
                onChange={(e) => setName(cleanBranchName(e.target.value))}
                placeholder="release/2026-10"
                className="num"
              />
              {n && !validBranchName(n) && (
                <p className="mt-1 text-[11.5px] text-warn">{t("name.invalid")}</p>
              )}
            </div>
            <div>
              <Label hint={t("many.fromHint")}>{t("new.from")}</Label>
              <Input
                value={from}
                onChange={(e) => setFrom(cleanBranchName(e.target.value))}
                placeholder={t("many.fromDefault")}
                className="num"
              />
            </div>
            <p className="text-[12px] text-faint">{t("many.createNote")}</p>
            <Button
              variant="primary"
              icon={GitBranchPlus}
              disabled={!validBranchName(n) || (!!fromName && !validBranchName(fromName)) || !picked.length}
              onClick={() => requestQueue(picked, { kind: "branch_create", name: n, from: fromName || null })}
            >
              {t("many.createIn", { count: picked.length })}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[12px] text-dim">{t("many.protectNote")}</p>
            <ProtectionForm value={rules} onChange={setRules} suggestions={[]} />
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <Button
                variant="primary"
                icon={ShieldCheck}
                disabled={!picked.length || (rules.status_checks && !rules.contexts.length)}
                onClick={() => requestQueue(picked, { kind: "branch_protect", branch: null, rules })}
              >
                {t("many.protectIn", { count: picked.length })}
              </Button>
              <Button
                variant="danger"
                icon={ShieldOff}
                disabled={!picked.length}
                onClick={() => requestQueue(picked, { kind: "branch_unprotect", branch: null })}
              >
                {t("many.unprotectIn", { count: picked.length })}
              </Button>
            </div>
            <p className="text-[11.5px] text-faint">{t("many.planNote")}</p>
          </div>
        )}
      </Panel>
      <Panel className="p-3">
        <RepoChecklist
          repos={pool}
          value={repos}
          onChange={setRepos}
          title={task === "create" ? t("many.reposWrite") : t("many.reposAdmin")}
          height={520}
        />
      </Panel>
    </div>
  );
}
