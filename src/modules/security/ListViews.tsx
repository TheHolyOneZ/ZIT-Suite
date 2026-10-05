import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { cn } from "@/core/cn";
import { formatRelative } from "@/core/i18n/format";
import { sheets, useTopSheet } from "@/core/sheets/store";
import { useSheetRole } from "@/core/sheets/role";
import { EmptyState, Mark } from "@/ui";
import type { AlertGroup, FixPlan, RepoRow } from "./model";
import { Counts, FEATURE_ORDER, FeatureMark, Grade, KindLabel, SeverityMark } from "./parts";
import { useSecurityPrefs } from "./store";

function Row({
  active,
  onClick,
  cols,
  children,
}: {
  active: boolean;
  onClick: () => void;
  cols: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "grid w-full cursor-default items-center gap-3 border-b border-line px-4 py-2.5 text-left hover:bg-surface-2",
        cols,
        active && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
      )}
    >
      {children}
    </button>
  );
}

const repoNames = (repos: string[]) => {
  const uniq = [...new Set(repos.map((r) => r.split("/")[1]))];
  return uniq.slice(0, 3).join(", ") + (uniq.length > 3 ? ` +${uniq.length - 3}` : "");
};


export function AlertGroupsList({ groups, empty }: { groups: AlertGroup[]; empty: ReactNode }) {
  const { t } = useTranslation("security");
  const open = useTopSheet("security", "group")?.id;
  const compact = useSheetRole() === "peek";
  if (!groups.length) return <>{empty}</>;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {groups.map((g) => (
        <Row
          key={g.id}
          active={open === g.id}
          onClick={() => sheets.push("security", "group", { id: g.id, title: g.package ?? g.title })}
          cols={
            compact
              ? "grid-cols-[minmax(0,1fr)_56px]"
              : "grid-cols-[minmax(0,1.6fr)_110px_minmax(0,1fr)_80px_130px]"
          }
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <SeverityMark s={g.severity} />
            <span className="min-w-0">
              <span className="block truncate text-[13px]">{g.title || g.key}</span>
              <span className="num block truncate text-[11px] text-faint">
                {g.package ? `${g.package}${g.ecosystem ? ` · ${g.ecosystem}` : ""}` : g.key}
                {g.patched && <span className="text-ok"> → {g.patched}</span>}
              </span>
            </span>
          </span>
          {compact ? (
            <span className="num text-right text-[12px] text-dim">{g.repos}</span>
          ) : (
            <>
              <KindLabel kind={g.kind} />
              <span className="num truncate text-[11.5px] text-faint">
                {repoNames(g.items.map((i) => i.repo))}
              </span>
              <span className="num text-right text-[12px] text-dim">{t("repos", { count: g.repos })}</span>
              <span
                className={cn(
                  "flex items-center justify-end gap-1.5 text-[11.5px]",
                  g.overdue ? "text-warn" : "text-faint",
                )}
              >
                {g.overdue > 0 && <Mark glyph="hourglass" tone="warn" size={11} title={t("overdue")} />}
                {t("since", { when: formatRelative(g.oldest) })}
              </span>
            </>
          )}
        </Row>
      ))}
    </div>
  );
}


export function ReposList({ rows }: { rows: RepoRow[] }) {
  const { t } = useTranslation("security");
  const open = useTopSheet("security", "repo")?.repo;
  const compact = useSheetRole() === "peek";
  const baseline = useSecurityPrefs((s) => s.baseline);
  if (!rows.length) return <EmptyState title={t("empty.repos")} />;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {!compact && (
        <div className="sticky top-0 z-10 grid grid-cols-[40px_minmax(0,1.2fr)_repeat(6,28px)_minmax(0,1fr)] items-center gap-3 border-b border-line bg-surface px-4 py-1.5">
          <span className="annot !text-[9.5px]">{t("columns.grade")}</span>
          <span className="annot !text-[9.5px]">{t("columns.repo")}</span>
          {FEATURE_ORDER.map((f) => (
            <span
              key={f}
              className="annot cursor-help text-center !text-[9.5px]"
              title={t(`feature.${f}.name`)}
            >
              {t(`feature.${f}.short`)}
            </span>
          ))}
          <span className="annot text-right !text-[9.5px]">{t("columns.open")}</span>
        </div>
      )}
      {rows.map((r) => (
        <Row
          key={r.repo}
          active={open === r.repo}
          onClick={() => sheets.push("security", "repo", { repo: r.repo, title: r.repo.split("/")[1] })}
          cols={
            compact
              ? "grid-cols-[40px_minmax(0,1fr)]"
              : "grid-cols-[40px_minmax(0,1.2fr)_repeat(6,28px)_minmax(0,1fr)]"
          }
        >
          <Grade g={r.error ? "?" : r.grade} score={r.score} />
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="num truncate text-[12.5px]">{r.repo.split("/")[1]}</span>
            {r.private && <Lock size={11} className="shrink-0 text-faint" />}
            {r.error && <span className="truncate text-[11px] text-danger">{t("scanFailed")}</span>}
          </span>
          {!compact && (
            <>
              {FEATURE_ORDER.map((f) => (
                <span key={f} className="flex justify-center">
                  <FeatureMark state={r.posture[f]} gap={baseline.includes(f) && r.posture[f] === "off"} />
                </span>
              ))}
              <span className="flex items-center justify-end gap-2">
                {r.overdue > 0 && (
                  <Mark
                    glyph="hourglass"
                    tone="warn"
                    size={11}
                    title={t("overdueCount", { count: r.overdue })}
                  />
                )}
                <Counts c={r.counts} />
              </span>
            </>
          )}
        </Row>
      ))}
    </div>
  );
}


export function FixesList({ plans, empty }: { plans: FixPlan[]; empty: ReactNode }) {
  const { t } = useTranslation("security");
  const open = useTopSheet("security", "fix")?.id;
  const compact = useSheetRole() === "peek";
  if (!plans.length) return <>{empty}</>;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {plans.map((p) => (
        <Row
          key={p.id}
          active={open === p.id}
          onClick={() => sheets.push("security", "fix", { id: p.id, title: p.package })}
          cols={
            compact ? "grid-cols-[minmax(0,1fr)_56px]" : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_90px]"
          }
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <SeverityMark s={p.severity} />
            <span className="min-w-0">
              <span className="num block truncate text-[13px]">{p.package}</span>
              <span className="block truncate text-[11px] text-faint">{p.ecosystem}</span>
            </span>
          </span>
          {compact ? (
            <span className="num text-right text-[12px] text-dim">{p.alerts}</span>
          ) : (
            <>
              <span className="text-[12px]">
                {p.target ? (
                  <span className="text-ok">{t("fix.upgradeTo", { version: p.target })}</span>
                ) : (
                  <span className="text-warn">{t("fix.noTarget")}</span>
                )}
                {p.target && p.unfixable > 0 && (
                  <span className="text-warn"> · {t("fix.someUnfixable", { count: p.unfixable })}</span>
                )}
              </span>
              <span className="num text-right text-[12px] text-dim">
                {t("fix.alerts", { count: p.alerts })}
              </span>
              <span className="num text-right text-[12px] text-dim">
                {t("repos", { count: p.repos.length })}
              </span>
            </>
          )}
        </Row>
      ))}
    </div>
  );
}
