import { useTranslation } from "react-i18next";
import { FolderDown, FolderPlus, House } from "lucide-react";
import { useSheetRole } from "@/core/sheets/role";
import { Button, PageHeader, Plotter } from "@/ui";
import { useWorkspaces } from "./api";
import { useHomeUi } from "./store";
import { WorkspaceCard } from "./WorkspaceCard";

export function HomePage() {
  const { t } = useTranslation(["home", "common"]);
  const { data, isLoading } = useWorkspaces();
  const setUi = useHomeUi((s) => s.set);
  const peek = useSheetRole() === "peek";
  const add = () => setUi({ add: "" });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={<span>{t("subtitle")}</span>}
        actions={
          <>
            <Button icon={FolderDown} onClick={() => setUi({ clone: [] })}>
              {t("clone.open")}
            </Button>
            <Button variant="primary" icon={FolderPlus} onClick={add}>
              {t("add")}
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <Plotter />
        ) : !data?.length ? (
          <div className="mx-auto mt-10 max-w-[620px] text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-[var(--radius)] border border-dashed border-line-strong text-accent">
              <House size={24} />
            </div>
            <h2 className="mt-4 text-[20px] font-semibold">{t("empty.title")}</h2>
            <p className="mt-2 text-[13px] text-dim">{t("empty.body")}</p>
            <ol className="mt-6 grid grid-cols-3 gap-3 text-left">
              {(["step1", "step2", "step3"] as const).map((s, i) => (
                <li key={s} className="rounded-[var(--radius)] border border-line bg-surface p-3">
                  <div className="num text-[22px] font-semibold text-accent">{i + 1}</div>
                  <div className="mt-1 text-[12.5px]">{t(`empty.${s}`)}</div>
                </li>
              ))}
            </ol>
            <Button variant="primary" icon={FolderPlus} className="mt-6" onClick={add}>
              {t("add")}
            </Button>
          </div>
        ) : (
          <div
            className={
              peek ? "grid grid-cols-1 gap-3" : "grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4"
            }
          >
            {data.map((ws) => (
              <WorkspaceCard key={ws.id} ws={ws} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
