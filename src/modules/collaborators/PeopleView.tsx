import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { UserMinus, X } from "lucide-react";
import { cn } from "@/core/cn";
import { sheets } from "@/core/sheets/store";
import { Avatar, Badge, Button, Checkbox, EmptyState, IconButton } from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { ROLES, type Person } from "./model";
import { RoleCell } from "./RoleChip";
import { useAccessUi } from "./store";
import { useTopSheet } from "@/core/sheets/store";

export function PeopleView({ people }: { people: Person[] }) {
  const { t } = useTranslation("collaborators");
  const selected = useAccessUi((s) => s.selected);
  const toggle = useAccessUi((s) => s.toggleSelect);
  const setSelected = useAccessUi((s) => s.setSelected);
  const open = useTopSheet("collaborators", "person")?.login;
  if (people.length === 0) return <EmptyState title={t("emptyPeople")} body={t("emptyPeopleHint")} />;
  const picked = people.filter((p) => selected.has(p.login));

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {people.map((p) => {
          const counts = ROLES.map((r) => p.grants.filter((g) => g.role === r && !g.invite).length);
          return (
            <div
              key={p.login}
              onClick={(e) => (e.shiftKey || e.ctrlKey ? toggle(p.login) : sheets.push("collaborators", "person", { login: p.login }))}
              className={cn(
                "group grid cursor-default grid-cols-[24px_minmax(0,1fr)_200px_90px] items-center gap-3 border-b border-line px-4 py-2.5 hover:bg-surface-2",
                selected.has(p.login) && "bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface))]",
                open === p.login && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
              )}
            >
              <Checkbox checked={selected.has(p.login)} onChange={() => toggle(p.login)} />
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar src={p.avatar_url} alt={p.login} size={26} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="num truncate text-[13px] text-text">{p.login}</span>
                    {p.kind === "Bot" && <Badge mono>bot</Badge>}
                    {p.pending > 0 && <Badge tone="warn" mono>{t("pendingCount", { count: p.pending })}</Badge>}
                  </div>
                  <div className="truncate text-[11.5px] text-faint">{p.grants.map((g) => g.repo.split("/")[1]).join(" · ")}</div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {[...ROLES].reverse().map((r, i) => {
                  const n = counts[ROLES.length - 1 - i];
                  return (
                    <span key={r} className={cn("flex items-center gap-0.5", n === 0 && "opacity-25")}>
                      <RoleCell role={r} size={16} />
                      <span className="num w-5 text-[10.5px] text-dim">{n}</span>
                    </span>
                  );
                })}
              </div>
              <span className="num text-right text-[12px] text-dim">{t("repoCount", { count: p.grants.length })}</span>
            </div>
          );
        })}
      </div>
      <AnimatePresence>
        {picked.length > 0 && (
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="absolute bottom-4 left-3 z-20 flex items-center gap-1.5 rounded-[var(--radius)] border border-line-strong bg-surface py-1.5 pr-1.5 pl-3 shadow-[var(--shadow)]"
          >
            <span className="num mr-1 flex items-center gap-2 text-[12px]">
              <span className="flex h-5 min-w-5 items-center justify-center rounded-[3px] bg-accent px-1 text-accent-fg">{picked.length}</span>
              <span className="annot">{t("selected")}</span>
            </span>
            <Button
              size="sm"
              variant="danger"
              icon={UserMinus}
              onClick={() =>
                useQueue.getState().requestRun(
                  picked.flatMap((p) =>
                    p.grants.map((g) => (g.invite ? { repo: g.repo, action: { kind: "invite_cancel" as const, id: g.invite.id, user: p.login } } : { repo: g.repo, action: { kind: "collab_remove" as const, user: p.login } })),
                  ),
                )
              }
            >
              {t("revokeAll")}
            </Button>
            <IconButton icon={X} label={t("clearSelection")} onClick={() => setSelected([])} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
