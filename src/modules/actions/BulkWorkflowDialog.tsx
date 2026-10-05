import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { parse } from "yaml";
import { FilePlus2 } from "lucide-react";
import { commands, unwrap } from "@/core/ipc";
import { errorMessage } from "@/core/errors";
import { cn } from "@/core/cn";
import { useRepoList } from "@/core/data/repos";
import { toast } from "@/core/store/toasts";
import { RepoChecklist } from "@/app/RepoChecklist";
import { Button, Dialog, Input, Label, Mark, Segmented, Select } from "@/ui";
import { CodeBox } from "@/modules/gists/CodeBox";
import { checkWorkflow } from "@/modules/home/ghmodel";
import { WORKFLOW_TEMPLATES } from "@/modules/home/workflowTemplates";

type Mode = "commit" | "pr";
type State = { s: "running" | "done" | "skipped" | "failed"; note?: string; url?: string };


export function BulkWorkflowDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["actions", "home", "common"]);
  const { data = [] } = useRepoList();
  const writable = useMemo(
    () =>
      data
        .filter((r) => !r.archived && r.permissions?.push && r.default_branch)
        .map((r) => r.full_name)
        .sort(),
    [data],
  );
  const [tpl, setTpl] = useState("ci-node");
  const [file, setFile] = useState("ci.yml");
  const [content, setContent] = useState(WORKFLOW_TEMPLATES.find((w) => w.id === "ci-node")!.content);
  const [repos, setRepos] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("pr");
  const [status, setStatus] = useState<Record<string, State>>({});
  const [running, setRunning] = useState(false);
  const check = useMemo(() => checkWorkflow(content, parse), [content]);
  const nameOk = /^[A-Za-z0-9][A-Za-z0-9._-]*\.ya?ml$/.test(file.trim());
  const picked = [...repos].filter((r) => writable.includes(r));
  const done = picked.length > 0 && picked.every((r) => status[r] && status[r].s !== "running");
  const path = `.github/workflows/${file.trim()}`;

  const pick = (id: string) => {
    const w = WORKFLOW_TEMPLATES.find((x) => x.id === id)!;
    setTpl(id);
    setFile(w.file);
    setContent(w.content);
  };

  const run = async () => {
    setRunning(true);
    let ok = 0;
    for (const repo of picked) {
      if (status[repo]?.s === "done") continue;
      setStatus((c) => ({ ...c, [repo]: { s: "running" } }));
      try {
        const base = data.find((r) => r.full_name === repo)!.default_branch!;
        const tree = await unwrap(commands.filesTree(repo, base, true));
        if (tree.items.some((i) => i.path === path)) {
          setStatus((c) => ({ ...c, [repo]: { s: "skipped", note: t("bulkWf.exists") } }));
          continue;
        }
        const message = t("wf.msgAdd", { name: file.trim() });
        const change = { kind: "text" as const, path, text: content, executable: null };
        if (mode === "commit") {
          await unwrap(commands.filesCommit(repo, base, tree.commit, false, message, [change]));
          setStatus((c) => ({ ...c, [repo]: { s: "done" } }));
        } else {
          const branch = `zit/add-${file.trim().replace(/\.ya?ml$/, "")}`;
          await unwrap(commands.filesCommit(repo, branch, tree.commit, true, message, [change]));
          const pr = await unwrap(
            commands.pullsCreate(repo, {
              title: message,
              head: branch,
              base,
              body: t("bulkWf.prBody"),
              draft: false,
            }),
          );
          setStatus((c) => ({ ...c, [repo]: { s: "done", url: pr.html_url, note: `#${pr.number}` } }));
        }
        ok++;
      } catch (e) {
        setStatus((c) => ({ ...c, [repo]: { s: "failed", note: errorMessage(e) } }));
      }
    }
    setRunning(false);
    if (ok) toast({ kind: "success", title: t("bulkWf.finished", { count: ok }) });
  };

  const glyph = (s?: State["s"]) =>
    s === "done"
      ? "tick"
      : s === "failed"
        ? "cross"
        : s === "skipped"
          ? "skip"
          : s === "running"
            ? "running"
            : "pending";
  const tone = (s?: State["s"]) =>
    s === "done" ? "ok" : s === "failed" ? "danger" : s === "running" ? "accent" : "idle";

  return (
    <Dialog
      open
      onClose={running ? () => undefined : onClose}
      width={1000}
      kicker={t("title")}
      title={t("bulkWf.title")}
      footer={
        <>
          <span className={cn("mr-auto text-[11.5px]", check.problem ? "text-warn" : "text-faint")}>
            {check.problem
              ? t(`home:wf.problem.${check.problem.kind}`, { job: check.problem.detail ?? "" })
              : t("home:wf.valid", { count: check.jobs })}
          </span>
          <Button variant="ghost" disabled={running} onClick={onClose}>
            {done ? t("common:actions.close") : t("common:actions.cancel")}
          </Button>
          {!done && (
            <Button
              variant="primary"
              icon={FilePlus2}
              loading={running}
              disabled={!picked.length || !nameOk || !content.trim()}
              onClick={() => void run()}
            >
              {mode === "pr"
                ? t("bulkWf.runPr", { count: picked.length })
                : t("bulkWf.runCommit", { count: picked.length })}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("bulkWf.template")}</Label>
              <Select value={tpl} onChange={(e) => pick(e.target.value)}>
                {WORKFLOW_TEMPLATES.map((w) => (
                  <option key={w.id} value={w.id}>
                    {t(`home:templates.${w.id}.name`)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t("bulkWf.file")}</Label>
              <Input
                value={file}
                onChange={(e) => setFile(e.target.value.replace(/\s+/g, "-"))}
                className="num"
              />
            </div>
          </div>
          <CodeBox value={content} onChange={setContent} minRows={14} className="max-h-[320px]" />
          <div>
            <Label>{t("bulkWf.how")}</Label>
            <Segmented<Mode>
              value={mode}
              onChange={setMode}
              options={[
                { value: "pr", label: t("bulkWf.modePr") },
                { value: "commit", label: t("bulkWf.modeCommit") },
              ]}
            />
            <p className="mt-1 text-[11.5px] text-faint">
              {mode === "pr" ? t("bulkWf.prNote") : t("bulkWf.commitNote")}
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {Object.keys(status).length === 0 ? (
            <RepoChecklist
              repos={writable}
              value={repos}
              onChange={setRepos}
              title={t("bulkWf.repos", { count: picked.length })}
              height={420}
            />
          ) : (
            <div className="max-h-[480px] overflow-y-auto rounded-[var(--radius)] border border-line">
              {picked.map((r) => (
                <div
                  key={r}
                  className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[12px] last:border-b-0"
                >
                  <Mark glyph={glyph(status[r]?.s)} tone={tone(status[r]?.s)} size={10} />
                  <span className="num min-w-0 flex-1 truncate">{r}</span>
                  {status[r]?.note && (
                    <span
                      className={cn(
                        "max-w-[140px] truncate text-[11px]",
                        status[r].s === "failed" ? "text-danger" : "text-faint",
                      )}
                      title={status[r].note}
                    >
                      {status[r].note}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
