import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Pause, Pencil, Play, Plus, Send, Trash2 } from "lucide-react";
import { commands, unwrap, type NewQueueItem } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { toast } from "@/core/store/toasts";
import { sheets, useTopSheet, type SheetParams } from "@/core/sheets/store";
import { Button, EmptyState, IconButton, Toggle } from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { refreshRepoHooks, useEndpoint } from "./api";
import { draftFrom, draftToInput, NO_PATCH } from "./draft";
import { EventList, StateMark, StateSpread } from "./HookMarks";
import { hookState } from "./model";
import { useHooksUi } from "./store";


export function EndpointSheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["webhooks", "common"]);
  const e = useEndpoint(String(params.key));
  const setUi = useHooksUi((s) => s.set);
  const open = useTopSheet("webhooks", "hook");
  const [pinging, setPinging] = useState(false);
  if (!e) return <EmptyState title={t("endpoint.gone")} />;

  const repos = [...new Set(e.hooks.map((h) => h.repo))];
  const run = (items: NewQueueItem[]) => useQueue.getState().requestRun(items);
  const anyActive = e.hooks.some((h) => h.hook.active);
  const pingAll = async () => {
    setPinging(true);
    const res = await Promise.allSettled(e.hooks.map((h) => unwrap(commands.hooksPing(h.repo, h.hook.id))));
    setPinging(false);
    const failed = res.find((r) => r.status === "rejected");
    if (failed) toastError((failed as PromiseRejectedResult).reason);
    toast({
      kind: "success",
      title: t("endpoint.pinged", { count: res.filter((r) => r.status === "fulfilled").length }),
    });
    setTimeout(() => repos.forEach((r) => void refreshRepoHooks(r)), 4000);
  };
  const setActive = async (repo: string, id: number, active: boolean) => {
    try {
      await unwrap(commands.hooksPatch(repo, id, { ...NO_PATCH, active }));
      await refreshRepoHooks(repo);
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-line-strong bg-surface px-6 pt-5 pb-4">
        <div className="annot">{t("endpoint.kicker")}</div>
        <div className="mt-1 flex items-center gap-2">
          <StateMark state={e.worst} size={14} />
          <h2 className="num min-w-0 truncate text-[19px] font-semibold" title={e.url}>
            {e.host}
          </h2>
          <IconButton
            icon={Copy}
            label={t("delivery.copy")}
            size={12}
            className="size-6"
            onClick={() => navigator.clipboard.writeText(e.url)}
          />
        </div>
        <div className="num truncate text-[12px] text-faint">{e.path || "/"}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-dim">
          <span>{t("endpoint.onRepos", { count: repos.length })}</span>
          <StateSpread states={e.states} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            icon={Plus}
            onClick={() =>
              setUi({
                create: { repos: [], config: { ...draftToInput(draftFrom(e.hooks[0].hook)), secret: null } },
              })
            }
          >
            {t("endpoint.addRepos")}
          </Button>
          <Button icon={Pencil} onClick={() => setUi({ edit: e.key })}>
            {t("endpoint.edit")}
          </Button>
          <Button icon={Send} loading={pinging} onClick={pingAll}>
            {t("endpoint.ping")}
          </Button>
          <Button
            icon={anyActive ? Pause : Play}
            onClick={() =>
              run(
                repos.map((repo) => ({
                  repo,
                  action: { kind: "hook_update", url: e.url, patch: { ...NO_PATCH, active: !anyActive } },
                })),
              )
            }
          >
            {anyActive ? t("endpoint.pause") : t("endpoint.resume")}
          </Button>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={() => run(repos.map((repo) => ({ repo, action: { kind: "hook_delete", url: e.url } })))}
          >
            {t("endpoint.remove")}
          </Button>
        </div>
      </header>
      <div>
        {e.hooks.map(({ repo, hook }) => (
          <div
            key={`${repo}#${hook.id}`}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_40px] items-center gap-3 border-b border-line px-4 py-2 hover:bg-surface-2",
              open?.repo === repo &&
                Number(open?.id) === hook.id &&
                "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
            )}
          >
            <button
              onClick={() =>
                sheets.push("webhooks", "hook", { repo, id: hook.id, title: repo.split("/")[1] })
              }
              className="flex min-w-0 cursor-default items-center gap-2 text-left"
            >
              <StateMark state={hookState(hook)} />
              <span className="num truncate text-[12.5px] hover:text-accent">{repo}</span>
            </button>
            <EventList events={hook.events} />
            <span className="num truncate text-[11.5px] text-dim" title={hook.last_response.message ?? ""}>
              {hook.last_response.code == null
                ? t("hook.never")
                : `${hook.last_response.code} ${hook.last_response.message ?? ""}`}
            </span>
            <Toggle
              checked={hook.active}
              onChange={(v) => void setActive(repo, hook.id, v)}
              label={t("form.active")}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
