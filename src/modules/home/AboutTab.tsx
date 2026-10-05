import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Eye, GitFork, Globe, Plus, Star, X } from "lucide-react";
import { commands, unwrap, type About, type Workspace } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { toast } from "@/core/store/toasts";
import { Button, Checkbox, EmptyState, Input, Label, Panel, Plotter } from "@/ui";
import { queryClient } from "@/core/query";
import { useTree } from "./api";
import { ghKey, useAbout } from "./ghapi";
import { MAX_TOPICS, normalizeTopic, parseTopics, suggestTopics } from "./ghmodel";

type Form = {
  description: string;
  homepage: string;
  topicsText: string;
  has_issues: boolean;
  has_wiki: boolean;
  has_projects: boolean;
  has_discussions: boolean;
};
const formOf = (a: About): Form => ({
  description: a.description,
  homepage: a.homepage,
  topicsText: a.topics.join(", "),
  has_issues: a.has_issues,
  has_wiki: a.has_wiki,
  has_projects: a.has_projects,
  has_discussions: a.has_discussions,
});


export function AboutTab({ ws, repo }: { ws: Workspace; repo: string }) {
  const { t } = useTranslation(["home", "common"]);
  const { data, isLoading, error } = useAbout(repo);
  const top = useTree(ws.id, "").data ?? [];
  const [f, setF] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setF(formOf(data));
  }, [data]);
  const topics = useMemo(() => (f ? parseTopics(f.topicsText) : []), [f]);
  if (isLoading || (!f && !error)) return <Plotter />;
  if (error || !data || !f) return <EmptyState title={errorMessage(error)} />;

  const set = (p: Partial<Form>) => setF({ ...f, ...p });
  const original = formOf(data);
  const dirty =
    f.description !== original.description ||
    f.homepage !== original.homepage ||
    topics.join(",") !== data.topics.join(",") ||
    (["has_issues", "has_wiki", "has_projects", "has_discussions"] as const).some(
      (k) => f[k] !== original[k],
    );

  const renamed = f.topicsText
    .split(/[,\n;]/)
    .map((x) => x.trim())
    .filter((x) => x && normalizeTopic(x) !== x)
    .map((x) => [x, normalizeTopic(x)] as const)
    .filter(([, n]) => n);
  const ideas = suggestTopics(
    top.map((e) => e.name),
    topics,
  );
  const removeTopic = (x: string) => set({ topicsText: topics.filter((y) => y !== x).join(", ") });
  const addTopic = (x: string) => set({ topicsText: [...topics, x].join(", ") });
  const tooMany = topics.length > MAX_TOPICS;

  const save = async () => {
    setBusy(true);
    try {
      const fresh = await unwrap(
        commands.aboutSave(repo, {
          description: f.description,
          homepage: f.homepage,
          topics,
          has_issues: f.has_issues,
          has_wiki: f.has_wiki,
          has_projects: f.has_projects,
          has_discussions: f.has_discussions,
        }),
      );
      queryClient.setQueryData(ghKey.about(repo), fresh);
      setF(formOf(fresh));
      toast({ kind: "success", title: t("about.saved") });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-[1000px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <div>
          <Label hint={<span className="num">{f.description.length}/350</span>}>
            {t("about.description")}
          </Label>
          <textarea
            value={f.description}
            maxLength={350}
            rows={3}
            onChange={(e) => set({ description: e.target.value.replace(/\n/g, " ") })}
            placeholder={t("about.descriptionPlaceholder")}
            className="w-full resize-y rounded-[var(--radius)] border border-line-strong bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent"
          />
        </div>
        <div>
          <Label hint={t("about.websiteHint")}>{t("about.website")}</Label>
          <Input
            icon={Globe}
            value={f.homepage}
            onChange={(e) => set({ homepage: e.target.value })}
            placeholder="example.com"
            className="num"
          />
        </div>
        <div>
          <Label
            hint={
              <span className={tooMany ? "num text-danger" : "num"}>
                {t("about.topicCount", { count: topics.length, max: MAX_TOPICS })}
              </span>
            }
          >
            {t("about.topics")}
          </Label>
          <textarea
            value={f.topicsText}
            rows={3}
            onChange={(e) => set({ topicsText: e.target.value })}
            placeholder={t("about.topicsPlaceholder")}
            spellCheck={false}
            className="num w-full resize-y rounded-[var(--radius)] border border-line-strong bg-surface px-2.5 py-2 text-[12.5px] outline-none focus:border-accent"
          />
          <p className="mt-1 text-[11.5px] text-faint">{t("about.topicsHint")}</p>
          {topics.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {topics.map((x) => (
                <span
                  key={x}
                  className="num inline-flex h-6 items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--info)_40%,transparent)] bg-[color-mix(in_srgb,var(--info)_10%,transparent)] pr-1 pl-2.5 text-[11.5px] text-info"
                >
                  {x}
                  <button
                    className="flex size-4 cursor-default items-center justify-center rounded-full hover:bg-surface-2"
                    onClick={() => removeTopic(x)}
                    title={t("about.removeTopic")}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {renamed.length > 0 && (
            <p className="mt-1.5 text-[11.5px] text-dim">
              {t("about.renamed")} {renamed.map(([a, b]) => `${a} → ${b}`).join(" · ")}
            </p>
          )}
          {ideas.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11.5px] text-faint">{t("about.ideas")}</span>
              {ideas.map((x) => (
                <button
                  key={x}
                  onClick={() => addTopic(x)}
                  className="num inline-flex h-6 cursor-default items-center gap-1 rounded-full border border-dashed border-line-strong px-2 text-[11.5px] text-dim hover:border-accent hover:text-accent"
                >
                  <Plus size={10} />
                  {x}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <Label>{t("about.features")}</Label>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {(["has_issues", "has_discussions", "has_wiki", "has_projects"] as const).map((k) => (
              <Checkbox
                key={k}
                checked={f[k]}
                onChange={(v) => set({ [k]: v })}
                label={<span className="text-[12.5px]">{t(`about.feature.${k}`)}</span>}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <Button variant="ghost" disabled={!dirty || busy} onClick={() => setF(original)}>
            {t("about.reset")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!dirty || tooMany} onClick={() => void save()}>
            {t("about.save")}
          </Button>
        </div>
      </div>


      <Panel ticks className="h-fit p-4">
        <div className="annot mb-2">{t("about.preview")}</div>
        <div className="text-[14px] font-semibold">{t("about.aboutTitle")}</div>
        <p className="mt-1.5 text-[13px] text-dim">
          {f.description.trim() || <span className="text-faint italic">{t("about.noDescription")}</span>}
        </p>
        {f.homepage.trim() && (
          <button
            className="mt-2 flex max-w-full cursor-default items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline"
            onClick={() =>
              void openUrl(f.homepage.includes("://") ? f.homepage : `https://${f.homepage.trim()}`)
            }
          >
            <ExternalLink size={12} className="shrink-0" />
            <span className="truncate">{f.homepage.trim().replace(/^https?:\/\//, "")}</span>
          </button>
        )}
        {topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {topics.slice(0, MAX_TOPICS).map((x) => (
              <span
                key={x}
                className="rounded-full bg-[color-mix(in_srgb,var(--info)_14%,transparent)] px-2 py-0.5 text-[11px] text-info"
              >
                {x}
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-col gap-1 text-[12px] text-dim">
          <span className="flex items-center gap-1.5">
            <Star size={12} /> {t("about.stars", { count: data.stars })}
          </span>
          <span className="flex items-center gap-1.5">
            <Eye size={12} /> {t("about.watchers", { count: data.watchers })}
          </span>
          <span className="flex items-center gap-1.5">
            <GitFork size={12} /> {t("about.forks", { count: data.forks })}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={ExternalLink}
          className="mt-3"
          onClick={() => void openUrl(data.html_url)}
        >
          {t("actions.openGitHub")}
        </Button>
      </Panel>
    </div>
  );
}
