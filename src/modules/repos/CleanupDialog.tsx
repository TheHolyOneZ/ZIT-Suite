import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { cn } from "@/core/cn";
import { Button, Checkbox, Dialog, Select, Mark, RelTime } from "@/ui";
import { requestQueue } from "@/modules/queue/store";
import { useRepoRows } from "./api";
import { CLEANUP_PRESETS, type CleanupPresetId } from "./cleanup";
import { healthGlyph, healthTone } from "./health";
import { useReposUi } from "./store";

const ACTIONS = ["archive", "set_private", "delete"] as const;
type CleanupAction = (typeof ACTIONS)[number];

export function CleanupDialog() {
  const { t } = useTranslation(["repos", "common", "queue"]);
  const open = useReposUi((s) => s.cleanupOpen);
  const set = useReposUi((s) => s.set);
  const { rows } = useRepoRows();
  const [presetId, setPresetId] = useState<CleanupPresetId>("spring");
  const preset = CLEANUP_PRESETS.find((p) => p.id === presetId)!;
  const [action, setAction] = useState<CleanupAction>(preset.action);
  const candidates = useMemo(() => preset.select(rows), [preset, rows]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    setAction(preset.action);
    setPicked(new Set(candidates.map((c) => c.repo.full_name)));
  }, [preset, candidates]);

  const close = () => set({ cleanupOpen: false });
  const toggle = (n: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  return (
    <Dialog
      open={open}
      onClose={close}
      kicker={t("cleanup.kicker")}
      title={t("cleanup.title")}
      width={680}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant={action === "delete" ? "danger" : "primary"}
            icon={Sparkles}
            disabled={picked.size === 0}
            onClick={() => {
              close();
              requestQueue([...picked], { kind: action });
            }}
          >
            {t("cleanup.review", { count: picked.size })}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {CLEANUP_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPresetId(p.id)}
            className={cn(
              "relative rounded-[var(--radius)] border p-3 text-left transition-colors cursor-default",
              p.id === presetId ? "border-accent bg-surface-2" : "border-line hover:border-line-strong",
            )}
          >
            <div className="text-[13px] font-medium">{t(`cleanup.presets.${p.id}.name`)}</div>
            <div className="mt-1 text-[11.5px] text-dim">{t(`cleanup.presets.${p.id}.desc`)}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={candidates.length > 0 && picked.size === candidates.length}
            indeterminate={picked.size > 0 && picked.size < candidates.length}
            onChange={(all) => setPicked(new Set(all ? candidates.map((c) => c.repo.full_name) : []))}
          />
          <span className="annot">{t("cleanup.candidates", { count: candidates.length })}</span>
          <span className="num text-[11px] text-faint">{t("cleanup.picked", { count: picked.size })}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-dim">{t("cleanup.action")}</span>
          <div className="w-44">
            <Select value={action} onChange={(e) => setAction(e.target.value as CleanupAction)}>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {t(`queue:actions.${a}`)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div className="mt-2 max-h-[320px] overflow-y-auto rounded-[var(--radius)] border border-line">
        {candidates.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12.5px] text-faint">{t("cleanup.none")}</div>
        ) : (
          candidates.map(({ repo, health }) => (
            <div
              key={repo.id}
              className="flex items-center gap-3 border-b border-line px-3 py-2 text-[12.5px] last:border-0"
            >
              <Checkbox checked={picked.has(repo.full_name)} onChange={() => toggle(repo.full_name)} />
              <Mark glyph={healthGlyph[health.status]} tone={healthTone[health.status]} size={11} />
              <span className="num min-w-0 flex-1 truncate">{repo.full_name}</span>
              <span className="num text-[11px] text-faint">{health.score}</span>
              <span className="num w-24 text-right text-[11px] text-faint">
                <RelTime at={repo.pushed_at ?? repo.updated_at} />
              </span>
            </div>
          ))
        )}
      </div>
    </Dialog>
  );
}
