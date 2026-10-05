import { useTranslation } from "react-i18next";
import { cn } from "@/core/cn";
import { sheets, useTopSheet } from "@/core/sheets/store";
import { Badge, EmptyState, Mark, Meter } from "@/ui";
import { useAccessUi } from "./store";
import type { AccessIndex } from "./model";

export function ReposView({ repos }: { repos: AccessIndex["repos"] }) {
  const { t } = useTranslation("collaborators");
  const search = useAccessUi((s) => s.filter.search.toLowerCase());
  const open = useTopSheet("collaborators", "repo")?.repo;
  const list = repos.filter((r) => !search || r.repo.toLowerCase().includes(search));
  const max = Math.max(1, ...list.map((r) => r.people + r.invites));
  if (list.length === 0) return <EmptyState title={t("emptyRepos")} />;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {list.map((r) => (
        <button
          key={r.repo}
          onClick={() => sheets.push("collaborators", "repo", { repo: r.repo, title: r.repo.split("/")[1] })}
          className={cn(
            "grid w-full cursor-default grid-cols-[minmax(0,1fr)_160px_90px] items-center gap-3 border-b border-line px-4 py-2.5 text-left hover:bg-surface-2",
            open === r.repo && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {r.error ? <Mark glyph="cross" tone="danger" title={t("scanFailed")} /> : <Mark glyph={r.people + r.invites > 0 ? "signal3" : "void"} tone={r.people + r.invites > 0 ? "accent" : "idle"} />}
            <span className="num truncate text-[12.5px]">{r.repo}</span>
          </span>
          <Meter value={((r.people + r.invites) / max) * 100} />
          <span className="flex items-center justify-end gap-1.5">
            <span className="num text-[12px] text-dim">{r.people}</span>
            {r.invites > 0 && <Badge tone="warn" mono>+{r.invites}</Badge>}
          </span>
        </button>
      ))}
    </div>
  );
}
