import { useTranslation } from "react-i18next";
import { GitFork, Lock, Star } from "lucide-react";
import { cn } from "@/core/cn";
import { formatCompact } from "@/core/i18n/format";
import { Badge, Checkbox, Meter, Mark, Ticks, RelTime } from "@/ui";
import type { RepoRow } from "./filters";
import { healthGlyph, healthTone } from "./health";
import { languageColor } from "./languageColors";
import { tagTone, useReposUi } from "./store";
import { useTagLabel } from "./TagMenu";
import { openRepo } from "./RepoSheet";

export function RepoGrid({ rows }: { rows: RepoRow[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
        {rows.map((r, i) => (
          <Card key={r.repo.id} row={r} index={i} />
        ))}
      </div>
    </div>
  );
}

function Card({ row, index }: { row: RepoRow; index: number }) {
  const { t } = useTranslation("repos");
  const { repo, health, tags } = row;
  const selected = useReposUi((s) => s.selected.has(repo.full_name));
  const cursor = useReposUi((s) => s.cursor === index);
  const toggle = useReposUi((s) => s.toggleSelect);
  const set = useReposUi((s) => s.set);
  const tagLabel = useTagLabel();

  return (
    <div
      onClick={(e) =>
        e.shiftKey || e.ctrlKey
          ? toggle(repo.full_name)
          : (set({ cursor: index }), openRepo(repo.full_name, repo.name))
      }
      style={{ contentVisibility: "auto", containIntrinsicSize: "150px" }}
      className={cn(
        "group relative flex h-[150px] flex-col rounded-[var(--radius)] border bg-surface p-3.5 transition-colors",
        selected ? "border-accent" : "border-line hover:border-line-strong",
      )}
    >
      {cursor && <Ticks />}
      <div className="flex items-start gap-2">
        <div className="pt-1">
          <Mark
            glyph={healthGlyph[health.status]}
            tone={healthTone[health.status]}
            size={12}
            title={t(`health.${health.status}`)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{repo.name}</span>
            {repo.private && <Lock size={11} className="shrink-0 text-faint" />}
            {repo.fork && <GitFork size={11} className="shrink-0 text-faint" />}
          </div>
          <div className="annot !text-[9.5px]">{repo.owner.login}</div>
        </div>
        <div
          className={cn("transition-opacity", selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
        >
          <Checkbox checked={selected} onChange={() => toggle(repo.full_name)} />
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-[12px] text-dim">
        {repo.description || <span className="text-faint">{t("detail.noDescription")}</span>}
      </p>
      <div className="mt-auto space-y-2">
        <div className="flex gap-1 overflow-hidden">
          {tags.map((tg) => (
            <Badge key={tg} tone={tagTone(tg)}>
              {tagLabel(tg)}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[11.5px] text-dim">
          {repo.language && (
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[1px]" style={{ background: languageColor(repo.language) }} />
              {repo.language}
            </span>
          )}
          <span className="num flex items-center gap-1">
            <Star size={11} /> {formatCompact(repo.stargazers_count)}
          </span>
          <span className="num ml-auto text-faint">
            <RelTime at={repo.pushed_at ?? repo.updated_at} />
          </span>
        </div>
        <Meter value={health.score} tone={healthTone[health.status]} />
      </div>
    </div>
  );
}
