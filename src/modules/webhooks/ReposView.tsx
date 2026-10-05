import { useTranslation } from "react-i18next";
import { cn } from "@/core/cn";
import { sheets, useTopSheet } from "@/core/sheets/store";
import { EmptyState, Mark } from "@/ui";
import { StateMark } from "./HookMarks";
import { hookState, splitUrl, type HookIndex } from "./model";
import { useHooksUi } from "./store";

export function ReposView({ repos }: { repos: HookIndex["repos"] }) {
  const { t } = useTranslation("webhooks");
  const search = useHooksUi((s) => s.filter.search.toLowerCase());
  const open = useTopSheet("webhooks", "repo")?.repo;
  const list = repos.filter(
    (r) =>
      !search ||
      r.repo.toLowerCase().includes(search) ||
      r.hooks.some((h) => h.url.toLowerCase().includes(search)),
  );
  if (list.length === 0) return <EmptyState title={t("empty.repos")} />;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {list.map((r) => (
        <button
          key={r.repo}
          onClick={() => sheets.push("webhooks", "repo", { repo: r.repo, title: r.repo.split("/")[1] })}
          className={cn(
            "grid w-full cursor-default grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_60px] items-center gap-3 border-b border-line px-4 py-2.5 text-left hover:bg-surface-2",
            open === r.repo && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
            r.hooks.length === 0 && !r.error && "opacity-60",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {r.error ? (
              <Mark glyph="cross" tone="danger" title={t("scanFailed")} />
            ) : (
              <Mark glyph={r.hooks.length ? "signal3" : "void"} tone={r.hooks.length ? "accent" : "idle"} />
            )}
            <span className="num truncate text-[12.5px]">{r.repo}</span>
          </span>
          <span className="flex min-w-0 items-center gap-3">
            {r.hooks.slice(0, 3).map((h) => (
              <span key={h.id} className="flex min-w-0 items-center gap-1.5">
                <StateMark state={hookState(h)} size={11} />
                <span className="num truncate text-[11.5px] text-dim">{splitUrl(h.url).host}</span>
              </span>
            ))}
            {r.hooks.length > 3 && <span className="num text-[11px] text-faint">+{r.hooks.length - 3}</span>}
          </span>
          <span className="num text-right text-[12px] text-dim">{r.hooks.length}</span>
        </button>
      ))}
    </div>
  );
}
