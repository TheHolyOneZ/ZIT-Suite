import { useTranslation } from "react-i18next";
import type { Environment } from "@/core/ipc";
import { Badge } from "@/ui";
import type { Place } from "./model";


export function PlaceLabel({ place, short }: { place: Place; short?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="num truncate text-[12.5px]" title={place.repo}>
        {short ? place.repo.split("/")[1] : place.repo}
      </span>
      {place.env && <Badge tone="info">{place.env}</Badge>}
    </span>
  );
}


export function RuleSummary({ env }: { env: Environment }) {
  const { t } = useTranslation("secrets");
  const parts: string[] = [];
  if (env.wait_timer > 0) parts.push(t("rules.wait", { count: env.wait_timer }));
  if (env.reviewers.length)
    parts.push(
      `${t("rules.reviewers")}: ${env.reviewers.map((r) => (r.kind === "Team" ? r.name : `@${r.name}`)).join(", ")}`,
    );
  if (env.branch_policy !== "all")
    parts.push(
      env.branch_policy === "custom" && env.patterns.length
        ? `${t(`rules.branch.${env.branch_policy}`)} (${env.patterns.join(", ")})`
        : t(`rules.branch.${env.branch_policy}`),
    );
  if (env.reviewers.length && env.prevent_self_review) parts.push(t("rules.selfReview"));
  if (!env.can_admins_bypass) parts.push(t("rules.noBypass"));
  if (parts.length === 0) return <span className="text-[11.5px] text-faint">{t("rules.none")}</span>;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {parts.map((p) => (
        <span key={p} className="num truncate rounded-[3px] border border-line px-1 text-[10.5px] text-dim">
          {p}
        </span>
      ))}
    </span>
  );
}
