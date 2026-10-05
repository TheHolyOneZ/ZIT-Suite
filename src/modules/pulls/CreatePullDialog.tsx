import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, GitPullRequestCreate } from "lucide-react";
import { commands, unwrap, type PullSearch, type PullSummary } from "@/core/ipc";
import type { InfiniteData } from "@tanstack/react-query";
import { useSheets } from "@/core/sheets/store";
import { errorMessage, toastError } from "@/core/errors";
import { queryClient } from "@/core/query";
import { toast } from "@/core/store/toasts";
import { useRepoList } from "@/core/data/repos";
import { Button, Checkbox, Dialog, Input, Label, MarkdownEditor, Mark, Select } from "@/ui";
import { RepoPicker } from "@/app/RepoPicker";
import { useBranches } from "./api";
import { openPull } from "./PullSheet";
import { usePullsUi } from "./store";

export function CreatePullDialog() {
  const { t } = useTranslation(["pulls", "common"]);
  const open = usePullsUi((s) => s.createOpen);
  const scope = usePullsUi((s) => s.filter.scope);
  const set = usePullsUi((s) => s.set);
  const { data: repos = [] } = useRepoList();
  const [repo, setRepo] = useState<string | null>(null);
  const [base, setBase] = useState("");
  const [head, setHead] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const branches = useBranches(repo);

  const [handoff, setHandoff] = useState<{ repo: string; head: string } | null>(null);

  useEffect(() => {
    if (!open) return setHandoff(null);

    const st = useSheets.getState().stacks.pulls;
    const top = st?.[st.length - 1];
    const prefill = usePullsUi.getState().createPrefill;
    if (prefill) {
      usePullsUi.setState({ createPrefill: null });
      setHandoff(prefill);
      setRepo(prefill.repo);
      setTitle("");
      setBody("");
      setDraft(false);
      return;
    }
    setRepo(
      top?.view === "pull" || top?.view === "file"
        ? String(top.params.repo)
        : scope.kind === "repo" && scope.repo
          ? scope.repo
          : null,
    );
    setTitle("");
    setBody("");
    setDraft(false);
  }, [open, scope]);

  useEffect(() => {
    const def = repos.find((r) => r.full_name === repo)?.default_branch ?? "";
    setBase(def);
    setHead(handoff?.repo === repo ? handoff.head : "");
  }, [repo, repos, handoff]);

  const cmp = useQuery({
    queryKey: ["compare", repo, base, head],
    queryFn: () => unwrap(commands.pullsCompare(repo!, base, head)),
    enabled: !!repo && !!base && !!head && base !== head,
    retry: false,
  });

  const submit = async () => {
    if (!repo || !title.trim() || !head || !base) return;
    setBusy(true);
    try {
      const pr = await unwrap(
        commands.pullsCreate(repo, { title: title.trim(), head, base, body: body || null, draft }),
      );

      const summary: PullSummary = {
        repo,
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        state: "OPEN",
        is_draft: pr.draft,
        author: pr.user,
        head_ref: pr.head.ref,
        base_ref: pr.base.ref,
        additions: pr.additions,
        deletions: pr.deletions,
        changed_files: pr.changed_files,
        comments: 0,
        review_decision: null,
        mergeable: "UNKNOWN",
        checks: null,
        labels: pr.labels,
        assignees: pr.assignees,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        merged_at: null,
        closed_at: null,
      };
      queryClient.setQueriesData<InfiniteData<PullSearch>>({ queryKey: ["pulls", "search"] }, (d) =>
        d && d.pages.length
          ? {
              ...d,
              pages: [
                {
                  ...d.pages[0],
                  total_count: d.pages[0].total_count + 1,
                  items: [summary, ...d.pages[0].items],
                },
                ...d.pages.slice(1),
              ],
            }
          : d,
      );
      set({ createOpen: false });
      openPull({ repo, number: pr.number, title: pr.title });
      toast({ kind: "success", title: t("create.created", { number: pr.number }) });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const names = branches.data ?? [];
  const ahead = cmp.data?.ahead_by ?? 0;

  return (
    <Dialog
      open={open}
      onClose={() => set({ createOpen: false })}
      kicker={t("create.kicker")}
      title={t("create.title")}
      width={760}
      footer={
        <>
          <Checkbox checked={draft} onChange={setDraft} label={t("create.draft")} className="mr-auto" />
          <Button variant="ghost" onClick={() => set({ createOpen: false })}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={GitPullRequestCreate}
            loading={busy}
            disabled={!repo || !title.trim() || !head || !base || ahead === 0}
            onClick={submit}
          >
            {draft ? t("create.submitDraft") : t("create.submit")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>{t("create.repo")}</Label>
          <RepoPicker value={repo} onChange={setRepo} writable />
        </div>
        {repo && (
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div>
              <Label>{t("create.base")}</Label>
              <Select value={base} onChange={(e) => setBase(e.target.value)} className="num">
                {names.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            </div>
            <ArrowLeft size={16} className="mb-2 text-faint" />
            <div>
              <Label>{t("create.head")}</Label>
              <Select
                value={head}
                onChange={(e) => (
                  setHead(e.target.value),
                  !title && setTitle(e.target.value.replace(/[-_/]+/g, " "))
                )}
                className="num"
              >
                <option value="">{t("create.pickHead")}</option>
                {names
                  .filter((b) => b !== base)
                  .map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
              </Select>
            </div>
          </div>
        )}
        {cmp.data && (
          <div className="flex items-center gap-2 rounded-[var(--radius)] border border-line bg-surface-2 px-3 py-2 text-[12px]">
            <Mark glyph={ahead > 0 ? "tick" : "equal"} tone={ahead > 0 ? "ok" : "idle"} />
            {ahead > 0
              ? `${t("create.ahead", { count: ahead })} · ${t("create.behind", { count: cmp.data.behind_by })} · ${t("create.files", { count: cmp.data.files })}`
              : t("create.nothing")}
          </div>
        )}
        {cmp.isError && <div className="text-[12px] text-danger">{errorMessage(cmp.error)}</div>}
        <div>
          <Label>{t("create.prTitle")}</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>{t("create.body")}</Label>
          <MarkdownEditor value={body} onChange={setBody} minRows={7} onSubmit={submit} />
        </div>
      </div>
    </Dialog>
  );
}
