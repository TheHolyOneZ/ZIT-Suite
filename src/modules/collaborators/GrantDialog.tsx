import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { UserMinus, UserPlus } from "lucide-react";
import type { NewQueueItem, Role } from "@/core/ipc";
import { Button, Dialog, Input, Label, Segmented } from "@/ui";
import { RepoChecklist } from "@/app/RepoChecklist";
import { useQueue } from "@/modules/queue/store";
import { useScanTargets } from "./api";
import { RoleSelect } from "./RoleSelect";
import { useAccessUi } from "./store";


export function GrantDialog() {
  const { t } = useTranslation(["collaborators", "common"]);
  const grant = useAccessUi((s) => s.grant);
  const set = useAccessUi((s) => s.set);
  const targets = useScanTargets();
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [users, setUsers] = useState("");
  const [role, setRole] = useState<Role>("write");
  const [repos, setRepos] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!grant) return;
    setMode(grant.mode);
    setUsers(grant.users.join(", "));
    setRepos(new Set(grant.repos));
  }, [grant]);

  const logins = users.split(/[\s,]+/).map((u) => u.replace(/^@/, "").trim()).filter(Boolean);
  const submit = () => {
    const items: NewQueueItem[] = [];
    for (const repo of repos)
      for (const user of logins) items.push(mode === "add" ? { repo, action: { kind: "collab_set", user, role } } : { repo, action: { kind: "collab_remove", user } });
    set({ grant: null });
    useQueue.getState().requestRun(items);
  };

  return (
    <Dialog
      open={!!grant}
      onClose={() => set({ grant: null })}
      kicker={t("grant.kicker")}
      title={mode === "add" ? t("grant.titleAdd") : t("grant.titleRemove")}
      width={720}
      footer={
        <>
          <span className="num mr-auto text-[11.5px] text-faint">{t("grant.peopleCount", { count: logins.length })} × {t("grant.repoCount", { count: repos.size })}</span>
          <Button variant="ghost" onClick={() => set({ grant: null })}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant={mode === "add" ? "primary" : "danger"} icon={mode === "add" ? UserPlus : UserMinus} disabled={!logins.length || !repos.size} onClick={submit}>
            {t("grant.review")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[260px_minmax(0,1fr)] gap-5">
        <div className="space-y-4">
          <Segmented
            className="w-full"
            value={mode}
            onChange={setMode}
            options={[
              { value: "add", label: t("grant.add"), icon: UserPlus },
              { value: "remove", label: t("grant.remove"), icon: UserMinus },
            ]}
          />
          <div>
            <Label>{t("grant.people")}</Label>
            <Input autoFocus value={users} onChange={(e) => setUsers(e.target.value)} placeholder="login, other-login" className="num" />
            <p className="mt-1 text-[11px] text-faint">{t("grant.peopleHint")}</p>
          </div>
          {mode === "add" && (
            <div>
              <Label>{t("grant.role")}</Label>
              <RoleSelect value={role} onChange={setRole} className="h-8 w-full text-[12.5px]" />
            </div>
          )}
          <p className="text-[11.5px] text-faint">{mode === "add" ? t("grant.addNote") : t("grant.removeNote")}</p>
        </div>
        <RepoChecklist repos={targets} value={repos} onChange={setRepos} title={t("grant.repos")} />
      </div>
    </Dialog>
  );
}
