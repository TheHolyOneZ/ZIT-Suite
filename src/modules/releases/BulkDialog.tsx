import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Rocket } from "lucide-react";
import { commands, unwrap, type RepoReleases } from "@/core/ipc";
import { errorMessage } from "@/core/errors";
import { cn } from "@/core/cn";
import { toast } from "@/core/store/toasts";
import { Button, Checkbox, Dialog, Input, Mark, Segmented } from "@/ui";
import { writeNotes } from "@/modules/home/ghapi";
import { reloadBoard } from "./api";
import { nextTag, suggestBump, type Bump } from "./model";

interface Plan {
  repo: string;
  branch: string;
  previous: string | null;
  tags: string[];
  commits: number | null;
  bump: Bump;
  tag: string;
  state: "idle" | "running" | "done" | "failed";
  error?: string;
  url?: string;
}


export function BulkDialog({
  rows,
  onClose,
  onDone,
}: {
  rows: RepoReleases[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(["releases", "home", "common"]);
  const [plans, setPlans] = useState<Plan[]>(() =>
    rows.map((r) => ({
      repo: r.repo,
      branch: r.branch,
      previous: r.since_tag,
      tags: r.tags,
      commits: r.since,
      bump: "patch",
      tag: nextTag(r.tags, "patch"),
      state: "idle",
    })),
  );
  const [notes, setNotes] = useState(true);
  const [draft, setDraft] = useState(false);
  const [running, setRunning] = useState(false);
  const finished =
    plans.every((p) => p.state === "done" || p.state === "failed") && plans.some((p) => p.state !== "idle");
  const patch = (repo: string, p: Partial<Plan>) =>
    setPlans((cur) => cur.map((x) => (x.repo === repo ? { ...x, ...p } : x)));


  useEffect(() => {
    for (const r of rows) {
      if (!r.since_tag || !r.since) continue;
      void unwrap(commands.releasesUnreleased(r.repo, r.since_tag, r.branch)).then(
        (u) => {
          const bump = suggestBump(u.commits.map((c) => c.message));
          setPlans((cur) =>
            cur.map((x) =>
              x.repo === r.repo && x.state === "idle" ? { ...x, bump, tag: nextTag(x.tags, bump) } : x,
            ),
          );
        },
        () => undefined,
      );
    }
  }, [rows]);

  const run = async () => {
    setRunning(true);
    for (const p of plans) {
      if (p.state === "done") continue;
      patch(p.repo, { state: "running", error: undefined });
      try {
        let body = "";
        let name = p.tag;
        if (notes) {
          const n = await writeNotes(p.repo, p.tag, p.branch, p.previous, {
            features: t("home:releases.notesGroups.features"),
            fixes: t("home:releases.notesGroups.fixes"),
            other: t("home:releases.notesGroups.other"),
          });
          body = n.body;
          name = n.name || p.tag;
        }
        const r = await unwrap(
          commands.releaseCreate(p.repo, {
            tag_name: p.tag,
            target: p.branch,
            name,
            body,
            draft,
            prerelease: false,
            make_latest: true,
          }),
        );
        patch(p.repo, { state: "done", url: r.html_url });
      } catch (e) {
        patch(p.repo, { state: "failed", error: errorMessage(e) });
      }
    }
    setRunning(false);
    reloadBoard();
    toast({ kind: "success", title: t("bulk.finished") });
    onDone();
  };

  const tagsOk = plans.every((p) => p.tag.trim() && !p.tags.includes(p.tag.trim()));
  return (
    <Dialog
      open
      onClose={running ? () => undefined : onClose}
      width={760}
      kicker={t("title")}
      title={t("bulk.title", { count: plans.length })}
      footer={
        <>
          <span className="mr-auto text-[11.5px] text-faint">
            {draft ? t("bulk.draftNote") : t("bulk.publishNote")}
          </span>
          <Button variant="ghost" disabled={running} onClick={onClose}>
            {finished ? t("common:actions.close") : t("common:actions.cancel")}
          </Button>
          {!finished && (
            <Button
              variant="primary"
              icon={Rocket}
              loading={running}
              disabled={!tagsOk}
              onClick={() => void run()}
            >
              {draft ? t("bulk.runDraft", { count: plans.length }) : t("bulk.run", { count: plans.length })}
            </Button>
          )}
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-4">
        <Checkbox
          checked={notes}
          onChange={setNotes}
          label={<span className="text-[12.5px]">{t("bulk.notes")}</span>}
        />
        <Checkbox
          checked={draft}
          onChange={setDraft}
          label={<span className="text-[12.5px]">{t("bulk.draft")}</span>}
        />
      </div>
      <div className="overflow-hidden rounded-[var(--radius)] border border-line">
        {plans.map((p) => (
          <div
            key={p.repo}
            className="grid grid-cols-[18px_minmax(0,1fr)_200px_130px] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0"
          >
            <Mark
              glyph={
                p.state === "done"
                  ? "tick"
                  : p.state === "failed"
                    ? "cross"
                    : p.state === "running"
                      ? "running"
                      : "pending"
              }
              tone={
                p.state === "done"
                  ? "ok"
                  : p.state === "failed"
                    ? "danger"
                    : p.state === "running"
                      ? "accent"
                      : "idle"
              }
            />
            <span className="min-w-0">
              <span className="num block truncate text-[12.5px]">{p.repo}</span>
              <span className={cn("block truncate text-[11px]", p.error ? "text-danger" : "text-faint")}>
                {p.error ??
                  (p.previous ? t("bulk.from", { tag: p.previous, count: p.commits ?? 0 }) : t("bulk.first"))}
              </span>
            </span>
            <Segmented<Bump>
              size="sm"
              value={p.bump}
              onChange={(bump) => p.state === "idle" && patch(p.repo, { bump, tag: nextTag(p.tags, bump) })}
              options={(["patch", "minor", "major"] as Bump[]).map((b) => ({
                value: b,
                label: t(`bump.${b}`),
              }))}
            />
            {p.state === "done" && p.url ? (
              <button
                className="num cursor-default text-left text-[12px] text-accent hover:underline"
                onClick={() => void openUrl(p.url!)}
              >
                {p.tag}
              </button>
            ) : (
              <Input
                value={p.tag}
                disabled={p.state !== "idle"}
                onChange={(e) => patch(p.repo, { tag: e.target.value.replace(/\s+/g, "-") })}
                className={cn("num !h-7 text-[12px]", p.tags.includes(p.tag.trim()) && "!border-warn")}
              />
            )}
          </div>
        ))}
      </div>
      {!tagsOk && <p className="mt-2 text-[11.5px] text-warn">{t("bulk.tagTaken")}</p>}
    </Dialog>
  );
}
