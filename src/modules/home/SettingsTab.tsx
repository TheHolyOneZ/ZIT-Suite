import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloudUpload, GitFork, Trash2 } from "lucide-react";
import { commands, unwrap, type AutoMode, type Workspace } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { sheets } from "@/core/sheets/store";
import { toast } from "@/core/store/toasts";
import { Button, Checkbox, Input, Label, Segmented, Toggle, useConfirmClick } from "@/ui";
import { refreshAll, refreshList } from "./api";
import { INTERVALS, intervalLabel, nearestInterval, parseSlug } from "./model";
import { GitTerm } from "./parts";


export function SettingsTab({ ws }: { ws: Workspace }) {
  const { t } = useTranslation(["home", "common"]);
  const [d, setD] = useState<Workspace>(ws);
  const [push, setPush] = useState(ws.push_repo ?? "");
  const [ref, setRef] = useState(ws.reference_repo ?? "");
  const [same, setSame] = useState(!ws.reference_repo || ws.reference_repo === ws.push_repo);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setD(ws);
    setPush(ws.push_repo ?? "");
    setRef(ws.reference_repo ?? "");
    setSame(!ws.reference_repo || ws.reference_repo === ws.push_repo);
  }, [ws]);
  const set = (p: Partial<Workspace>) => setD((cur) => ({ ...cur, ...p }));

  const pushOk = !push.trim() || !!parseSlug(push);
  const refOk = same || !ref.trim() || !!parseSlug(ref);
  const next: Workspace = {
    ...d,
    push_repo: push.trim() ? parseSlug(push) : null,
    reference_repo: same ? null : ref.trim() ? parseSlug(ref) : null,
  };
  const dirty = JSON.stringify(next) !== JSON.stringify(ws);

  const save = async () => {
    if (!pushOk || !refOk) return;
    setBusy(true);
    try {
      await unwrap(commands.wsUpdate(next));
      await refreshList();
      refreshAll(ws.id);
      toast({ kind: "success", title: t("settings.saved") });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = useConfirmClick(async () => {
    try {
      await unwrap(commands.wsRemove(ws.id));
      sheets.pop();
      await refreshList();
      toast({ kind: "success", title: t("settings.removed"), body: t("settings.removeHint") });
    } catch (e) {
      toastError(e);
    }
  });
  const idx = INTERVALS.indexOf(nearestInterval(d.interval_secs));

  return (
    <div className="mx-auto max-w-[680px] space-y-6 p-5">
      <section className="space-y-3">
        <div>
          <Label>{t("settings.name")}</Label>
          <Input value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div>
          <Label
            hint={
              !pushOk ? (
                <span className="text-danger">{t("settings.invalidRepo")}</span>
              ) : (
                <GitTerm term="push" />
              )
            }
          >
            {t("settings.push")}
          </Label>
          <Input
            icon={CloudUpload}
            value={push}
            onChange={(e) => setPush(e.target.value)}
            placeholder="owner/name"
            className="num"
          />
          <p className="mt-1 text-[11px] text-faint">{t("settings.pushHint")}</p>
        </div>
        <div>
          <Label hint={!refOk ? <span className="text-danger">{t("settings.invalidRepo")}</span> : undefined}>
            {t("settings.reference")}
          </Label>
          <Checkbox checked={same} onChange={setSame} label={t("strip.sameAsPush")} />
          {!same && (
            <Input
              icon={GitFork}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="https://github.com/original/project"
              className="num mt-2"
            />
          )}
          <p className="mt-1 text-[11px] text-faint">{t("settings.referenceHint")}</p>
        </div>
      </section>

      <section className="space-y-3 border-t border-line pt-5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium">{t("settings.watch")}</span>
          <Toggle checked={d.watch} onChange={(watch) => set({ watch })} label={t("settings.watch")} />
        </div>
        <div className={d.watch ? undefined : "pointer-events-none opacity-40"}>
          <Label hint={<span className="num">{intervalLabel(INTERVALS[idx], t)}</span>}>
            {t("settings.interval")}
          </Label>
          <input
            type="range"
            min={0}
            max={INTERVALS.length - 1}
            step={1}
            value={idx}
            onChange={(e) => set({ interval_secs: INTERVALS[Number(e.target.value)] })}
            className="w-full accent-[var(--accent)]"
          />
          <div className="num flex justify-between text-[10px] text-faint">
            {INTERVALS.map((s) => (
              <span key={s}>{intervalLabel(s, t)}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-line pt-5">
        <div className="flex items-center text-[13px] font-medium">
          {t("settings.auto")}
          <GitTerm term="commit" />
        </div>
        {!d.watch && <p className="text-[12px] text-warn">{t("settings.needsWatch")}</p>}
        <div className={d.watch ? "space-y-3" : "pointer-events-none space-y-3 opacity-40"}>
          <Segmented<AutoMode>
            size="sm"
            className="w-full"
            value={d.auto}
            onChange={(auto) => set({ auto })}
            options={(["manual", "interval", "idle"] as const).map((m) => ({
              value: m,
              label: t(`settings.autoMode.${m}`),
            }))}
          />
          <p className="text-[12px] text-dim">
            {t(`settings.autoModeHint.${d.auto}`, { count: d.auto_minutes })}
          </p>
          {d.auto !== "manual" && (
            <>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={d.auto_minutes}
                  onChange={(e) => set({ auto_minutes: Math.max(1, Number(e.target.value) || 1) })}
                  className="num w-[90px]"
                />
                <span className="text-[12px] text-dim">{t("settings.minutes")}</span>
              </div>
              <Checkbox
                checked={d.auto_push}
                onChange={(auto_push) => set({ auto_push })}
                label={
                  <span className="flex items-center">
                    {t("settings.autoPush")}
                    <GitTerm term="push" />
                  </span>
                }
              />
              <div>
                <Label hint={t("settings.templateHint")}>{t("settings.template")}</Label>
                <Input
                  value={d.message_template}
                  onChange={(e) => set({ message_template: e.target.value })}
                />
              </div>
            </>
          )}
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-5">
        <Button variant="danger" icon={Trash2} onClick={remove.onClick}>
          {remove.armed ? `${t("settings.remove")}?` : t("settings.remove")}
        </Button>
        <Button
          variant="primary"
          loading={busy}
          disabled={!dirty || !pushOk || !refOk}
          onClick={() => void save()}
        >
          {t("settings.save")}
        </Button>
      </div>
      <p className="-mt-3 text-[11px] text-faint">{t("settings.removeHint")}</p>
    </div>
  );
}
