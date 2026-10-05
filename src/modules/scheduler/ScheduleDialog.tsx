import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock } from "lucide-react";
import {
  commands,
  unwrap,
  type Cadence,
  type Feature,
  type JsonValue,
  type QueueAction,
  type Schedule,
} from "@/core/ipc";
import { toastError } from "@/core/errors";
import { toast } from "@/core/store/toasts";
import { RepoChecklist } from "@/app/RepoChecklist";
import { Button, Checkbox, Dialog, Input, Label, Segmented, Select } from "@/ui";
import { DEFAULT_PROTECTION } from "@/modules/branches/dialogs";
import { useRepoRows } from "@/modules/repos/api";
import { BUILTIN_TAGS, useReposPrefs } from "@/modules/repos/store";
import { describeAction } from "@/modules/queue/describe";
import { ACTION_KINDS, DEFAULT_CADENCE, mustAsk, resolveTarget, type ActionKind, type Target } from "./model";

const FEATURES: Feature[] = [
  "dependabot_alerts",
  "security_updates",
  "secret_scanning",
  "push_protection",
  "private_reporting",
];

function initialAction(a: QueueAction | undefined): {
  kind: ActionKind;
  feature: Feature;
  enabled: boolean;
  label: string;
  color: string;
  bump: string;
  draft: boolean;
  prerelease: boolean;
} {
  const base = {
    kind: "archive" as ActionKind,
    feature: "dependabot_alerts" as Feature,
    enabled: true,
    label: "stale",
    color: "cccccc",
    bump: "patch",
    draft: false,
    prerelease: false,
  };
  if (!a) return base;
  if (a.kind === "security_feature") return { ...base, kind: a.kind, feature: a.feature, enabled: a.enabled };
  if (a.kind === "label_upsert") return { ...base, kind: a.kind, label: a.name, color: a.color };
  if (a.kind === "release_next")
    return { ...base, kind: a.kind, bump: a.bump, draft: a.draft, prerelease: a.prerelease };
  return { ...base, kind: (ACTION_KINDS as string[]).includes(a.kind) ? (a.kind as ActionKind) : "archive" };
}

function buildAction(x: ReturnType<typeof initialAction>): QueueAction {
  switch (x.kind) {
    case "security_feature":
      return { kind: "security_feature", feature: x.feature, enabled: x.enabled };
    case "label_upsert":
      return {
        kind: "label_upsert",
        name: x.label.trim(),
        color: x.color.replace(/^#/, "").toLowerCase(),
        description: null,
      };
    case "branch_protect":
      return { kind: "branch_protect", branch: null, rules: DEFAULT_PROTECTION };
    case "release_next":
      return { kind: "release_next", bump: x.bump, draft: x.draft, prerelease: x.prerelease };
    default:
      return { kind: x.kind };
  }
}


export function ScheduleDialog({ schedule, onClose }: { schedule: Schedule | null; onClose: () => void }) {
  const { t } = useTranslation(["scheduler", "repos", "security", "common"]);
  const { rows } = useRepoRows();
  const presets = useReposPrefs((s) => s.presets);
  const customTags = useReposPrefs((s) => s.customTags);
  const [name, setName] = useState(schedule?.name ?? "");
  const [target, setTarget] = useState<Target>(
    (schedule?.target as Target | undefined) ?? { kind: "cleanup", preset: "spring" },
  );
  const [act, setAct] = useState(() => initialAction(schedule?.action));
  const [cadence, setCadence] = useState<Cadence>(schedule?.cadence ?? DEFAULT_CADENCE);
  const [mode, setMode] = useState(schedule?.mode ?? "review");
  const [busy, setBusy] = useState(false);
  const action = buildAction(act);
  const ask = mustAsk(action);
  const matches = useMemo(() => resolveTarget(target, rows), [target, rows]);
  const set = (p: Partial<Cadence>) => setCadence({ ...cadence, ...p });
  const okAction = act.kind !== "label_upsert" || (act.label.trim() && /^#?[0-9a-fA-F]{6}$/.test(act.color));

  const switchTarget = (kind: Target["kind"]) => {
    if (kind === "view")
      setTarget(
        presets[0]
          ? { kind, presetId: presets[0].id, name: presets[0].name, filter: presets[0].filter }
          : { kind, presetId: "", name: "", filter: undefined as never },
      );
    else if (kind === "cleanup") setTarget({ kind, preset: "spring" });
    else if (kind === "tag") setTarget({ kind, tag: "delete" });
    else setTarget({ kind, repos: [] });
  };
  const okTarget = target.kind !== "view" || !!target.presetId;

  const save = async () => {
    setBusy(true);
    try {
      await unwrap(
        commands.scheduleSave({
          id: schedule?.id ?? "",
          name: name.trim(),
          enabled: schedule?.enabled ?? true,
          account_id: schedule?.account_id ?? "",
          target: target as unknown as JsonValue,
          action,
          cadence,
          mode: ask ? "review" : mode,
          created_at: schedule?.created_at ?? "",
          last_run: null,
          next_run: null,
          history: [],
        }),
      );
      toast({ kind: "success", title: t("saved", { name: name.trim() }) });
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      width={860}
      kicker={t("title")}
      title={schedule ? t("edit.title", { name: schedule.name }) : t("edit.new")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={CalendarClock}
            loading={busy}
            disabled={!name.trim() || !okTarget || !okAction}
            onClick={() => void save()}
          >
            {t("edit.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div>
            <Label>{t("edit.name")}</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("edit.namePlaceholder")}
            />
          </div>

          <div>
            <Label>{t("edit.what")}</Label>
            <Select value={act.kind} onChange={(e) => setAct({ ...act, kind: e.target.value as ActionKind })}>
              {ACTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`action.${k}`)}
                </option>
              ))}
            </Select>
            {act.kind === "security_feature" && (
              <div className="mt-2 flex gap-2">
                <div className="flex-1">
                  <Select
                    value={act.feature}
                    onChange={(e) => setAct({ ...act, feature: e.target.value as Feature })}
                  >
                    {FEATURES.map((f) => (
                      <option key={f} value={f}>
                        {t(`security:feature.${f}.name`)}
                      </option>
                    ))}
                  </Select>
                </div>
                <Segmented<string>
                  value={act.enabled ? "on" : "off"}
                  onChange={(v) => setAct({ ...act, enabled: v === "on" })}
                  options={[
                    { value: "on", label: t("edit.on") },
                    { value: "off", label: t("edit.off") },
                  ]}
                />
              </div>
            )}
            {act.kind === "label_upsert" && (
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                <Input
                  value={act.label}
                  onChange={(e) => setAct({ ...act, label: e.target.value })}
                  placeholder={t("edit.labelName")}
                />
                <Input
                  value={act.color}
                  onChange={(e) => setAct({ ...act, color: e.target.value })}
                  placeholder="cccccc"
                  className="num"
                />
              </div>
            )}
            {act.kind === "release_next" && (
              <div className="mt-2 space-y-1.5">
                <Segmented<string>
                  size="sm"
                  value={act.bump}
                  onChange={(bump) => setAct({ ...act, bump })}
                  options={(["patch", "minor", "major", "date"] as const).map((v) => ({
                    value: v,
                    label: t(`edit.bump.${v}`),
                  }))}
                />
                <div className="flex gap-4">
                  <Checkbox
                    checked={act.draft}
                    onChange={(draft) => setAct({ ...act, draft })}
                    label={<span className="text-[12px]">{t("edit.releaseDraft")}</span>}
                  />
                  <Checkbox
                    checked={act.prerelease}
                    onChange={(prerelease) => setAct({ ...act, prerelease })}
                    label={<span className="text-[12px]">{t("edit.releasePre")}</span>}
                  />
                </div>
                <p className="text-[11.5px] text-faint">{t("edit.releaseNote")}</p>
              </div>
            )}
            {act.kind === "branch_protect" && (
              <p className="mt-1.5 text-[11.5px] text-faint">{t("edit.protectNote")}</p>
            )}
            <p className="mt-1.5 text-[11.5px] text-dim">{describeAction(action).label}</p>
          </div>

          <div>
            <Label>{t("edit.when")}</Label>
            <Segmented<string>
              className="w-full"
              value={cadence.every}
              onChange={(every) => set({ every })}
              options={(["hours", "day", "week", "month"] as const).map((v) => ({
                value: v,
                label: t(`every.${v}`),
              }))}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-dim">
              {cadence.every === "hours" ? (
                <>
                  {t("edit.everyN")}
                  <Input
                    type="number"
                    min={1}
                    max={168}
                    value={cadence.hours}
                    onChange={(e) => set({ hours: Math.max(1, Math.min(168, Number(e.target.value) || 1)) })}
                    className="num !h-8 !w-[80px] text-right"
                  />
                  {t("edit.hours")}
                </>
              ) : (
                <>
                  {cadence.every === "week" && (
                    <div className="w-[150px]">
                      <Select
                        value={String(cadence.weekday)}
                        onChange={(e) => set({ weekday: Number(e.target.value) })}
                      >
                        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                          <option key={d} value={d}>
                            {t(`weekday.${d}` as "weekday.0")}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                  {cadence.every === "month" && (
                    <>
                      {t("edit.onDay")}
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={cadence.day}
                        onChange={(e) => set({ day: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })}
                        className="num !h-8 !w-[70px] text-right"
                      />
                    </>
                  )}
                  {t("edit.at")}
                  <Input
                    type="time"
                    value={cadence.at}
                    onChange={(e) => set({ at: e.target.value || "09:00" })}
                    className="num !h-8 !w-[110px]"
                  />
                </>
              )}
            </div>
            <p className="mt-1.5 text-[11.5px] text-faint">{t("edit.catchUp")}</p>
          </div>

          <div>
            <Label>{t("edit.then")}</Label>
            <Segmented<string>
              className="w-full"
              value={ask ? "review" : mode}
              onChange={(m) => !ask && setMode(m)}
              options={[
                { value: "review", label: t("mode.review") },
                { value: "auto", label: t("mode.auto") },
              ]}
            />
            <p className="mt-1.5 text-[11.5px] text-faint">
              {ask ? t("mode.deleteAlwaysAsks") : mode === "auto" ? t("mode.autoNote") : t("mode.reviewNote")}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Label>{t("edit.which")}</Label>
          <Segmented<Target["kind"]>
            className="w-full"
            size="sm"
            value={target.kind}
            onChange={switchTarget}
            options={(["cleanup", "view", "tag", "repos"] as const).map((k) => ({
              value: k,
              label: t(`target.${k}`),
            }))}
          />
          {target.kind === "cleanup" && (
            <Select
              value={target.preset}
              onChange={(e) => setTarget({ kind: "cleanup", preset: e.target.value as "spring" })}
            >
              {(["spring", "portfolio", "minimal"] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`repos:cleanup.presets.${p}.name`)} — {t(`repos:cleanup.presets.${p}.desc`)}
                </option>
              ))}
            </Select>
          )}
          {target.kind === "view" &&
            (presets.length ? (
              <Select
                value={target.presetId}
                onChange={(e) => {
                  const p = presets.find((x) => x.id === e.target.value)!;
                  setTarget({ kind: "view", presetId: p.id, name: p.name, filter: p.filter });
                }}
              >
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-[12px] text-warn">{t("target.noViews")}</p>
            ))}
          {target.kind === "tag" && (
            <Select value={target.tag} onChange={(e) => setTarget({ kind: "tag", tag: e.target.value })}>
              {[...BUILTIN_TAGS, ...customTags].map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </Select>
          )}
          {target.kind === "repos" && (
            <RepoChecklist
              repos={rows.map((r) => r.repo.full_name).sort()}
              value={new Set(target.repos)}
              onChange={(s) => setTarget({ kind: "repos", repos: [...s] })}
              title={t("target.pick")}
              height={260}
            />
          )}
          <div className="rounded-[var(--radius)] border border-line p-2.5">
            <div className="annot mb-1 !text-[9.5px]">{t("target.now", { count: matches.length })}</div>
            <div className="num max-h-[150px] space-y-0.5 overflow-y-auto text-[11.5px] text-dim">
              {matches.slice(0, 40).map((r) => (
                <div key={r} className="truncate">
                  {r}
                </div>
              ))}
              {matches.length > 40 && (
                <div className="text-faint">{t("target.more", { count: matches.length - 40 })}</div>
              )}
              {!matches.length && <div className="text-faint">{t("target.none")}</div>}
            </div>
            <p className="mt-1.5 text-[11px] text-faint">{t("target.resolvedEachRun")}</p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
