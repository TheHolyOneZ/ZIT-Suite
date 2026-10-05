import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Role } from "@/core/ipc";
import { sheets } from "@/core/sheets/store";
import { Avatar, EmptyState, MenuItem, MenuLabel, MenuSeparator, Popover } from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { ROLES, type Grant, type Person } from "./model";
import { RoleCell } from "./RoleChip";


export function MatrixView({ people }: { people: Person[] }) {
  const { t } = useTranslation("collaborators");
  const repos = useMemo(() => [...new Set(people.flatMap((p) => p.grants.map((g) => g.repo)))].sort(), [people]);
  if (people.length === 0) return <EmptyState title={t("emptyPeople")} />;
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="border-collapse">
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-20 min-w-[200px] border-r border-b border-line bg-surface" />
            {repos.map((r) => (
              <th key={r} className="sticky top-0 z-10 h-[150px] w-8 border-r border-b border-line bg-surface p-0 align-bottom">
                <button
                  onClick={() => sheets.push("collaborators", "repo", { repo: r, title: r.split("/")[1] })}
                  title={r}
                  className="num mx-auto mb-2 block text-[11px] font-normal text-dim hover:text-accent cursor-default"
                >

                  <span className="inline-block max-h-[140px] truncate" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                    {r.split("/")[1]}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => {
            const byRepo = new Map(p.grants.map((g) => [g.repo, g]));
            return (
              <tr key={p.login} className="hover:bg-surface-2">
                <th className="sticky left-0 z-10 border-r border-b border-line bg-surface px-3 py-1.5 text-left font-normal">
                  <button onClick={() => sheets.push("collaborators", "person", { login: p.login })} className="flex items-center gap-2 cursor-default">
                    <Avatar src={p.avatar_url} alt={p.login} size={18} />
                    <span className="num text-[12px] hover:text-accent">{p.login}</span>
                  </button>
                </th>
                {repos.map((r) => (
                  <td key={r} className="h-8 w-8 border-r border-b border-line p-0 text-center">
                    {byRepo.get(r) ? <Cell login={p.login} grant={byRepo.get(r)!} /> : null}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ login, grant }: { login: string; grant: Grant }) {
  const { t } = useTranslation("collaborators");
  const run = (role: Role | null) =>
    useQueue.getState().requestRun([
      role
        ? { repo: grant.repo, action: { kind: "collab_set", user: login, role } }
        : grant.invite
          ? { repo: grant.repo, action: { kind: "invite_cancel", id: grant.invite.id, user: login } }
          : { repo: grant.repo, action: { kind: "collab_remove", user: login } },
    ]);
  return (
    <Popover
      placement="bottom-start"
      trigger={(p) => (
        <button {...p} className="flex size-8 items-center justify-center cursor-default">
          <RoleCell role={grant.role} invited={!!grant.invite} />
        </button>
      )}
    >
      {(c) => (
        <>
          <MenuLabel>
            {login} · {grant.repo.split("/")[1]}
          </MenuLabel>
          {[...ROLES].reverse().map((r) => (
            <MenuItem key={r} active={r === grant.role} disabled={!!grant.invite} onClick={() => (c(), run(r))}>
              <span className="flex items-center gap-2">
                <RoleCell role={r} size={14} />
                {t(`roles.${r}`)}
              </span>
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem danger onClick={() => (c(), run(null))}>
            {grant.invite ? t("cancelInvite") : t("revoke")}
          </MenuItem>
        </>
      )}
    </Popover>
  );
}
