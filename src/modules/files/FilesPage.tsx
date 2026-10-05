import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, FileCode2, GitCommitHorizontal, RefreshCw } from "lucide-react";
import { errorMessage, toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { useIntent } from "@/core/sheets/store";
import { RepoPicker } from "@/app/RepoPicker";
import { Badge, Button, EmptyState, IconButton, PageHeader, Plotter, Select } from "@/ui";
import { reloadTree, useBranchList, useRepoTree } from "./api";
import { ChangesPane } from "./ChangesPane";
import { EditorPane } from "./EditorPane";
import { FileTree } from "./FileTree";
import type { StagedMap } from "./model";
import { keyOf, useFiles } from "./store";

const EMPTY: StagedMap = {};
const NO_TABS: string[] = [];

export function FilesPage() {
  const { t } = useTranslation(["files", "common"]);
  const ui = useFiles();
  const branches = useBranchList(ui.repo);
  const tree = useRepoTree(ui.repo, ui.branch);
  const k = ui.repo && ui.branch ? keyOf(ui.repo, ui.branch) : "";
  const staged = useFiles((s) => s.staged[k] ?? EMPTY);
  const tabs = useFiles((s) => s.tabs[k] ?? NO_TABS);
  const active = useFiles((s) => s.active[k] ?? null);
  const count = Object.keys(staged).length;
  const onStage = (s: StagedMap) => ui.setStaged(k, s);


  useIntent("files", (i) => {
    ui.set({ repo: String(i.repo), branch: i.branch ? String(i.branch) : null, folder: "", pane: "editor" });

    if (i.path && i.branch) ui.open(keyOf(String(i.repo), String(i.branch)), String(i.path));
  });

  useEffect(() => {
    const list = branches.data;
    if (!ui.repo || !list?.length || (ui.branch && list.includes(ui.branch))) return;
    ui.set({ branch: list.includes("main") ? "main" : list.includes("master") ? "master" : list[0] });
  }, [ui.repo, ui.branch, branches.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative flex h-full flex-col">
      {!ui.focus && (
        <PageHeader
          kicker={t("kicker")}
          title={t("title")}
          meta={<span>{t("subtitle")}</span>}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-[280px]">
                <RepoPicker
                  value={ui.repo}
                  onChange={(repo) => ui.set({ repo, branch: null, folder: "", pane: "editor" })}
                  writable
                  placeholder={t("pickRepo")}
                />
              </div>
              {ui.repo && (
                <Select
                  value={ui.branch ?? ""}
                  onChange={(e) => ui.set({ branch: e.target.value, folder: "" })}
                  className="!w-[180px]"
                >
                  {(branches.data ?? []).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </Select>
              )}
              {ui.repo && ui.branch && (
                <>
                  <IconButton
                    icon={RefreshCw}
                    label={t("reload")}
                    onClick={() => void reloadTree(ui.repo!, ui.branch!).catch(toastError)}
                  />
                  <IconButton
                    icon={ExternalLink}
                    label={t("openOnGitHub")}
                    onClick={() => void openUrl(`https://github.com/${ui.repo}/tree/${ui.branch}`)}
                  />
                  <Button
                    variant={ui.pane === "changes" ? "secondary" : "primary"}
                    icon={GitCommitHorizontal}
                    disabled={!count}
                    onClick={() => ui.set({ pane: ui.pane === "changes" ? "editor" : "changes" })}
                  >
                    {ui.pane === "changes" ? t("backToEditor") : t("reviewChanges", { count })}
                  </Button>
                </>
              )}
            </div>
          }
        />
      )}
      <div className="relative min-h-0 flex-1">
        {!ui.repo ? (
          <EmptyState icon={<FileCode2 size={20} />} title={t("start")} body={t("startBody")} />
        ) : tree.isLoading || !ui.branch ? (
          <Plotter />
        ) : tree.isError ? (
          <EmptyState title={errorMessage(tree.error)} />
        ) : tree.data ? (
          <div
            className={cn(
              "grid h-full min-h-0",
              ui.focus ? "grid-cols-1" : "grid-cols-[minmax(220px,280px)_minmax(0,1fr)]",
            )}
          >
            {!ui.focus && (
              <FileTree
                k={k}
                items={tree.data.items}
                staged={staged}
                onStage={onStage}
                onOpen={(p) => ui.open(k, p)}
                activePath={active}
              />
            )}
            <div className="min-h-0 min-w-0">
              {tree.data.truncated && <Badge tone="warn">{t("truncated")}</Badge>}
              {ui.pane === "changes" ? (
                <ChangesPane
                  repo={ui.repo}
                  branch={ui.branch}
                  commit={tree.data.commit}
                  items={tree.data.items}
                  staged={staged}
                  onStage={onStage}
                />
              ) : (
                <EditorPane
                  k={k}
                  repo={ui.repo}
                  branch={ui.branch}
                  items={tree.data.items}
                  staged={staged}
                  onStage={onStage}
                  tabs={tabs}
                  active={active}
                />
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
