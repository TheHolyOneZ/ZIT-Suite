import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChevronDown, ChevronRight, Rocket } from "lucide-react";
import { useRepoList } from "@/core/data/repos";
import { Badge, Button, Panel, RelTime } from "@/ui";
import { useReleases, useTags } from "@/modules/home/ghapi";
import { ReleasesView } from "@/modules/home/ReleasesTab";
import { useBranchList } from "@/modules/files/api";
import { useUnreleased } from "./api";
import { nextTag, suggestBump } from "./model";
import { useReleasesUi } from "./store";


export function RepoView({ repo }: { repo: string }) {
  const ui = useReleasesUi();
  const meta = useRepoList().data?.find((r) => r.full_name === repo);
  const branch = meta?.default_branch ?? "main";
  const branches = useBranchList(repo).data ?? [];
  return (
    <ReleasesView
      repo={repo}
      branches={branches}
      defaultTarget={branch}
      request={ui.create ? { mode: "create", tag: ui.create.tag } : null}
      onRequestDone={() => ui.set({ create: null })}
      header={<Waiting repo={repo} branch={branch} onRelease={(tag) => ui.set({ create: { tag } })} />}
    />
  );
}


function Waiting({
  repo,
  branch,
  onRelease,
}: {
  repo: string;
  branch: string;
  onRelease: (tag: string) => void;
}) {
  const { t } = useTranslation("releases");
  const releases = useReleases(repo).data ?? [];
  const tags = (useTags(repo).data ?? []).map((x) => x.name);
  const latest = releases.find((r) => !r.draft && !r.prerelease) ?? releases.find((r) => !r.draft);
  const base = latest?.tag_name ?? tags[0] ?? null;
  const q = useUnreleased(repo, base, branch);
  const [open, setOpen] = useState(false);
  if (!base || !q.data || q.data.total === 0) return null;
  const bump = suggestBump(q.data.commits.map((c) => c.message));
  const tag = nextTag(tags, bump);
  return (
    <Panel className="overflow-hidden border-[color-mix(in_srgb,var(--accent)_35%,transparent)]">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
        <button
          className="flex min-w-0 flex-1 cursor-default items-center gap-2 text-left"
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <ChevronDown size={14} className="text-faint" />
          ) : (
            <ChevronRight size={14} className="text-faint" />
          )}
          <span className="text-[13px]">
            {t("waiting.title", { count: q.data.total, tag: base, branch })}
          </span>
          <Badge tone="accent">{t(`bump.${bump}`)}</Badge>
        </button>
        <Button size="sm" variant="primary" icon={Rocket} onClick={() => onRelease(tag)}>
          {t("waiting.release", { tag })}
        </Button>
      </div>
      {open && (
        <div className="max-h-[260px] overflow-y-auto border-t border-line">
          {q.data.commits.map((c) => (
            <button
              key={c.sha}
              className="grid w-full cursor-default grid-cols-[64px_minmax(0,1fr)_120px] items-center gap-3 border-b border-line px-3 py-1.5 text-left text-[12px] last:border-b-0 hover:bg-surface-2"
              onClick={() => void openUrl(c.html_url)}
            >
              <span className="num text-[11px] text-faint">{c.sha.slice(0, 7)}</span>
              <span className="truncate">{c.message}</span>
              <span className="truncate text-right text-[11px] text-faint">
                {c.author && `@${c.author} · `}
                {c.date && <RelTime at={c.date} />}
              </span>
            </button>
          ))}
          {q.data.total > q.data.commits.length && (
            <div className="px-3 py-1.5 text-[11px] text-faint">
              {t("waiting.more", { count: q.data.total - q.data.commits.length })}
            </div>
          )}
        </div>
      )}
      <p className="border-t border-line px-3 py-1.5 text-[11px] text-faint">{t("waiting.bumpHint")}</p>
    </Panel>
  );
}
