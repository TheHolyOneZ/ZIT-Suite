import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, GitBranch, Layers } from "lucide-react";
import { useIntent } from "@/core/sheets/store";
import { RepoPicker } from "@/app/RepoPicker";
import { EmptyState, IconButton, PageHeader, Segmented } from "@/ui";
import { ManyRepos } from "./ManyRepos";
import { RepoBranches } from "./RepoBranches";
import { useBranchesUi, type BranchesView } from "./store";

export function BranchesPage() {
  const { t } = useTranslation(["branches", "common"]);
  const ui = useBranchesUi();
  useIntent("branches", (i) => ui.set({ view: "repo", repo: String(i.repo), filter: "all", q: "" }));
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={<span>{t("subtitle")}</span>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<BranchesView>
              value={ui.view}
              onChange={(view) => ui.set({ view })}
              options={[
                { value: "repo", label: t("views.repo"), icon: GitBranch },
                { value: "many", label: t("views.many"), icon: Layers },
              ]}
            />
            {ui.view === "repo" && (
              <>
                <div className="w-[280px]">
                  <RepoPicker
                    value={ui.repo}
                    onChange={(repo) => ui.set({ repo, filter: "all", q: "" })}
                    placeholder={t("pickRepo")}
                  />
                </div>
                {ui.repo && (
                  <IconButton
                    icon={ExternalLink}
                    label={t("openOnGitHub")}
                    onClick={() => void openUrl(`https://github.com/${ui.repo}/branches`)}
                  />
                )}
              </>
            )}
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {ui.view === "many" ? (
          <ManyRepos />
        ) : ui.repo ? (
          <RepoBranches key={ui.repo} repo={ui.repo} />
        ) : (
          <EmptyState icon={<GitBranch size={20} />} title={t("start")} body={t("startBody")} />
        )}
      </div>
    </div>
  );
}
