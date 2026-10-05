import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, FilePlus2, LayoutGrid, Workflow } from "lucide-react";
import { useIntent } from "@/core/sheets/store";
import { RepoPicker } from "@/app/RepoPicker";
import { Button, EmptyState, IconButton, PageHeader, Segmented } from "@/ui";
import { BulkWorkflowDialog } from "./BulkWorkflowDialog";
import { Board } from "./Board";
import { RepoView } from "./RepoView";
import { useActionsUi, type ActionsView } from "./store";


export function ActionsPage() {
  const { t } = useTranslation(["actions", "common"]);
  const ui = useActionsUi();
  const [bulk, setBulk] = useState(false);
  useIntent("actions", (i) => ui.set({ view: "repo", repo: String(i.repo), workflow: null }));

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={<span>{t("subtitle")}</span>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={FilePlus2} onClick={() => setBulk(true)}>
              {t("bulkWf.open")}
            </Button>
            <Segmented<ActionsView>
              value={ui.view}
              onChange={(view) => ui.set({ view })}
              options={[
                { value: "board", label: t("views.board"), icon: LayoutGrid },
                { value: "repo", label: t("views.repo"), icon: Workflow },
              ]}
            />
            {ui.view === "repo" && (
              <>
                <div className="w-[280px]">
                  <RepoPicker
                    value={ui.repo}
                    onChange={(repo) => ui.set({ repo, workflow: null })}
                    placeholder={t("pickRepo")}
                  />
                </div>
                {ui.repo && (
                  <IconButton
                    icon={ExternalLink}
                    label={t("openOnGitHub")}
                    onClick={() => void openUrl(`https://github.com/${ui.repo}/actions`)}
                  />
                )}
              </>
            )}
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {ui.view === "board" ? (
          <Board />
        ) : ui.repo ? (
          <RepoView key={ui.repo} repo={ui.repo} />
        ) : (
          <EmptyState icon={<Workflow size={20} />} title={t("start")} body={t("startBody")} />
        )}
      </div>
      {bulk && <BulkWorkflowDialog onClose={() => setBulk(false)} />}
    </div>
  );
}
