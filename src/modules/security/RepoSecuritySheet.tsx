import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, EyeOff, Lock, RotateCcw, ShieldCheck } from "lucide-react";
import type { Alert, AlertKind, Feature, FeatureState, RepoSecurity } from "@/core/ipc";
import { errorMessage } from "@/core/errors";
import { cn } from "@/core/cn";
import type { SheetParams } from "@/core/sheets/store";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  IconButton,
  Mark,
  Panel,
  Plotter,
  RelTime,
  Segmented,
} from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { useRepoSecurity } from "./api";
import { SLA, SEVERITIES, gapsOf, gradeOf, isOverdue, scoreOf } from "./model";
import { FEATURE_ORDER, FeatureMark, Grade, KindLabel, SeverityMark } from "./parts";
import { useSecurityPrefs, useSecurityUi } from "./store";


function unavailableWhy(
  r: RepoSecurity,
  f: Feature,
): "archived" | "publicOnly" | "needsGhas" | "notReadable" {
  if (r.archived) return "archived";
  if (f === "private_reporting" && r.private) return "publicOnly";
  if (r.private && (f === "secret_scanning" || f === "push_protection" || f === "code_scanning"))
    return "needsGhas";
  return "notReadable";
}


export function RepoSecuritySheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["security", "common"]);
  const repo = String(params.repo);
  const [closed, setClosed] = useState(false);
  const [kind, setKind] = useState<AlertKind | "all">("all");
  const { data, isLoading, error } = useRepoSecurity(repo, closed);
  const baseline = useSecurityPrefs((s) => s.baseline);
  const sla = SLA[useSecurityPrefs((s) => s.sla)];
  const setUi = useSecurityUi((s) => s.set);
  const alerts = useMemo(
    () =>
      (data?.alerts ?? [])
        .filter((a) => kind === "all" || a.kind === kind)
        .sort(
          (a, b) =>
            Number(b.state === "open") - Number(a.state === "open") ||
            SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity),
        ),
    [data, kind],
  );
  if (isLoading) return <Plotter />;
  if (error || !data) return <EmptyState title={errorMessage(error)} />;
  if (data.error) return <EmptyState title={errorMessage(data.error)} />;

  const gaps = gapsOf(data.posture, baseline);
  const open = data.alerts.filter((a) => a.state === "open");
  const counts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  for (const a of open) counts[a.severity]++;
  const score = scoreOf(counts, gaps.length);
  const run = useQueue.getState;
  const toggle = (feature: Feature, enabled: boolean) =>
    run().requestRun([{ repo, action: { kind: "security_feature", feature, enabled } }]);
  const dismiss = (a: Alert) =>
    setUi({ dismiss: { kind: a.kind, alerts: [{ repo, number: a.number, title: a.title || a.key }] } });
  const reopen = (a: Alert) =>
    run().requestRun([
      {
        repo,
        action: {
          kind: "alert_set",
          alert: a.kind,
          number: a.number,
          open: true,
          reason: null,
          comment: null,
          title: a.title || a.key,
        },
      },
    ]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-line-strong bg-surface px-6 pt-5 pb-4">
        <div className="min-w-[200px] flex-1">
          <div className="annot">{t("repo.kicker")}</div>
          <div className="flex items-center gap-2">
            <Grade g={gradeOf(score)} score={score} />
            <h2 className="num truncate text-[19px] font-semibold">{repo}</h2>
            {data.private && <Lock size={13} className="text-faint" />}
          </div>
          <p className="mt-1 text-[12px] text-dim">
            {t("repo.scoreHint", { score, open: open.length, gaps: gaps.length })}
          </p>
        </div>
        {gaps.length > 0 && (
          <Button
            variant="primary"
            icon={ShieldCheck}
            onClick={() =>
              run().requestRun(
                gaps.map((feature) => ({
                  repo,
                  action: { kind: "security_feature", feature, enabled: true },
                })),
              )
            }
          >
            {t("repo.applyBaseline", { count: gaps.length })}
          </Button>
        )}
        <IconButton
          icon={ExternalLink}
          label={t("openOnGitHub")}
          onClick={() => void openUrl(`https://github.com/${repo}/settings/security_analysis`)}
        />
      </header>

      <div className="space-y-4 p-4">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="annot">{t("repo.features")}</span>
            <span className="text-[11px] text-faint">{t("repo.featuresHint")}</span>
          </div>
          {FEATURE_ORDER.map((f) => {
            const state: FeatureState = data.posture[f];
            const gap = baseline.includes(f) && state === "off";
            return (
              <div
                key={f}
                className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0"
              >
                <FeatureMark state={state} gap={gap} size={13} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[13px]">
                    {t(`feature.${f}.name`)}
                    {baseline.includes(f) && <Badge>{t("baselineTag")}</Badge>}
                  </div>
                  <div className="text-[11.5px] text-faint">
                    {state === "unavailable" ? t(`why.${unavailableWhy(data, f)}`) : t(`feature.${f}.what`)}
                  </div>
                </div>
                {state === "unavailable" ? (
                  <span className="text-[11.5px] text-faint">{t("state.unavailable")}</span>
                ) : (
                  <Button
                    size="sm"
                    variant={gap ? "primary" : "ghost"}
                    onClick={() => toggle(f, state !== "on")}
                  >
                    {state === "on" ? t("turnOff") : t("turnOn")}
                  </Button>
                )}
              </div>
            );
          })}
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
            <span className="annot">{t("repo.alerts")}</span>
            <Segmented<AlertKind | "all">
              size="sm"
              value={kind}
              onChange={setKind}
              options={(["all", "dependency", "code", "secret"] as const).map((k) => ({
                value: k,
                label: k === "all" ? t("kind.all") : t(`kind.${k}`),
              }))}
            />
            <span className="ml-auto">
              <Checkbox
                checked={closed}
                onChange={setClosed}
                label={<span className="text-[12px]">{t("repo.showClosed")}</span>}
              />
            </span>
          </div>
          {data.partial.length > 0 && (
            <p className="border-b border-line px-3 py-1.5 text-[11.5px] text-warn">
              {t("repo.partial", { kinds: data.partial.map((k) => t(`kind.${k}`)).join(", ") })}
            </p>
          )}
          {alerts.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-faint">
              {closed ? t("repo.noneAtAll") : t("repo.noneOpen")}
            </div>
          ) : (
            alerts.map((a) => {
              const isOpen = a.state === "open";
              const late = isOverdue(a, sla);
              return (
                <div
                  key={`${a.kind}#${a.number}`}
                  className={cn(
                    "group grid grid-cols-[18px_minmax(0,1fr)_120px_64px] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-surface-2",
                    !isOpen && "opacity-60",
                  )}
                >
                  <SeverityMark s={a.severity} />
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px]">{a.title || a.key}</div>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-[11px] text-faint">
                      <KindLabel kind={a.kind} className="!text-[10.5px]" />
                      {a.package && <span className="num">{a.package}</span>}
                      {a.location && <span className="num truncate">{a.location}</span>}
                      {!isOpen && (
                        <Badge>
                          {t(`stateLabel.${a.state as "dismissed"}`, { defaultValue: a.state })}
                          {a.reason ? ` · ${a.reason}` : ""}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "flex items-center justify-end gap-1 text-[11.5px]",
                      late ? "text-warn" : "text-faint",
                    )}
                  >
                    {late && <Mark glyph="hourglass" tone="warn" size={11} title={t("overdue")} />}
                    <RelTime at={a.created_at} />
                  </span>
                  <span className="flex justify-end">
                    <IconButton
                      icon={ExternalLink}
                      label={t("openOnGitHub")}
                      size={12}
                      className="size-6"
                      onClick={() => void openUrl(a.html_url)}
                    />
                    {isOpen ? (
                      <IconButton
                        icon={EyeOff}
                        label={a.kind === "secret" ? t("resolve") : t("dismiss")}
                        size={12}
                        className="size-6"
                        onClick={() => dismiss(a)}
                      />
                    ) : (
                      a.state !== "fixed" && (
                        <IconButton
                          icon={RotateCcw}
                          label={t("reopen")}
                          size={12}
                          className="size-6"
                          onClick={() => reopen(a)}
                        />
                      )
                    )}
                  </span>
                </div>
              );
            })
          )}
        </Panel>
      </div>
    </div>
  );
}
