import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, UserMinus, UserPlus } from "lucide-react";
import { sheets, type SheetParams } from "@/core/sheets/store";
import { Avatar, Badge, Button, EmptyState, IconButton, Plotter } from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { useAccessIndex } from "./api";
import { RoleCell } from "./RoleChip";
import { RoleSelect } from "./RoleSelect";
import { useAccessUi } from "./store";
import { formatRelative } from "@/core/i18n/format";


export function PersonSheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation("collaborators");
  const login = String(params.login);
  const { index, scan } = useAccessIndex();
  const p = index.people.find((x) => x.login.toLowerCase() === login.toLowerCase());
  const setUi = useAccessUi((s) => s.set);
  const q = useQueue.getState();

  if (!scan.data) return <Plotter />;
  if (!p) return <EmptyState title={t("person.noAccess", { login })} />;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line-strong bg-surface px-6 py-5">
        <Avatar src={p.avatar_url} alt={p.login} size={44} />
        <div className="min-w-[180px] flex-1">
          <div className="annot">{t("person.kicker")}</div>
          <h2 className="num truncate text-[20px] font-semibold">{p.login}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] whitespace-nowrap text-dim">
            {p.kind === "Bot" && <Badge mono>bot</Badge>}
            <span>{t("repoCount", { count: p.grants.length })}</span>
            <span className="text-faint">·</span>
            <span className="flex items-center gap-1">
              {t("person.highest")} <RoleCell role={p.top} size={16} />
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            icon={ExternalLink}
            label="GitHub"
            onClick={() => openUrl(`https://github.com/${p.login}`)}
          />
          <Button
            icon={UserPlus}
            onClick={() => setUi({ grant: { users: [p.login], repos: [], mode: "add" } })}
          >
            {t("person.grantMore")}
          </Button>
          <Button
            variant="danger"
            icon={UserMinus}
            onClick={() =>
              q.requestRun(
                p.grants.map((g) =>
                  g.invite
                    ? {
                        repo: g.repo,
                        action: { kind: "invite_cancel" as const, id: g.invite.id, user: p.login },
                      }
                    : { repo: g.repo, action: { kind: "collab_remove" as const, user: p.login } },
                ),
              )
            }
          >
            {t("revokeAll")}
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {p.grants.map((g) => (
          <div
            key={g.repo}
            className="grid grid-cols-[minmax(0,1fr)_150px_32px] items-center gap-3 border-b border-line px-6 py-2"
          >
            <button
              onClick={() =>
                sheets.push("collaborators", "repo", { repo: g.repo, title: g.repo.split("/")[1] })
              }
              className="flex min-w-0 items-center gap-2 text-left cursor-default"
            >
              <RoleCell role={g.role} invited={!!g.invite} />
              <span className="num truncate text-[12.5px] hover:text-accent">{g.repo}</span>
              {g.invite && (
                <Badge tone={g.invite.expired ? "danger" : "warn"} mono>
                  {g.invite.expired
                    ? t("expired")
                    : t("invitedAgo", { when: formatRelative(g.invite.created_at) })}
                </Badge>
              )}
            </button>
            {g.invite ? (
              <span />
            ) : (
              <RoleSelect
                value={g.role}
                onChange={(role) =>
                  q.requestRun([{ repo: g.repo, action: { kind: "collab_set", user: p.login, role } }])
                }
              />
            )}
            <IconButton
              icon={UserMinus}
              label={g.invite ? t("cancelInvite") : t("revoke")}
              onClick={() =>
                q.requestRun([
                  g.invite
                    ? { repo: g.repo, action: { kind: "invite_cancel", id: g.invite.id, user: p.login } }
                    : { repo: g.repo, action: { kind: "collab_remove", user: p.login } },
                ])
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
