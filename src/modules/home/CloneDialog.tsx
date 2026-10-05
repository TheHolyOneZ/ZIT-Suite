import { useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderDown, FolderOpen } from "lucide-react";
import { commands, unwrap } from "@/core/ipc";
import { errorMessage } from "@/core/errors";
import { toast } from "@/core/store/toasts";
import { RepoPicker } from "@/app/RepoPicker";
import { Button, Dialog, Input, Label, Mark } from "@/ui";
import { refreshWorkspaces } from "./api";
import { useHomeUi } from "./store";

type State = "waiting" | "cloning" | "done" | "failed";


export function CloneHost() {
  const clone = useHomeUi((s) => s.clone);
  const set = useHomeUi((s) => s.set);
  return clone ? <CloneDialog repos={clone} onClose={() => set({ clone: null })} /> : null;
}


export function CloneDialog({ repos: initial, onClose }: { repos: string[]; onClose: () => void }) {
  const { t } = useTranslation(["home", "common"]);
  const [repos, setRepos] = useState<string[]>(initial);
  const [parent, setParent] = useState("");
  const [status, setStatus] = useState<Record<string, { s: State; error?: string }>>({});
  const [running, setRunning] = useState(false);
  const single = initial.length === 0;
  const finished =
    repos.length > 0 && repos.every((r) => status[r]?.s === "done" || status[r]?.s === "failed");

  const pickParent = async () => {
    const p = await open({ directory: true, multiple: false });
    if (typeof p === "string") setParent(p);
  };
  const run = async () => {
    setRunning(true);
    let ok = 0;
    for (const repo of repos) {
      if (status[repo]?.s === "done") continue;
      setStatus((cur) => ({ ...cur, [repo]: { s: "cloning" } }));
      try {
        await unwrap(commands.wsClone(repo, parent, repo.split("/")[1]));
        ok++;
        setStatus((cur) => ({ ...cur, [repo]: { s: "done" } }));
      } catch (e) {
        setStatus((cur) => ({ ...cur, [repo]: { s: "failed", error: errorMessage(e) } }));
      }
    }
    setRunning(false);
    refreshWorkspaces();
    if (ok) toast({ kind: "success", title: t("clone.done", { count: ok }), body: t("clone.doneBody") });
  };
  const glyph = (s?: State) =>
    s === "done" ? "tick" : s === "failed" ? "cross" : s === "cloning" ? "running" : "pending";
  const tone = (s?: State) =>
    s === "done" ? "ok" : s === "failed" ? "danger" : s === "cloning" ? "accent" : "idle";

  return (
    <Dialog
      open
      onClose={running ? () => undefined : onClose}
      width={600}
      kicker={t("title")}
      title={t("clone.title", { count: Math.max(1, repos.length) })}
      footer={
        <>
          <Button variant="ghost" disabled={running} onClick={onClose}>
            {finished ? t("common:actions.close") : t("common:actions.cancel")}
          </Button>
          {!finished && (
            <Button
              variant="primary"
              icon={FolderDown}
              loading={running}
              disabled={!parent || !repos.length}
              onClick={() => void run()}
            >
              {t("clone.run", { count: repos.length })}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {single && (
          <div>
            <Label>{t("clone.repo")}</Label>
            <RepoPicker
              value={repos[0] ?? null}
              onChange={(r) => setRepos([r])}
              placeholder={t("clone.pick")}
            />
          </div>
        )}
        <div>
          <Label hint={t("clone.whereHint")}>{t("clone.where")}</Label>
          <div className="flex gap-2">
            <Input
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              placeholder="~/Projects"
              className="num"
            />
            <Button icon={FolderOpen} onClick={() => void pickParent()}>
              {t("clone.browse")}
            </Button>
          </div>
        </div>
        {repos.length > 0 && (
          <div className="max-h-[260px] overflow-y-auto rounded-[var(--radius)] border border-line">
            {repos.map((r) => (
              <div
                key={r}
                className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[12.5px] last:border-b-0"
              >
                <Mark glyph={glyph(status[r]?.s)} tone={tone(status[r]?.s)} size={11} />
                <span className="min-w-0 flex-1">
                  <span className="num block truncate">{r}</span>
                  {parent && (
                    <span className="num block truncate text-[11px] text-faint">{`${parent.replace(/[\\/]+$/, "")}${parent.includes("\\") ? "\\" : "/"}${r.split("/")[1]}`}</span>
                  )}
                </span>
                {status[r]?.error && (
                  <span className="truncate text-[11px] text-danger">{status[r].error}</span>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-[11.5px] text-faint">{t("clone.note")}</p>
      </div>
    </Dialog>
  );
}
