import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  CloudOff,
  Code2,
  Download,
  ExternalLink,
  FileDiff,
  FolderOpen,
  GitCompareArrows,
  History,
  Info,
  ListTree,
  PlayCircle,
  RefreshCw,
  Rocket,
  Settings2,
  SquareTerminal,
  Upload,
} from "lucide-react";
import type { SheetParams } from "@/core/sheets/store";
import { cn } from "@/core/cn";
import { formatRelative } from "@/core/i18n/format";
import { commands, unwrap } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { Button, EmptyState, IconButton, Plotter, TabBar, useNow } from "@/ui";
import { useWorkspaceActions } from "./actions";
import { useStatus, useSync, useWorkspaces } from "./api";
import { BranchMenu } from "./BranchMenu";
import { AboutTab } from "./AboutTab";
import { ActionsTab } from "./ActionsTab";
import { ChangesTab } from "./ChangesTab";
import { CompareTab } from "./CompareTab";
import { FilesTab } from "./FilesTab";
import { HistoryTab } from "./HistoryTab";
import { ReleasesTab } from "./ReleasesTab";
import { headline, shortPath } from "./model";
import { AheadBehind, AutomationLine, GitTerm, HeadlineText } from "./parts";
import { SettingsTab } from "./SettingsTab";
import { RepoGone } from "./RepoGone";

type Tab = "changes" | "files" | "history" | "compare" | "settings" | "about" | "releases" | "actions";
const GH_TABS: Tab[] = ["about", "releases", "actions"];


export function WorkspaceSheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["home", "common", "errors"]);
  useNow();
  const id = String(params.id);
  const ws = useWorkspaces().data?.find((w) => w.id === id);
  const status = useStatus(id);
  const sync = useSync(id, !!(ws?.push_repo || ws?.reference_repo));
  const [tab, setTab] = useState<Tab>((params.tab as Tab) ?? "changes");
  const act = useWorkspaceActions(ws ?? ({ id, name: "", path: "" } as never));

  if (!ws) return <EmptyState title={t("errors:workspace.unknown")} />;
  if (status.isLoading) return <Plotter />;
  const s = status.data;
  const push = sync.data?.push;
  const ref = sync.data?.reference;
  const h = headline(s, sync.data, !!ws.push_repo);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line-strong bg-surface px-6 pt-5 pb-4">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-[220px] flex-1">
            <div className="annot">{t("title")}</div>
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[20px] font-semibold">{ws.name}</h2>
              {s?.ok && <BranchMenu ws={ws} current={s.branch} />}
            </div>
            <button
              onClick={() => void revealItemInDir(ws.path)}
              className="num block max-w-full cursor-default truncate text-left text-[11.5px] text-faint hover:text-accent"
              title={ws.path}
            >
              {shortPath(ws.path)}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <IconButton
              icon={FolderOpen}
              label={t("actions.openFolder")}
              onClick={() => void revealItemInDir(ws.path)}
            />
            <IconButton
              icon={Code2}
              label={t("actions.openEditor")}
              onClick={() =>
                void unwrap(commands.wsOpenEditor(ws.id)).catch((e) =>

                  (e as { appError?: { code?: string } }).appError?.code === "workspace.no_editor"
                    ? void revealItemInDir(ws.path)
                    : toastError(e),
                )
              }
            />
            <IconButton
              icon={SquareTerminal}
              label={t("actions.openTerminal")}
              onClick={() => void unwrap(commands.wsOpenTerminal(ws.id)).catch(toastError)}
            />
            {ws.push_repo && (
              <IconButton
                icon={ExternalLink}
                label={t("actions.openGitHub")}
                onClick={() => void openUrl(`https://github.com/${ws.push_repo}`)}
              />
            )}
            {(ws.push_repo || ws.reference_repo) && (
              <Button
                size="sm"
                icon={RefreshCw}
                loading={sync.isFetching}
                onClick={() => void sync.refetch()}
              >
                {t("actions.check")}
                <GitTerm term="fetch" />
              </Button>
            )}
          </div>
        </div>
        <HeadlineText h={h} className="mt-2 text-[15px]" />
        <div className="mt-2 empty:hidden">
          <RepoGone ws={ws} push={push} reference={ref} />
        </div>

        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] border-t border-l border-line">
          <Cell label={t("strip.local")}>
            <div className="flex min-w-0 flex-col">
              {s?.changes.length ? (
                <span className="text-warn">{t("strip.unsaved", { count: s.changes.length })}</span>
              ) : (
                <span className="text-ok">{t("strip.allSaved")}</span>
              )}
              {s?.last_commit && (
                <span className="truncate text-[11px] text-faint" title={s.last_commit.summary}>
                  {t("strip.savedAgo", { when: formatRelative(s.last_commit.time) })}
                </span>
              )}
            </div>
          </Cell>
          <Cell label={t("strip.push")}>
            {ws.push_repo ? (
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="num truncate text-[12px]">{ws.push_repo}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {sync.isFetching && !push ? (
                    <span className="text-[11px] text-faint">{t("strip.checking")}</span>
                  ) : (
                    push && <AheadBehind c={push} />
                  )}
                  {push && push.behind > 0 && push.related && (
                    <Button
                      size="sm"
                      icon={Download}
                      className="h-6 px-2 text-[11.5px]"
                      loading={act.busy === "latest"}
                      onClick={() => void act.getLatest("push", push.branch)}
                    >
                      {t("actions.getLatest")}
                    </Button>
                  )}
                  {push && !push.missing && (push.ahead > 0 || (!push.exists && s?.has_commits)) && (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={Upload}
                      className="h-6 px-2 text-[11.5px]"
                      loading={act.busy === "upload"}
                      onClick={() => void act.upload()}
                    >
                      {t("actions.upload")}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <button
                className="cursor-default text-[12px] text-faint hover:text-accent"
                onClick={() => setTab("settings")}
              >
                {t("strip.notSet")}
              </button>
            )}
          </Cell>
          <Cell label={t("strip.reference")}>
            {ref ? (
              <button
                className="flex min-w-0 flex-1 cursor-default flex-col gap-1 text-left"
                onClick={() => setTab("compare")}
              >
                <span className="num truncate text-[12px]">{ref.slug}</span>
                {ref.related ? (
                  <AheadBehind c={ref} reference />
                ) : (
                  <span className="text-[11.5px] text-warn">{t("strip.unrelated")}</span>
                )}
              </button>
            ) : (
              <span className="text-[12px] text-faint">
                {ws.reference_repo ? t("strip.sameAsPush") : t("strip.notSet")}
              </span>
            )}
          </Cell>
          <Cell label={t("strip.automation")}>
            <button
              className="min-w-0 cursor-default text-left text-[12px] hover:text-accent"
              onClick={() => setTab("settings")}
            >
              <AutomationLine ws={ws} />
            </button>
          </Cell>
        </div>
        {sync.data && (
          <div className="mt-1.5 text-right text-[10.5px] text-faint">
            {t("strip.checked", { when: formatRelative(sync.data.checked_at) })}
          </div>
        )}
      </header>

      <TabBar
        tabs={[
          { id: "changes", icon: FileDiff, label: t("tabs.changes"), count: s?.changes.length || undefined },
          { id: "files", icon: ListTree, label: t("tabs.files") },
          { id: "history", icon: History, label: t("tabs.history") },
          {
            id: "compare",
            icon: GitCompareArrows,
            label: t("tabs.reference"),
            count: (push?.behind ?? 0) + (ref?.behind ?? 0) || undefined,
          },
          { id: "settings", icon: Settings2, label: t("tabs.settings") },
          { id: "about", icon: Info, label: t("tabs.about"), group: t("tabs.onGitHub") },
          { id: "releases", icon: Rocket, label: t("tabs.releases") },
          { id: "actions", icon: PlayCircle, label: t("tabs.actions") },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className={cn("min-h-0 flex-1", tab === "changes" ? "flex flex-col" : "overflow-y-auto")}>
        {GH_TABS.includes(tab) ? (
          !ws.push_repo ? (
            <EmptyState
              icon={<CloudOff size={20} />}
              title={t("ghTabs.noRepo")}
              body={t("ghTabs.noRepoBody")}
              action={<Button onClick={() => setTab("settings")}>{t("tabs.settings")}</Button>}
            />
          ) : tab === "about" ? (
            <AboutTab ws={ws} repo={ws.push_repo} />
          ) : tab === "releases" ? (
            <ReleasesTab ws={ws} repo={ws.push_repo} />
          ) : (
            <ActionsTab ws={ws} repo={ws.push_repo} onAdded={() => setTab("changes")} />
          )
        ) : !s?.ok && tab !== "settings" ? (
          <EmptyState
            title={t(s?.error?.code === "workspace.no_folder" ? "state.missing" : "state.error")}
            body={ws.path}
          />
        ) : tab === "changes" ? (
          <ChangesTab ws={ws} status={s!} />
        ) : tab === "files" ? (
          <FilesTab ws={ws} status={s!} />
        ) : tab === "history" ? (
          <HistoryTab ws={ws} />
        ) : tab === "compare" ? (
          <CompareTab ws={ws} sync={sync.data} loading={sync.isFetching} />
        ) : (
          <SettingsTab ws={ws} />
        )}
      </div>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-r border-b border-line px-3 py-2">
      <div className="annot !text-[9.5px]">{label}</div>
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px]">{children}</div>
    </div>
  );
}
