import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Check, ChevronDown, GitBranch, GitPullRequest, Plus } from "lucide-react";
import { commands, unwrap, type Workspace } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { toast } from "@/core/store/toasts";
import { Button, IconButton, Input, Plotter, Popover } from "@/ui";
import { useRepoList } from "@/core/data/repos";
import { useSheets } from "@/core/sheets/store";
import { usePullsUi } from "@/modules/pulls/store";
import { refreshAll, useBranches, useStatus } from "./api";
import { GitTerm } from "./parts";


export function BranchMenu({ ws, current }: { ws: Workspace; current: string | null }) {
  const { t } = useTranslation("home");
  const [open, setOpen] = useState(false);
  const branches = useBranches(ws.id, open);

  const unsaved = useStatus(ws.id).data?.changes.length ?? 0;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const defaultBranch = useRepoList().data?.find((r) => r.full_name === ws.push_repo)?.default_branch;

  const switchTo = async (b: string, close: () => void) => {
    setBusy(true);
    try {
      await unwrap(commands.wsBranchSwitch(ws.id, b));
      toast({
        kind: "success",
        title: t("branch.switched", { name: b }),
        body: unsaved ? t("branch.carried", { count: unsaved }) : undefined,
      });
      refreshAll(ws.id);
      close();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const create = async (close: () => void) => {
    const n = name.trim().replace(/\s+/g, "-");
    if (!n) return;
    setBusy(true);
    try {
      await unwrap(commands.wsBranchCreate(ws.id, n, true));
      toast({
        kind: "success",
        title: t("branch.created", { name: n }),
        body: unsaved ? t("branch.carried", { count: unsaved }) : undefined,
      });
      setName("");
      refreshAll(ws.id);
      close();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover
      placement="bottom-start"
      className="w-[320px] p-0"
      open={open}
      onOpenChange={setOpen}
      trigger={(p) => (
        <button
          {...p}
          className="num inline-flex h-[22px] max-w-[220px] cursor-default items-center gap-1 rounded-[3px] border border-line-strong bg-surface-2 px-1.5 text-[11.5px] hover:border-accent"
          title={t("branch.label")}
        >
          <GitBranch size={11} className="shrink-0 text-faint" />
          <span className="truncate">{current ?? t("branch.unborn")}</span>
          <ChevronDown size={11} className="shrink-0 text-faint" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="border-b border-line px-3 py-2">
            <div className="annot flex items-center">
              {t("branch.label")}
              <GitTerm term="branch" />
            </div>
            <p className="mt-1 text-[11.5px] text-faint">{t("branch.hint")}</p>
          </div>
          <div className="max-h-[240px] overflow-y-auto py-1">
            {branches.isLoading ? (
              <Plotter />
            ) : (
              branches.data?.map((b) => (
                <div key={b.name} className="group flex items-center hover:bg-surface-2">
                  <button
                    disabled={busy || b.current}
                    onClick={() => void switchTo(b.name, close)}
                    className="flex min-w-0 flex-1 cursor-default items-center gap-2 py-1.5 pl-3 text-left"
                  >
                    <span className="w-3.5 shrink-0">
                      {b.current && <Check size={13} className="text-accent" />}
                    </span>
                    <span className="num min-w-0 flex-1 truncate text-[12.5px]">{b.name}</span>
                    {b.ahead > 0 && (
                      <span className="flex items-center text-[10.5px] text-accent">
                        <ArrowUp size={10} />
                        {b.ahead}
                      </span>
                    )}
                    {b.behind > 0 && (
                      <span className="flex items-center text-[10.5px] text-info">
                        <ArrowDown size={10} />
                        {b.behind}
                      </span>
                    )}
                  </button>
                  {ws.push_repo && b.upstream && b.name !== defaultBranch ? (
                    <IconButton
                      icon={GitPullRequest}
                      size={12}
                      label={t("branch.pullRequest", { base: defaultBranch ?? "main" })}
                      className="mr-1.5 size-6 opacity-0 group-hover:opacity-100"
                      onClick={() => {
                        close();
                        usePullsUi.setState({
                          createOpen: true,
                          createPrefill: { repo: ws.push_repo!, head: b.name },
                        });
                        useSheets.getState().open("pulls");
                      }}
                    />
                  ) : (
                    <span className="w-3" />
                  )}
                </div>
              ))
            )}
          </div>
          <form
            className="flex items-center gap-2 border-t border-line p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void create(close);
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("branch.namePlaceholder")}
              className="num h-7 text-[12px]"
            />
            <Button type="submit" size="sm" icon={Plus} loading={busy} disabled={!name.trim()}>
              {t("branch.create")}
            </Button>
          </form>
        </div>
      )}
    </Popover>
  );
}
