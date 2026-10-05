import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, type InfiniteData } from "@tanstack/react-query";
import { CirclePlus, FileText, Milestone as MilestoneIcon, Tag, UserPlus } from "lucide-react";
import { commands, unwrap, type IssueSearch, type Milestone } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { queryClient } from "@/core/query";
import { toast } from "@/core/store/toasts";
import { cn } from "@/core/cn";
import { Button, Dialog, Input, Label, MarkdownEditor } from "@/ui";
import { RepoPicker } from "@/app/RepoPicker";
import { putIssue, useLabels } from "./api";
import { parseTemplate, type IssueTemplate } from "./templates";
import { openIssue } from "./IssueSheet";
import { LabelChip } from "./LabelChip";
import { AssigneePicker, LabelPicker, MilestonePicker } from "./Pickers";
import { useIssuesPrefs, useIssuesUi } from "./store";

export function CreateIssueDialog() {
  const { t } = useTranslation(["issues", "common"]);
  const open = useIssuesUi((s) => s.createOpen);
  const scope = useIssuesUi((s) => s.filter.scope);
  const set = useIssuesUi((s) => s.set);
  const [repo, setRepo] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [labels, setLabels] = useState<{ name: string; color: string }[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState<string | null>(null);
  const repoLabels = useLabels(repo).data;

  const templates = useQuery({
    queryKey: ["issues", "templates", repo],
    enabled: !!repo && open,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const dir = await unwrap(commands.filesDir(repo!, ".github/ISSUE_TEMPLATE", null));
      const out: IssueTemplate[] = [];
      for (const f of dir.filter((e) => e.kind === "file")) {
        const text = await unwrap(commands.filesReadText(repo!, f.path, null));
        const tpl = text != null ? parseTemplate(f.name, text) : null;
        if (tpl) out.push(tpl);
      }
      return out;
    },
  });
  const applyTemplate = (tpl: IssueTemplate | null) => {
    setTemplate(tpl?.file ?? null);
    setTitle(tpl?.title ?? "");
    setBody(tpl?.body ?? "");
    setAssignees(tpl?.assignees ?? []);
    setLabels(
      (tpl?.labels ?? []).map((name) => ({
        name,
        color: repoLabels?.find((l) => l.name === name)?.color ?? "cccccc",
      })),
    );
  };

  useEffect(() => {
    if (!open) return;
    setRepo(scope.kind === "repo" && scope.repo ? scope.repo : useIssuesPrefs.getState().managerRepo);
    setTitle("");
    setBody("");
    setLabels([]);
    setAssignees([]);
    setMilestone(null);
    setTemplate(null);
  }, [open, scope]);


  const pickRepo = (r: string) => {
    setRepo(r);
    setLabels([]);
    setAssignees([]);
    setMilestone(null);
    setTemplate(null);
  };

  const submit = async () => {
    if (!repo || !title.trim()) return;
    setBusy(true);
    try {
      const issue = await unwrap(
        commands.issuesCreate(repo, {
          title: title.trim(),
          body: body || null,
          labels: labels.map((l) => l.name),
          assignees,
          milestone: milestone?.number ?? null,
        }),
      );
      putIssue(issue);

      queryClient.setQueriesData<InfiniteData<IssueSearch>>({ queryKey: ["issues", "search"] }, (d) =>
        d && d.pages.length
          ? {
              ...d,
              pages: [
                {
                  ...d.pages[0],
                  total_count: d.pages[0].total_count + 1,
                  items: [issue, ...d.pages[0].items],
                },
                ...d.pages.slice(1),
              ],
            }
          : d,
      );
      set({ createOpen: false, tab: "issues", cursor: 0 });
      openIssue(issue);
      toast({ kind: "success", title: t("create.created", { number: issue.number }) });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => set({ createOpen: false })}
      kicker={t("create.kicker")}
      title={t("create.title")}
      width={720}
      footer={
        <>
          <span className="mr-auto text-[11.5px] text-faint">{t("create.hint")}</span>
          <Button variant="ghost" onClick={() => set({ createOpen: false })}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={CirclePlus}
            loading={busy}
            disabled={!repo || !title.trim()}
            onClick={submit}
          >
            {t("create.submit")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>{t("create.repo")}</Label>
          <RepoPicker value={repo} onChange={pickRepo} writable />
        </div>
        {repo && (templates.data?.length ?? 0) > 0 && (
          <div>
            <Label>{t("create.template")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {[null, ...templates.data!].map((tpl) => (
                <button
                  key={tpl?.file ?? "blank"}
                  onClick={() => applyTemplate(tpl)}
                  title={tpl?.about || undefined}
                  className={cn(
                    "inline-flex h-7 cursor-default items-center gap-1.5 rounded-[3px] border px-2 text-[12px]",
                    template === (tpl?.file ?? null)
                      ? "border-accent bg-surface-2 text-text"
                      : "border-line text-dim hover:text-text",
                  )}
                >
                  <FileText size={12} />
                  {tpl?.name ?? t("create.blank")}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <Label>{t("create.issueTitle")}</Label>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && submit()}
          />
        </div>
        <div>
          <Label>{t("create.body")}</Label>
          <MarkdownEditor value={body} onChange={setBody} minRows={8} onSubmit={submit} />
        </div>
        {repo && (
          <div className="flex flex-wrap items-center gap-2">
            <LabelPicker
              repo={repo}
              value={labels.map((l) => l.name)}
              onToggle={(l, on) => setLabels(on ? [...labels, l] : labels.filter((x) => x.name !== l.name))}
              trigger={(p) => (
                <Button {...p} size="sm" icon={Tag}>
                  {t("detail.labels")}
                </Button>
              )}
            />
            <AssigneePicker
              repo={repo}
              value={assignees}
              onToggle={(u, on) =>
                setAssignees(on ? [...assignees, u.login] : assignees.filter((x) => x !== u.login))
              }
              trigger={(p) => (
                <Button {...p} size="sm" icon={UserPlus}>
                  {t("detail.assignees")}
                  {assignees.length > 0 && <span className="num text-faint">{assignees.length}</span>}
                </Button>
              )}
            />
            <MilestonePicker
              repo={repo}
              value={milestone?.number ?? null}
              onPick={setMilestone}
              trigger={(p) => (
                <Button {...p} size="sm" icon={MilestoneIcon}>
                  {milestone?.title ?? t("detail.milestone")}
                </Button>
              )}
            />
            <div className="flex flex-wrap gap-1">
              {labels.map((l) => (
                <LabelChip key={l.name} label={l} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
