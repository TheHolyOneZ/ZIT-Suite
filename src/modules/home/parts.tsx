import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, GitBranch, GitFork } from "lucide-react";
import type { RemoteCompare, Workspace } from "@/core/ipc";
import { cn } from "@/core/cn";
import { Mark } from "@/ui";
import { intervalLabel, type Headline } from "./model";

export function HeadlineText({ h, className }: { h: Headline | null; className?: string }) {
  const { t } = useTranslation("home");
  if (!h) return <span className={cn("text-faint", className)}>…</span>;
  const text = "count" in h ? t(`state.${h.key}`, { count: h.count }) : t(`state.${h.key}`);
  return (
    <span
      className={cn("flex items-center gap-2", className)}
      style={{
        color: h.tone === "idle" ? "var(--text-dim)" : `var(--${h.tone === "accent" ? "accent" : h.tone})`,
      }}
    >
      <Mark glyph={h.glyph} tone={h.tone} size={14} />
      <span>{text}</span>
    </span>
  );
}


export function GitTerm({
  term,
}: {
  term: "commit" | "push" | "pull" | "branch" | "gitignore" | "fetch" | "stash" | "reset";
}) {
  const { t } = useTranslation("home");
  return (
    <span className="num ml-1 rounded-[3px] border border-line px-1 text-[9.5px] font-normal tracking-wide text-faint lowercase">
      {t(`git.${term}`)}
    </span>
  );
}

export function BranchChip({ name }: { name: string | null }) {
  const { t } = useTranslation("home");
  return (
    <span className="num inline-flex h-[20px] max-w-[200px] items-center gap-1 rounded-[3px] border border-line-strong bg-surface-2 px-1.5 text-[11px]">
      <GitBranch size={11} className="shrink-0 text-faint" />
      <span className="truncate">{name ?? t("branch.unborn")}</span>
    </span>
  );
}


export function AheadBehind({ c, reference }: { c: RemoteCompare; reference?: boolean }) {
  const { t } = useTranslation("home");
  if (c.error) return <span className="text-[11.5px] text-danger">{t("strip.notSet")}</span>;
  if (!c.exists) return <span className="text-[11.5px] text-faint">{t("strip.notPushed")}</span>;
  if (!c.ahead && !c.behind) return <span className="text-[11.5px] text-ok">{t("strip.inSync")}</span>;
  return (
    <span className="flex items-center gap-2 text-[11.5px]">
      {c.ahead > 0 && (
        <span
          className={
            reference ? "flex items-center gap-0.5 text-dim" : "flex items-center gap-0.5 text-accent"
          }
        >
          {reference ? <GitFork size={11} /> : <ArrowUp size={11} />}
          {t(reference ? "strip.yours" : "strip.ahead", { count: c.ahead })}
        </span>
      )}
      {c.behind > 0 && (
        <span className="flex items-center gap-0.5 text-info">
          <ArrowDown size={11} />
          {t("strip.behind", { count: c.behind })}
        </span>
      )}
    </span>
  );
}


export function AutomationLine({ ws, className }: { ws: Workspace; className?: string }) {
  const { t } = useTranslation("home");
  if (!ws.watch) return <span className={cn("text-faint", className)}>{t("auto.off")}</span>;
  return (
    <span className={cn("text-dim", className)}>
      {t("auto.watching", { interval: intervalLabel(ws.interval_secs, t) })} ·{" "}
      {t(`auto.${ws.auto}`, { minutes: ws.auto_minutes })}
      {ws.auto !== "manual" && ws.auto_push && ws.push_repo ? ` ${t("auto.push")}` : ""}
    </span>
  );
}
