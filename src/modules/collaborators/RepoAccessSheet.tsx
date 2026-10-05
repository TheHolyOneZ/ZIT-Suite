import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Copy, GitCompareArrows, UserMinus, UserPlus } from "lucide-react";
import { commands, unwrap, type Role } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { formatRelative } from "@/core/i18n/format";
import { sheets, type SheetParams } from "@/core/sheets/store";

import { Avatar, Badge, Button, EmptyState, IconButton, Input, Panel, Plotter } from "@/ui";
import { RepoPicker } from "@/app/RepoPicker";
import { useQueue } from "@/modules/queue/store";
import { refreshRepoAccess, useRepoAccess } from "./api";
import { diffAccess } from "./model";
import { RoleCell } from "./RoleChip";
import { RoleSelect } from "./RoleSelect";
import { useAccessUi } from "./store";


export function RepoAccessSheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["collaborators", "common"]);
  const repo = String(params.repo);
  const { data, isLoading, isError, error } = useRepoAccess(repo);
  const [login, setLogin] = useState("");
  const [role, setRole] = useState<Role>("write");
  const [other, setOther] = useState<string | null>(null);
  const setUi = useAccessUi((s) => s.set);
  const q = useQueue.getState();
  const owner = repo.split("/")[0].toLowerCase();

  const otherAccess = useQuery({ queryKey: ["access", "repo", other], queryFn: () => unwrap(commands.collabAccess(other!, false)), enabled: !!other });
  const diff = useMemo(() => (data && otherAccess.data ? diffAccess(data, otherAccess.data) : null), [data, otherAccess.data]);

  if (isLoading) return <Plotter />;
  if (isError || !data) return <EmptyState title={errorMessage(error)} />;
  if (data.error) return <EmptyState title={errorMessage(data.error)} />;
  const collabs = data.collaborators.filter((c) => c.login.toLowerCase() !== owner);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-line-strong bg-surface px-6 pt-5 pb-4">
        <div className="annot">{t("repo.kicker")}</div>
        <h2 className="num text-[19px] font-semibold">{repo}</h2>
        <div className="mt-1 text-[12px] text-dim">
          {t("repo.collabCount", { count: collabs.length })} · {t("repo.inviteCount", { count: data.invitations.length })}
        </div>
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (login.trim()) q.requestRun([{ repo, action: { kind: "collab_set", user: login.trim().replace(/^@/, ""), role } }]);
            setLogin("");
          }}
        >
          <div className="w-[240px]">
            <Input icon={UserPlus} value={login} onChange={(e) => setLogin(e.target.value)} placeholder={t("repo.addPlaceholder")} className="num" />
          </div>
          <RoleSelect value={role} onChange={setRole} className="h-8 w-[130px] text-[12.5px]" />
          <Button type="submit" variant="primary" disabled={!login.trim()}>
            {t("repo.add")}
          </Button>
          <span className="flex-1" />
          <Button icon={Copy} disabled={collabs.length === 0} onClick={() => setUi({ grant: { users: collabs.map((c) => c.login), repos: [], mode: "add" } })}>
            {t("repo.copyTo")}
          </Button>
        </form>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-6 p-6">
        <div className="space-y-5">
          <section>
            <div className="annot mb-2">{t("repo.collaborators")}</div>
            <Panel>
              {collabs.length === 0 && <div className="px-4 py-5 text-center text-[12px] text-faint">{t("repo.none")}</div>}
              {collabs.map((c) => (
                <div key={c.login} className="grid grid-cols-[minmax(0,1fr)_140px_32px] items-center gap-3 border-b border-line px-4 py-2 last:border-0">
                  <button onClick={() => sheets.push("collaborators", "person", { login: c.login })} className="flex min-w-0 items-center gap-2 text-left cursor-default">
                    <Avatar src={c.avatar_url} alt={c.login} size={20} />
                    <span className="num truncate text-[12.5px] hover:text-accent">{c.login}</span>
                    {c.kind === "Bot" && <Badge mono>bot</Badge>}
                    {c.role_name && !["read", "triage", "write", "maintain", "admin"].includes(c.role_name) && <Badge mono>{c.role_name}</Badge>}
                  </button>
                  <RoleSelect value={c.role} onChange={(r) => q.requestRun([{ repo, action: { kind: "collab_set", user: c.login, role: r } }])} />
                  <IconButton icon={UserMinus} label={t("revoke")} onClick={() => q.requestRun([{ repo, action: { kind: "collab_remove", user: c.login } }])} />
                </div>
              ))}
            </Panel>
          </section>

          <section>
            <div className="annot mb-2">{t("repo.invitations")}</div>
            <Panel>
              {data.invitations.length === 0 && <div className="px-4 py-5 text-center text-[12px] text-faint">{t("repo.noInvites")}</div>}
              {data.invitations.map((i) => (
                <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_140px_32px] items-center gap-3 border-b border-line px-4 py-2 last:border-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar src={i.avatar_url} alt={i.login} size={20} />
                    <span className="num truncate text-[12.5px]">{i.login}</span>
                    <Badge tone={i.expired ? "danger" : "warn"} mono>
                      {i.expired ? t("expired") : t("invitedAgo", { when: formatRelative(i.created_at) })}
                    </Badge>
                  </span>
                  <RoleSelect
                    value={i.role}
                    onChange={async (r) => {
                      try {
                        await unwrap(commands.collabUpdateInvitation(repo, i.id, r));
                        await refreshRepoAccess(repo);
                      } catch (e) {
                        toastError(e);
                      }
                    }}
                  />
                  <IconButton icon={UserMinus} label={t("cancelInvite")} onClick={() => q.requestRun([{ repo, action: { kind: "invite_cancel", id: i.id, user: i.login } }])} />
                </div>
              ))}
            </Panel>
          </section>
        </div>

        <aside>
          <Panel ticks className="p-4">
            <div className="annot mb-2 flex items-center gap-1.5">
              <GitCompareArrows size={12} /> {t("compare.title")}
            </div>
            <RepoPicker value={other} onChange={setOther} placeholder={t("compare.pick")} />
            {otherAccess.isFetching && <Plotter className="mt-3" />}
            {diff && (
              <div className="mt-3 space-y-3 text-[12px]">
                <DiffBlock title={t("compare.onlyHere")} rows={diff.onlyA.map((d) => ({ login: d.login, a: d.role }))} />
                <DiffBlock title={t("compare.onlyThere")} rows={diff.onlyB.map((d) => ({ login: d.login, b: d.role }))} />
                <DiffBlock title={t("compare.different")} rows={diff.changed} />
                <div className="text-faint">{t("compare.same", { count: diff.same })}</div>
                {diff.onlyA.length + diff.changed.length > 0 && (
                  <Button
                    size="sm"
                    icon={ArrowRight}
                    className="h-auto min-h-7 w-full py-1 leading-snug whitespace-normal"
                    onClick={() =>
                      q.requestRun([
                        ...diff.onlyA.map((d) => ({ repo: other!, action: { kind: "collab_set" as const, user: d.login, role: d.role } })),
                        ...diff.changed.map((d) => ({ repo: other!, action: { kind: "collab_set" as const, user: d.login, role: d.a } })),
                      ])
                    }
                  >
                    {t("compare.align", { repo: other!.split("/")[1] })}
                  </Button>
                )}
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function DiffBlock({ title, rows }: { title: string; rows: { login: string; a?: Role; b?: Role }[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="annot mb-1 !text-[9.5px]">{title}</div>
      {rows.map((r) => (
        <div key={r.login} className="flex items-center gap-2 py-0.5">
          <span className="num flex-1 truncate">{r.login}</span>
          {r.a && <RoleCell role={r.a} size={16} />}
          {r.a && r.b && <ArrowRight size={10} className="text-faint" />}
          {r.b && <RoleCell role={r.b} size={16} />}
        </div>
      ))}
    </div>
  );
}
