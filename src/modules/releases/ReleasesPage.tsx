import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, LayoutGrid, Rocket } from "lucide-react";
import { useIntent } from "@/core/sheets/store";
import { RepoPicker } from "@/app/RepoPicker";
import { EmptyState, IconButton, PageHeader, Segmented } from "@/ui";
import { Board } from "./Board";
import { RepoView } from "./RepoView";
import { useReleasesUi, type ReleasesView } from "./store";

export function ReleasesPage() {
  const { t } = useTranslation(["releases", "common"]);
  const ui = useReleasesUi();
  useIntent("releases", (i) => ui.set({ view: "repo", repo: String(i.repo) }));
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={<span>{t("subtitle")}</span>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<ReleasesView>
              value={ui.view}
              onChange={(view) => ui.set({ view })}
              options={[
                { value: "board", label: t("views.board"), icon: LayoutGrid },
                { value: "repo", label: t("views.repo"), icon: Rocket },
              ]}
            />
            {ui.view === "repo" && (
              <>
                <div className="w-[280px]">
                  <RepoPicker
                    value={ui.repo}
                    onChange={(repo) => ui.set({ repo, create: null })}
                    writable
                    placeholder={t("pickRepo")}
                  />
                </div>
                {ui.repo && (
                  <IconButton
                    icon={ExternalLink}
                    label={t("openOnGitHub")}
                    onClick={() => void openUrl(`https://github.com/${ui.repo}/releases`)}
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
          <EmptyState icon={<Rocket size={20} />} title={t("start")} body={t("startBody")} />
        )}
      </div>
    </div>
  );
}
