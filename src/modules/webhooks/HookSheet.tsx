import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  GitCommitHorizontal,
  ListChecks,
  RefreshCw,
  Send,
  Settings2,
  Trash2,
} from "lucide-react";
import { commands, unwrap, type Hook } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { formatNumber } from "@/core/i18n/format";
import { toast } from "@/core/store/toasts";
import { sheets, useSheets, useTopSheet, type SheetParams } from "@/core/sheets/store";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Badge, Button, EmptyState, IconButton, Plotter, RelTime, Segmented, TabBar, Toggle } from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { deliveriesKey, refreshRepoHooks, useDeliveries, useRepoHooks } from "./api";
import { draftErrors, draftFrom, draftPatch, isEmptyPatch, NO_PATCH, type HookDraft } from "./draft";
import { HookForm } from "./HookForm";
import { DeliveryCode, EventList, StateMark } from "./HookMarks";
import { hookState, splitUrl, urlKey } from "./model";

type Tab = "deliveries" | "settings";


export function HookSheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["webhooks", "common"]);
  const repo = String(params.repo);
  const id = Number(params.id);
  const { data, isLoading, error } = useRepoHooks(repo);
  const hook = data?.hooks.find((h) => h.id === id);
  const [tab, setTab] = useState<Tab>("deliveries");

  if (isLoading) return <Plotter />;
  if (error || data?.error) return <EmptyState title={errorMessage(error ?? data?.error)} />;
  if (!hook) return <EmptyState title={t("hook.gone")} />;

  return (
    <div className="flex h-full flex-col">
      <HookHeader repo={repo} hook={hook} />
      <TabBar
        tabs={[
          { id: "deliveries", icon: ListChecks, label: t("tabs.deliveries") },
          { id: "settings", icon: Settings2, label: t("tabs.settings") },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "deliveries" ? (
          <DeliveriesTab repo={repo} hook={hook} />
        ) : (
          <SettingsTab repo={repo} hook={hook} />
        )}
      </div>
    </div>
  );
}

function HookHeader({ repo, hook }: { repo: string; hook: Hook }) {
  const { t } = useTranslation(["webhooks", "common"]);
  const qc = useQueryClient();
  const state = hookState(hook);
  const { host, path } = splitUrl(hook.url);
  const [busy, setBusy] = useState(false);

  const ping = async () => {
    try {
      await unwrap(commands.hooksPing(repo, hook.id));
      toast({ kind: "success", title: t("hook.pinged") });

      setTimeout(() => void qc.invalidateQueries({ queryKey: deliveriesKey(repo, hook.id) }), 2500);
      setTimeout(() => void refreshRepoHooks(repo), 4000);
    } catch (e) {
      toastError(e);
    }
  };
  const testPush = async () => {
    try {
      await unwrap(commands.hooksTestPush(repo, hook.id));
      toast({ kind: "success", title: t("hook.testPushed") });
      setTimeout(() => void qc.invalidateQueries({ queryKey: deliveriesKey(repo, hook.id) }), 2500);
    } catch (e) {
      toastError(e);
    }
  };
  const setActive = async (active: boolean) => {
    setBusy(true);
    try {
      await unwrap(commands.hooksPatch(repo, hook.id, { ...NO_PATCH, active }));
      await refreshRepoHooks(repo);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="border-b border-line-strong bg-surface px-6 pt-5 pb-4">
      <div className="annot flex items-center gap-2">
        {t("hook.kicker")} · <span className="num normal-case">{repo}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-[220px] flex-1">
          <h2 className="num truncate text-[19px] font-semibold" title={hook.url}>
            {host}
          </h2>
          <div className="num truncate text-[12px] text-faint">{path || "/"}</div>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            icon={ExternalLink}
            label="GitHub"
            onClick={() => openUrl(`https://github.com/${repo}/settings/hooks/${hook.id}`)}
          />
          <Button icon={Send} onClick={ping}>
            {t("hook.ping")}
          </Button>
          {(hook.events.includes("push") || hook.events.includes("*")) && (
            <Button icon={GitCommitHorizontal} onClick={testPush} title={t("hook.testPushHint")}>
              {t("hook.testPush")}
            </Button>
          )}
          <Button
            variant="danger"
            icon={Trash2}
            onClick={() =>
              useQueue.getState().requestRun([{ repo, action: { kind: "hook_delete", url: hook.url } }])
            }
          >
            {t("hook.remove")}
          </Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] border-t border-l border-line">
        <Cell label={t("hook.state")}>
          <StateMark state={state} />
          <span>{t(`states.${state}`)}</span>
          <span className="ml-auto">
            <Toggle
              checked={hook.active}
              onChange={(v) => !busy && void setActive(v)}
              label={t("form.active")}
            />
          </span>
        </Cell>
        <Cell label={t("hook.lastResponse")}>
          {hook.last_response.code == null ? (
            <span className="text-faint">{t("hook.never")}</span>
          ) : (
            <span
              className={cn(
                "num truncate",
                hook.last_response.code >= 200 && hook.last_response.code < 300 ? "text-ok" : "text-danger",
              )}
              title={hook.last_response.message ?? ""}
            >
              {hook.last_response.code} {hook.last_response.message}
            </span>
          )}
        </Cell>
        <Cell label={t("hook.events")}>
          <EventList events={hook.events} max={2} />
        </Cell>
        <Cell label={t("hook.format")}>
          <span className="num">{hook.content_type === "json" ? "JSON" : t("form.formEncoded")}</span>
          <span className="text-faint">·</span>
          <span className={hook.has_secret ? "text-dim" : "text-warn"}>
            {hook.has_secret ? t("hook.signed") : t("hook.unsigned")}
          </span>
          {hook.insecure_ssl && <Badge tone="warn">{t("hook.sslOff")}</Badge>}
        </Cell>
      </div>
    </header>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-r border-b border-line px-3 py-2">
      <div className="annot !text-[9.5px]">{label}</div>
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px]">{children}</div>
    </div>
  );
}

function DeliveriesTab({ repo, hook }: { repo: string; hook: Hook }) {
  const { t } = useTranslation(["webhooks", "common"]);
  const qc = useQueryClient();
  const q = useDeliveries(repo, hook.id);
  const [only, setOnly] = useState<"all" | "failed">("all");
  const open = useTopSheet("webhooks", "delivery")?.delivery;
  const all = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const list = only === "failed" ? all.filter((d) => d.status_code < 200 || d.status_code >= 300) : all;

  if (q.isLoading) return <Plotter />;
  if (q.isError) return <EmptyState title={errorMessage(q.error)} />;
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <Segmented
          size="sm"
          value={only}
          onChange={setOnly}
          options={[
            { value: "all", label: t("deliveries.all") },
            { value: "failed", label: t("deliveries.failed") },
          ]}
        />
        <span className="num text-[11px] text-faint">{formatNumber(list.length)}</span>
        <IconButton
          icon={RefreshCw}
          label={t("deliveries.refresh")}
          className="ml-auto"
          onClick={() => qc.resetQueries({ queryKey: deliveriesKey(repo, hook.id) })}
        />
      </div>
      {list.length === 0 ? (
        <EmptyState title={only === "failed" ? t("deliveries.emptyFailed") : t("deliveries.empty")} />
      ) : (
        list.map((d) => (
          <button
            key={d.id}
            onClick={() =>
              sheets.push("webhooks", "delivery", { repo, id: hook.id, delivery: d.id, title: d.event })
            }
            className={cn(
              "grid w-full cursor-default grid-cols-[86px_minmax(0,1fr)_80px_110px] items-center gap-3 border-b border-line px-4 py-2 text-left hover:bg-surface-2",
              open === d.id && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
            )}
          >
            <DeliveryCode d={d} />
            <span className="min-w-0">
              <span className="num block truncate text-[12.5px]">
                {d.event}
                {d.action && <span className="text-faint">.{d.action}</span>}
              </span>
              <span className="block truncate text-[11px] text-faint">{d.status}</span>
            </span>
            <span className="num text-right text-[11.5px] text-dim">
              {t("delivery.duration", { ms: Math.round(d.duration * 1000) })}
            </span>
            <span className="text-right text-[11.5px] text-faint">
              <RelTime at={d.delivered_at} />
            </span>
          </button>
        ))
      )}
      {q.hasNextPage && (
        <div className="p-3 text-center">
          <Button size="sm" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            {t("deliveries.older")}
          </Button>
        </div>
      )}
    </div>
  );
}

function SettingsTab({ repo, hook }: { repo: string; hook: Hook }) {
  const { t } = useTranslation(["webhooks", "common"]);
  const initial = useMemo(() => draftFrom(hook), [hook]);
  const [draft, setDraft] = useState<HookDraft>(initial);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(initial), [initial]);
  const patch = draftPatch(initial, draft);
  const dirty = !isEmptyPatch(patch);

  const save = async () => {
    setTried(true);
    if (draftErrors(draft).length) return;
    setBusy(true);
    try {
      await unwrap(commands.hooksPatch(repo, hook.id, patch));
      await refreshRepoHooks(repo);

      if (patch.url) {
        const from = urlKey(hook.url);
        useSheets
          .getState()
          .patchWhere("webhooks", "endpoint", (p) => p.key === from, {
            key: urlKey(patch.url),
            title: splitUrl(patch.url).host,
          });
      }
      toast({ kind: "success", title: t("hook.saved") });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[640px] px-6 pt-5">
      <HookForm value={draft} onChange={setDraft} hasSecret={hook.has_secret} showErrors={tried} />
      <div className="sticky bottom-0 mt-5 flex justify-end gap-2 border-t border-line bg-bg py-3">
        <Button variant="ghost" disabled={!dirty} onClick={() => (setDraft(initial), setTried(false))}>
          {t("hook.reset")}
        </Button>
        <Button variant="primary" loading={busy} disabled={!dirty} onClick={save}>
          {t("hook.save")}
        </Button>
      </div>
    </div>
  );
}
