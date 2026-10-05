import { useTranslation } from "react-i18next";
import { Info, KeyRound, Trash2 } from "lucide-react";
import { cn } from "@/core/cn";
import { formatDate } from "@/core/i18n/format";
import type { SheetParams } from "@/core/sheets/store";
import { Button, EmptyState, IconButton, Mark, RelTime } from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { useSecretsIndex } from "./api";
import { ageDays, placeKey, scopeOf, type Place } from "./model";
import { PlaceLabel } from "./shared";
import { UsageFinder } from "./UsageFinder";
import { useSecretsPrefs, useSecretsUi } from "./store";

const run = useQueue.getState;


export function SecretSheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["secrets", "common"]);
  const name = String(params.name);
  const { index } = useSecretsIndex();
  const staleDays = useSecretsPrefs((s) => s.staleDays);
  const setUi = useSecretsUi((s) => s.set);
  const g = index.secrets.find((x) => x.name === name);
  if (!g) return <EmptyState title={t("gone")} />;
  const places: Place[] = g.places.map(({ repo, env }) => ({ repo, env }));
  const remove = (ps: Place[]) =>
    run().requestRun(
      ps.map((p) => ({ repo: p.repo, action: { kind: "secret_delete", scope: scopeOf(p), name } })),
    );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-line-strong bg-surface px-6 pt-5 pb-4">
        <div className="annot">{t("secret.kicker")}</div>
        <h2 className="num truncate text-[19px] font-semibold">{name}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[12px] text-dim">
          <span>{t("places", { count: g.places.length })}</span>
          <span className={g.stale ? "text-warn" : undefined}>
            {t("secret.oldest", { when: formatDate(g.oldest) })}
          </span>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-faint">
          <Info size={12} /> {t("secret.note")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="primary"
            icon={KeyRound}
            onClick={() => setUi({ value: { kind: "secret", name, places } })}
          >
            {t("secret.rotate")}
          </Button>
          <Button variant="danger" icon={Trash2} onClick={() => remove(places)}>
            {t("secret.removeAll")}
          </Button>
        </div>
      </header>
      <UsageFinder kind="secrets" name={name} repos={g.places.map((p) => p.repo)} />
      {g.places.map((p) => {
        const stale = ageDays(p.updated_at) >= staleDays;
        return (
          <div
            key={placeKey(p)}
            className="grid grid-cols-[minmax(0,1fr)_150px_32px] items-center gap-3 border-b border-line px-4 py-2 hover:bg-surface-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Mark
                glyph={stale ? "hourglass" : "tick"}
                tone={stale ? "warn" : "ok"}
                title={stale ? t("stale") : undefined}
              />
              <PlaceLabel place={p} short />
            </span>
            <span className={cn("text-right text-[11.5px]", stale ? "text-warn" : "text-faint")}>
              <RelTime at={p.updated_at} />
            </span>
            <IconButton
              icon={Trash2}
              label={t("secret.remove")}
              size={13}
              className="size-7 hover:text-danger"
              onClick={() => remove([p])}
            />
          </div>
        );
      })}
    </div>
  );
}
