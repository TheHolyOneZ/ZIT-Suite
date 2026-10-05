import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/core/cn";
import { formatRelative } from "@/core/i18n/format";
import { sheets, useTopSheet } from "@/core/sheets/store";
import { useSheetRole } from "@/core/sheets/role";
import { Badge, EmptyState, Mark } from "@/ui";
import type { EnvGroup, RepoRow, SecretGroup, VariableGroup } from "./model";
import { RuleSummary } from "./shared";

function Row({
  active,
  onClick,
  cols,
  children,
  dim,
}: {
  active: boolean;
  onClick: () => void;
  cols: string;
  children: ReactNode;
  dim?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "grid w-full cursor-default items-center gap-3 border-b border-line px-4 py-2.5 text-left hover:bg-surface-2",
        cols,
        active && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
        dim && "opacity-60",
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

export function SecretsList({ groups }: { groups: SecretGroup[] }) {
  const { t } = useTranslation("secrets");
  const open = useTopSheet("secrets", "secret")?.name;
  const compact = useSheetRole() === "peek";
  if (!groups.length) return <EmptyState title={t("empty.secrets")} />;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {groups.map((g) => (
        <Row
          key={g.name}
          active={open === g.name}
          onClick={() => sheets.push("secrets", "secret", { name: g.name, title: g.name })}
          cols={
            compact ? "grid-cols-[minmax(0,1fr)_60px]" : "grid-cols-[minmax(0,1fr)_90px_minmax(0,1fr)_170px]"
          }
        >
          <span className="flex min-w-0 items-center gap-2">
            <Mark
              glyph={g.stale ? "hourglass" : "tick"}
              tone={g.stale ? "warn" : "ok"}
              title={g.stale ? t("stale") : undefined}
            />
            <span className="num truncate text-[13px]">{g.name}</span>
          </span>
          <span className="num text-right text-[12px] text-dim">
            {t("places", { count: g.places.length })}
          </span>
          {!compact && (
            <>
              <span className="num truncate text-[11.5px] text-faint">
                {repoNames(g.places.map((p) => p.repo))}
              </span>
              <span className={cn("text-right text-[11.5px]", g.stale ? "text-warn" : "text-faint")}>
                {t("updated", { when: formatRelative(g.oldest) })}
              </span>
            </>
          )}
        </Row>
      ))}
    </div>
  );
}

export function VariablesList({ groups }: { groups: VariableGroup[] }) {
  const { t } = useTranslation("secrets");
  const open = useTopSheet("secrets", "variable")?.name;
  const compact = useSheetRole() === "peek";
  if (!groups.length) return <EmptyState title={t("empty.variables")} />;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {groups.map((g) => {
        const drift = g.values.length > 1;
        return (
          <Row
            key={g.name}
            active={open === g.name}
            onClick={() => sheets.push("secrets", "variable", { name: g.name, title: g.name })}
            cols={
              compact
                ? "grid-cols-[minmax(0,1fr)_60px]"
                : "grid-cols-[minmax(0,1fr)_90px_minmax(0,1.2fr)_110px]"
            }
          >
            <span className="flex min-w-0 items-center gap-2">
              <Mark
                glyph={drift ? "warn" : "equal"}
                tone={drift ? "warn" : "idle"}
                title={drift ? t("drift") : undefined}
              />
              <span className="num truncate text-[13px]">{g.name}</span>
            </span>
            <span className="num text-right text-[12px] text-dim">
              {t("places", { count: g.places.length })}
            </span>
            {!compact && (
              <>
                <span className="num truncate text-[11.5px] text-dim" title={g.values[0]?.value}>
                  {g.values[0]?.value}
                </span>
                <span className="text-right">
                  {drift ? <Badge tone="warn">{t("values", { count: g.values.length })}</Badge> : null}
                </span>
              </>
            )}
          </Row>
        );
      })}
    </div>
  );
}

export function EnvironmentsList({ groups }: { groups: EnvGroup[] }) {
  const { t } = useTranslation("secrets");
  const open = useTopSheet("secrets", "env")?.name;
  const compact = useSheetRole() === "peek";
  if (!groups.length) return <EmptyState title={t("empty.environments")} />;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {groups.map((g) => (
        <Row
          key={g.name}
          active={open === g.name}
          onClick={() => sheets.push("secrets", "env", { name: g.name, title: g.name })}
          cols={
            compact
              ? "grid-cols-[minmax(0,1fr)_60px]"
              : "grid-cols-[minmax(0,0.8fr)_70px_minmax(0,1.6fr)_110px]"
          }
        >
          <span className="flex min-w-0 items-center gap-2">
            <Mark
              glyph={g.configs > 1 ? "warn" : "block"}
              tone={g.configs > 1 ? "warn" : "info"}
              title={g.configs > 1 ? t("env.drift") : undefined}
            />
            <span className="num truncate text-[13px]">{g.name}</span>
          </span>
          <span className="num text-right text-[12px] text-dim">{g.repos.length}</span>
          {!compact && (
            <>
              <RuleSummary env={g.repos[0].env} />
              <span className="text-right">
                {g.configs > 1 ? <Badge tone="warn">{t("drift")}</Badge> : null}
              </span>
            </>
          )}
        </Row>
      ))}
    </div>
  );
}

export function ReposList({ rows }: { rows: RepoRow[] }) {
  const { t } = useTranslation("secrets");
  const open = useTopSheet("secrets", "repo")?.repo;
  if (!rows.length) return <EmptyState title={t("empty.repos")} />;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {rows.map((r) => {
        const empty = r.secrets + r.variables + r.environments === 0;
        return (
          <Row
            key={r.repo}
            active={open === r.repo}
            dim={empty && !r.error}
            onClick={() => sheets.push("secrets", "repo", { repo: r.repo, title: r.repo.split("/")[1] })}
            cols="grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,110px))]"
          >
            <span className="flex min-w-0 items-center gap-2">
              {r.error ? (
                <Mark glyph="cross" tone="danger" title={t("scanFailed")} />
              ) : (
                <Mark glyph={empty ? "void" : "signal3"} tone={empty ? "idle" : "accent"} />
              )}
              <span className="num truncate text-[12.5px]">{r.repo}</span>
            </span>
            <span className="num text-right text-[11.5px] text-dim">
              {t("meta.secrets", { count: r.secrets })}
            </span>
            <span className="num text-right text-[11.5px] text-dim">
              {t("meta.variables", { count: r.variables })}
            </span>
            <span className="num text-right text-[11.5px] text-dim">
              {t("meta.environments", { count: r.environments })}
            </span>
          </Row>
        );
      })}
    </div>
  );
}
