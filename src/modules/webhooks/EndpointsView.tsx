import { useTranslation } from "react-i18next";
import { Webhook } from "lucide-react";
import type { HookHealth } from "@/core/ipc";
import { cn } from "@/core/cn";
import { sheets, useTopSheet } from "@/core/sheets/store";
import { useSheetRole } from "@/core/sheets/role";
import { EmptyState, Mark } from "@/ui";
import { EventList, StateMark, StateSpread } from "./HookMarks";
import { sumHealth, type Endpoint } from "./model";

export function openEndpoint(e: Endpoint) {
  sheets.push("webhooks", "endpoint", { key: e.key, title: e.host });
}


export function HealthCell({ checked, failed }: { checked: number; failed: number }) {
  const { t } = useTranslation("webhooks");
  if (checked === 0) return <span className="text-[11.5px] text-faint">{t("health.none")}</span>;
  return failed > 0 ? (
    <span className="flex items-center gap-1.5 text-[11.5px] text-danger">
      <Mark glyph="cross" tone="danger" size={11} />
      {t("health.failed", { failed, checked })}
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-[11.5px] text-dim">
      <Mark glyph="tick" tone="ok" size={11} />
      {t("health.ok", { checked })}
    </span>
  );
}


export function EndpointsView({
  endpoints,
  health,
}: {
  endpoints: Endpoint[];
  health?: Map<string, HookHealth>;
}) {
  const { t } = useTranslation("webhooks");
  const open = useTopSheet("webhooks", "endpoint")?.key;
  const compact = useSheetRole() === "peek";
  if (endpoints.length === 0)
    return (
      <EmptyState icon={<Webhook size={20} />} title={t("empty.endpoints")} body={t("empty.endpointsHint")} />
    );
  const cols = compact
    ? "grid-cols-[minmax(0,1fr)_40px]"
    : health
      ? "grid-cols-[minmax(0,1fr)_110px_190px_170px_170px]"
      : "grid-cols-[minmax(0,1fr)_110px_190px_170px]";
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {endpoints.map((e) => {
        const h = sumHealth(e.hooks, health);
        return (
          <button
            key={e.key}
            onClick={() => openEndpoint(e)}
            className={cn(
              "grid w-full cursor-default items-center gap-3 border-b border-line px-4 py-2.5 text-left hover:bg-surface-2",
              cols,
              open === e.key && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
            )}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <StateMark state={e.worst} />
              <span className="min-w-0">
                <span className="num block truncate text-[13px] text-text">{e.host}</span>
                <span className="num block truncate text-[11px] text-faint">{e.path || "/"}</span>
              </span>
            </span>
            <span
              className="num text-right text-[12px] text-dim"
              title={t("endpoint.onRepos", { count: e.hooks.length })}
            >
              {compact ? e.hooks.length : t("endpoint.onRepos", { count: e.hooks.length })}
            </span>
            {!compact && (
              <>
                <StateSpread states={e.states} />
                <EventList events={e.events} />
                {h && <HealthCell {...h} />}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
