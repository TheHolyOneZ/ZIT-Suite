import { useTranslation } from "react-i18next";
import { Braces, Check, Pencil, Trash2 } from "lucide-react";
import type { SheetParams } from "@/core/sheets/store";
import { Badge, Button, EmptyState, IconButton, RelTime } from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { useSecretsIndex } from "./api";
import { placeKey, scopeOf, type Place } from "./model";
import { UsageFinder } from "./UsageFinder";
import { PlaceLabel } from "./shared";
import { useSecretsUi } from "./store";


export function VariableSheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["secrets", "common"]);
  const name = String(params.name);
  const { index } = useSecretsIndex();
  const setUi = useSecretsUi((s) => s.set);
  const g = index.variables.find((x) => x.name === name);
  if (!g) return <EmptyState title={t("gone")} />;
  const places: Place[] = g.places.map(({ repo, env }) => ({ repo, env }));
  const queue = useQueue.getState();
  const setValue = (ps: Place[], value: string) =>
    queue.requestRun(
      ps.map((p) => ({ repo: p.repo, action: { kind: "var_set", scope: scopeOf(p), name, value } })),
    );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-line-strong bg-surface px-6 pt-5 pb-4">
        <div className="annot">{t("variable.kicker")}</div>
        <h2 className="num truncate text-[19px] font-semibold">{name}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[12px] text-dim">
          <span>{t("places", { count: g.places.length })}</span>
          <span className={g.values.length > 1 ? "text-warn" : undefined}>
            {t("values", { count: g.values.length })}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="primary"
            icon={Braces}
            onClick={() =>
              setUi({ value: { kind: "variable", name, value: g.values[0]?.value ?? "", places } })
            }
          >
            {t("variable.setAll")}
          </Button>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={() =>
              queue.requestRun(
                places.map((p) => ({
                  repo: p.repo,
                  action: { kind: "var_delete", scope: scopeOf(p), name },
                })),
              )
            }
          >
            {t("variable.removeAll")}
          </Button>
        </div>
      </header>
      <UsageFinder kind="vars" name={name} repos={g.places.map((p) => p.repo)} />
      {g.values.length > 1 && (
        <div className="space-y-1.5 border-b border-line px-4 py-3">
          {g.values.map((v) => (
            <div
              key={v.value}
              className="flex items-center gap-2 rounded-[var(--radius)] border border-line bg-surface px-3 py-1.5"
            >
              <Badge>{v.count}×</Badge>
              <span className="num min-w-0 flex-1 truncate text-[12px]" title={v.value}>
                {v.value || "∅"}
              </span>
              <Button
                size="sm"
                icon={Check}
                onClick={() =>
                  setValue(
                    g.places.filter((p) => p.value !== v.value),
                    v.value,
                  )
                }
              >
                {t("variable.align")}
              </Button>
            </div>
          ))}
        </div>
      )}
      {g.places.map((p) => (
        <div
          key={placeKey(p)}
          className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_110px_60px] items-center gap-3 border-b border-line px-4 py-2 hover:bg-surface-2"
        >
          <PlaceLabel place={p} short />
          <span className="num truncate text-[12px] text-dim" title={p.value}>
            {p.value}
          </span>
          <span className="text-right text-[11.5px] text-faint">
            <RelTime at={p.updated_at} />
          </span>
          <span className="flex justify-end">
            <IconButton
              icon={Pencil}
              label={t("variable.edit")}
              size={13}
              className="size-7"
              onClick={() => setUi({ value: { kind: "variable", name, value: p.value, places: [p] } })}
            />
            <IconButton
              icon={Trash2}
              label={t("variable.remove")}
              size={13}
              className="size-7 hover:text-danger"
              onClick={() =>
                queue.requestRun([{ repo: p.repo, action: { kind: "var_delete", scope: scopeOf(p), name } }])
              }
            />
          </span>
        </div>
      ))}
    </div>
  );
}
