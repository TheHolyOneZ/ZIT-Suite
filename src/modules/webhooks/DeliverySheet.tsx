import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, RotateCcw } from "lucide-react";
import { commands, unwrap, type Header } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { formatDate } from "@/core/i18n/format";
import { toast } from "@/core/store/toasts";
import type { SheetParams } from "@/core/sheets/store";
import { Badge, Button, EmptyState, IconButton, Plotter, RelTime, Section } from "@/ui";
import { deliveriesKey, refreshRepoHooks, useDelivery } from "./api";
import { DeliveryCode } from "./HookMarks";
import { JsonView } from "./JsonView";


export function DeliverySheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["webhooks", "common"]);
  const qc = useQueryClient();
  const repo = String(params.repo);
  const id = Number(params.id);
  const deliveryId = String(params.delivery);
  const { data, isLoading, error } = useDelivery(repo, id, deliveryId);
  const [busy, setBusy] = useState(false);

  if (isLoading) return <Plotter />;
  if (error || !data) return <EmptyState title={errorMessage(error)} />;
  const d = data.delivery;

  const redeliver = async () => {
    setBusy(true);
    try {
      await unwrap(commands.hooksRedeliver(repo, id, deliveryId));
      toast({ kind: "success", title: t("delivery.redelivered") });
      setTimeout(() => {
        void qc.resetQueries({ queryKey: deliveriesKey(repo, id) });
        void refreshRepoHooks(repo);
      }, 2500);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-line-strong bg-surface px-6 pt-5 pb-4">
        <div className="annot">{t("delivery.kicker")}</div>
        <div className="mt-1 flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-[200px] flex-1">
            <h2 className="num text-[19px] font-semibold">
              {d.event}
              {d.action && <span className="text-faint">.{d.action}</span>}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-dim">
              <DeliveryCode d={d} />
              <span className="truncate">{d.status}</span>
              <span className="text-faint">·</span>
              <span title={formatDate(d.delivered_at, { dateStyle: "medium", timeStyle: "medium" })}>
                <RelTime at={d.delivered_at} />
              </span>
              <span className="text-faint">·</span>
              <span className="num">{t("delivery.duration", { ms: Math.round(d.duration * 1000) })}</span>
              {d.redelivery && <Badge>{t("deliveries.redelivery")}</Badge>}
            </div>
          </div>
          <Button variant="primary" icon={RotateCcw} loading={busy} onClick={redeliver}>
            {t("delivery.redeliver")}
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
          {t("delivery.guid")} <span className="num text-dim">{d.guid}</span>
          <IconButton
            icon={Copy}
            label={t("delivery.copy")}
            size={11}
            className="size-5"
            onClick={() => navigator.clipboard.writeText(d.guid)}
          />
        </div>
      </header>
      <div className="space-y-2 px-2 py-3">
        <Section title={t("delivery.request")}>
          <div className="space-y-3 px-4">
            <div className="text-[12px] text-dim">
              {t("delivery.sentTo")} <span className="num text-text">{data.url}</span>
            </div>
            <Headers headers={data.request_headers} />
            <JsonView source={data.request_payload} empty={t("delivery.noBody")} />
          </div>
        </Section>
        <Section title={t("delivery.response")}>
          <div className="space-y-3 px-4">
            <Headers headers={data.response_headers} />
            <JsonView source={data.response_body ?? ""} empty={t("delivery.noBody")} maxHeight={320} />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Headers({ headers }: { headers: Header[] }) {
  const { t } = useTranslation("webhooks");
  if (headers.length === 0) return null;
  return (
    <details className="rounded-[var(--radius)] border border-line" open={headers.length <= 12}>
      <summary className="annot cursor-default px-3 py-1.5">
        {t("delivery.headers")} · {headers.length}
      </summary>
      <div className="border-t border-line">
        {headers.map((h) => (
          <div
            key={h.name}
            className="grid grid-cols-[minmax(140px,220px)_minmax(0,1fr)] gap-3 border-b border-line px-3 py-1 last:border-b-0"
          >
            <span className="num truncate text-[11.5px] text-dim">{h.name}</span>
            <span className="num text-[11.5px] break-all">{h.value}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
