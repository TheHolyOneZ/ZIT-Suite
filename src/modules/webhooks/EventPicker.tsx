import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { cn } from "@/core/cn";
import { Checkbox, Input, Segmented } from "@/ui";
import { EVENT_GROUPS, eventMode, type EventGroup, type EventMode } from "./events";


export function EventPicker({
  value,
  onChange,
  invalid,
}: {
  value: string[];
  onChange: (events: string[]) => void;
  invalid?: boolean;
}) {
  const { t } = useTranslation("webhooks");
  const [mode, setMode] = useState<EventMode>(() => eventMode(value));
  const [q, setQ] = useState("");
  const chosen = value.filter((e) => e !== "*");


  const implied = eventMode(value);
  useEffect(() => {
    if (implied === "all" || implied === "custom") setMode(implied);
    else if (mode === "all") setMode("push");


    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [implied]);

  const pickMode = (m: EventMode) => {
    setMode(m);
    if (m === "push") onChange(["push"]);
    else if (m === "all") onChange(["*"]);
    else onChange(chosen.length ? chosen : ["push"]);
  };
  const toggle = (events: readonly string[], on: boolean) => {
    const n = new Set(chosen);
    for (const e of events) {
      if (on) n.add(e);
      else n.delete(e);
    }
    onChange([...n]);
  };
  const groups = useMemo(
    () =>
      (Object.entries(EVENT_GROUPS) as [EventGroup, readonly string[]][])
        .map(
          ([g, evs]) =>
            [g, evs.filter((e) => !q || e.includes(q.toLowerCase().replace(/\s+/g, "_")))] as const,
        )
        .filter(([, evs]) => evs.length > 0),
    [q],
  );

  return (
    <div>
      <Segmented
        size="sm"
        className="w-full"
        value={mode}
        onChange={pickMode}
        options={(["push", "all", "custom"] as const).map((m) => ({
          value: m,
          label: t(`events.mode.${m}`),
        }))}
      />
      {mode === "custom" && (
        <div
          className={cn("mt-2 rounded-[var(--radius)] border p-2", invalid ? "border-danger" : "border-line")}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="num text-[11px] text-faint">
              {t("events.selected", { count: chosen.length })}
            </span>
            <div className="w-[200px]">
              <Input
                icon={Search}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("events.search")}
                className="h-7 text-[12px]"
              />
            </div>
          </div>
          <div className="max-h-[260px] space-y-2.5 overflow-x-hidden overflow-y-auto pr-1">
            {groups.map(([g, evs]) => {
              const on = evs.filter((e) => chosen.includes(e)).length;
              return (
                <div key={g}>
                  <Checkbox
                    checked={on === evs.length}
                    indeterminate={on > 0 && on < evs.length}
                    onChange={(v) => toggle(evs, v)}
                    label={<span className="annot">{t(`eventGroups.${g}`)}</span>}
                  />
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 pl-5 [&>*]:min-w-0">
                    {evs.map((e) => (
                      <Checkbox
                        key={e}
                        className="min-w-0 max-w-full"
                        checked={chosen.includes(e)}
                        onChange={(v) => toggle([e], v)}
                        label={
                          <span className="num truncate text-[11.5px]" title={e}>
                            {e}
                          </span>
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
