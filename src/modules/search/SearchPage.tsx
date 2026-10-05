import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  BookMarked,
  BookmarkCheck,
  BookmarkPlus,
  CircleDot,
  Code2,
  GitCommitHorizontal,
  GitPullRequest,
  History,
  Search as SearchIcon,
  Star,
  User,
  X,
} from "lucide-react";
import { commands, unwrap, type Hit, type SearchKind } from "@/core/ipc";
import { errorMessage } from "@/core/errors";
import { cn } from "@/core/cn";
import { formatNumber } from "@/core/i18n/format";
import { sheets } from "@/core/sheets/store";
import { useActiveAccount } from "@/core/store/session";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  IconButton,
  Input,
  PageHeader,
  Plotter,
  RelTime,
  Segmented,
  Select,
  useNow,
} from "@/ui";
import { HINTS, KINDS, SORTS, runs, scoped, toggleHint } from "./model";
import { useSearch } from "./store";

const ICON: Record<SearchKind, typeof SearchIcon> = {
  repos: BookMarked,
  code: Code2,
  issues: CircleDot,
  commits: GitCommitHorizontal,
  users: User,
};


function openHit(h: Hit) {
  if (h.kind === "issues" && h.repo && h.number != null) {
    sheets.push(h.is_pr ? "pulls" : "issues", h.is_pr ? "pull" : "issue", {
      repo: h.repo,
      number: h.number,
      title: h.title,
    });
  } else void openUrl(h.url);
}

export function SearchPage() {
  const { t } = useTranslation(["search", "common"]);
  useNow();
  const s = useSearch();
  const login = useActiveAccount()?.login ?? null;
  const [submitted, setSubmitted] = useState<{ kind: SearchKind; q: string; sort: string } | null>(null);
  const run = (kind = s.kind, q = s.q, sort = s.sort) => {
    const full = scoped(q, kind, s.mine, login);
    if (!full) return;
    s.push({ kind, q: q.trim() });
    setSubmitted({ kind, q: full, sort });
  };
  const res = useInfiniteQuery({
    queryKey: ["search", submitted?.kind, submitted?.q, submitted?.sort],
    queryFn: ({ pageParam }) =>
      unwrap(commands.searchRun(submitted!.kind, submitted!.q, pageParam, submitted!.sort)),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * 30 < Math.min(last.total, 1000) && last.items.length ? pages.length + 1 : undefined,
    enabled: !!submitted,
    staleTime: 60_000,
    retry: false,
  });
  const hits = res.data?.pages.flatMap((p) => p.items) ?? [];
  const first = res.data?.pages[0];

  return (
    <div className="relative flex h-full flex-col">
      <PageHeader kicker={t("kicker")} title={t("title")} meta={<span>{t("subtitle")}</span>} />
      <div className="space-y-2.5 border-b border-line bg-surface px-4 py-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              autoFocus
              icon={SearchIcon}
              value={s.q}
              onChange={(e) => s.set({ q: e.target.value })}
              placeholder={t(`placeholder.${s.kind}`)}
              className="num !h-10 text-[13.5px]"
            />
          </div>
          <Select
            value={s.sort}
            onChange={(e) => (s.set({ sort: e.target.value }), submitted && run(s.kind, s.q, e.target.value))}
            className="!h-10 !w-[150px] shrink-0"
          >
            {SORTS[s.kind].map((o) => (
              <option key={o} value={o}>
                {t(`sort.${o}`)}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="primary" icon={SearchIcon} disabled={!s.q.trim()} className="!h-10">
            {t("go")}
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<SearchKind>
            value={s.kind}
            onChange={(kind) => (
              s.set({ kind, sort: "best-match" }),
              s.q.trim() ? run(kind, s.q, "best-match") : setSubmitted(null)
            )}
            options={KINDS.map((k) => ({ value: k, label: t(`kind.${k}`), icon: ICON[k] }))}
          />
          {s.kind !== "users" && (
            <Checkbox
              checked={s.mine}
              onChange={(mine) => s.set({ mine })}
              label={<span className="text-[12px]">{t("mine", { login })}</span>}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-faint">{t("hints")}</span>
          {HINTS[s.kind].map((h) => {
            const on = s.q.split(/\s+/).includes(h);
            return (
              <button
                key={h}
                onClick={() => s.set({ q: toggleHint(s.q, h) })}
                className={cn(
                  "num h-6 cursor-default rounded-[3px] border px-1.5 text-[11px]",
                  on
                    ? "border-accent text-accent"
                    : "border-line text-dim hover:border-accent hover:text-accent",
                )}
              >
                {h}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {!submitted ? (
          <Recent
            onPick={(kind, q) => (s.set({ kind, q, sort: "best-match" }), run(kind, q, "best-match"))}
          />
        ) : res.isLoading ? (
          <Plotter />
        ) : res.isError ? (
          <EmptyState title={errorMessage(res.error)} body={t("rateHint")} />
        ) : hits.length === 0 ? (
          <EmptyState icon={<SearchIcon size={20} />} title={t("noResults")} body={t("noResultsBody")} />
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-line px-4 py-1.5 text-[11.5px] text-faint">
              <span className="num">
                {t("total", { count: first?.total ?? 0, shown: formatNumber(hits.length) })}
              </span>
              {first?.incomplete && <span className="text-warn">· {t("incomplete")}</span>}
              {(first?.total ?? 0) > 1000 && <span>· {t("cap")}</span>}
              <span className="num ml-auto">{submitted.q}</span>
              {submitted.kind === "code" && (
                <Checkbox
                  checked={s.grouped}
                  onChange={(grouped) => s.set({ grouped })}
                  label={<span className="text-[11.5px]">{t("groupByRepo")}</span>}
                />
              )}
              <SaveSearch kind={submitted.kind} q={s.q.trim()} />
            </div>
            {submitted.kind === "code" && s.grouped
              ? groupByRepo(hits).map(([repo, list]) => (
                  <section key={repo}>
                    <div className="num sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-4 py-1.5 text-[12px]">
                      <span className="flex-1 truncate">{repo}</span>
                      <span className="text-faint">{t("filesCount", { count: list.length })}</span>
                    </div>
                    {list.map((h, i) => (
                      <HitRow key={`${h.url}#${i}`} h={h} />
                    ))}
                  </section>
                ))
              : hits.map((h, i) => <HitRow key={`${h.url}#${i}`} h={h} />)}
            {res.hasNextPage && (
              <div className="p-3 text-center">
                <Button loading={res.isFetchingNextPage} onClick={() => void res.fetchNextPage()}>
                  {t("more")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}


function groupByRepo(hits: Hit[]): [string, Hit[]][] {
  const m = new Map<string, Hit[]>();
  for (const h of hits) m.set(h.repo ?? "", [...(m.get(h.repo ?? "") ?? []), h]);
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}


function SaveSearch({ kind, q }: { kind: SearchKind; q: string }) {
  const { t } = useTranslation("search");
  const saved = useSearch((s) => s.saved.some((x) => x.kind === kind && x.q === q));
  const save = useSearch((s) => s.save);
  const unsave = useSearch((s) => s.unsave);
  if (!q) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={saved ? BookmarkCheck : BookmarkPlus}
      className={saved ? "text-accent" : undefined}
      onClick={() => (saved ? unsave(kind, q) : save({ kind, q, name: q }))}
    >
      {saved ? t("saved") : t("save")}
    </Button>
  );
}

function HitRow({ h }: { h: Hit }) {
  const { t } = useTranslation("search");
  const Icon = h.kind === "issues" && h.is_pr ? GitPullRequest : ICON[h.kind];
  const stateTone = h.state === "open" ? "ok" : h.state === "merged" ? "done" : "idle";
  return (
    <button
      onClick={() => openHit(h)}
      className="grid w-full cursor-default grid-cols-[18px_minmax(0,1fr)_auto] gap-3 border-b border-line px-4 py-2.5 text-left hover:bg-surface-2"
    >
      {h.avatar ? (
        <img src={h.avatar} alt="" className="mt-0.5 size-4 rounded-[3px]" loading="lazy" />
      ) : (
        <Icon size={14} className="mt-0.5 text-faint" />
      )}
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate text-[13px]", h.kind !== "issues" && h.kind !== "commits" && "num")}>
            {h.title}
          </span>
          {h.state && (
            <Badge tone={stateTone}>{t(`state.${h.state as "open"}`, { defaultValue: h.state })}</Badge>
          )}
          {h.kind === "issues" && <Badge>{h.is_pr ? t("pr") : t("issue")}</Badge>}
        </span>
        <span className="flex min-w-0 flex-wrap gap-x-2 text-[11px] text-faint">
          {h.repo && h.kind !== "repos" && <span className="num">{h.repo}</span>}
          {h.number != null && <span className="num">#{h.number}</span>}
          {h.subtitle && <span className={cn("truncate", h.kind === "code" && "num")}>{h.subtitle}</span>}
          {h.sha && h.kind === "commits" && <span className="num">{h.sha.slice(0, 7)}</span>}
          {h.language && <span>{h.language}</span>}
        </span>
        {h.fragments.slice(0, 2).map((f, i) => (
          <span
            key={i}
            className="num mt-1 block max-h-[72px] overflow-hidden rounded-[3px] border border-line bg-surface-2 px-2 py-1 text-[11px] leading-[16px] whitespace-pre-wrap text-dim"
          >
            {runs(f.text, f.matches).map((r, j) =>
              r.hit ? (
                <mark
                  key={j}
                  className="rounded-[2px] bg-[color-mix(in_srgb,var(--accent)_28%,transparent)] text-text"
                >
                  {r.text}
                </mark>
              ) : (
                <span key={j}>{r.text}</span>
              ),
            )}
          </span>
        ))}
      </span>
      <span className="flex flex-col items-end gap-0.5 text-[11px] text-faint">
        {h.stars != null && (
          <span className="num flex items-center gap-1">
            <Star size={10} /> {formatNumber(h.stars)}
          </span>
        )}
        {h.updated_at && <RelTime at={h.updated_at} />}
      </span>
    </button>
  );
}

function Recent({ onPick }: { onPick: (kind: SearchKind, q: string) => void }) {
  const { t } = useTranslation("search");
  const recent = useSearch((s) => s.recent);
  const saved = useSearch((s) => s.saved);
  const unsave = useSearch((s) => s.unsave);
  const clear = useSearch((s) => s.clearRecent);
  if (!recent.length && !saved.length)
    return <EmptyState icon={<SearchIcon size={20} />} title={t("start")} body={t("startBody")} />;
  return (
    <div className="mx-auto max-w-[700px] p-4">
      {saved.length > 0 && (
        <div className="mb-5">
          <div className="annot mb-2">{t("savedTitle")}</div>
          {saved.map((r) => {
            const Icon = ICON[r.kind];
            return (
              <div
                key={`${r.kind}:${r.q}`}
                className="group flex h-9 items-center gap-2.5 rounded-[3px] px-2 hover:bg-surface-2"
              >
                <button
                  onClick={() => onPick(r.kind, r.q)}
                  className="flex min-w-0 flex-1 cursor-default items-center gap-2.5 text-left"
                >
                  <BookmarkCheck size={13} className="text-accent" />
                  <Icon size={13} className="text-dim" />
                  <span className="num flex-1 truncate text-[12.5px]">{r.q}</span>
                  <span className="text-[11px] text-faint">{t(`kind.${r.kind}`)}</span>
                </button>
                <IconButton
                  icon={X}
                  label={t("unsave")}
                  size={12}
                  className="size-6 opacity-0 group-hover:opacity-100"
                  onClick={() => unsave(r.kind, r.q)}
                />
              </div>
            );
          })}
        </div>
      )}
      {recent.length > 0 && (
        <div className="mb-2 flex items-center justify-between">
          <span className="annot">{t("recent")}</span>
          <Button size="sm" variant="ghost" icon={X} onClick={clear}>
            {t("clearRecent")}
          </Button>
        </div>
      )}
      {recent.map((r) => {
        const Icon = ICON[r.kind];
        return (
          <button
            key={`${r.kind}:${r.q}`}
            onClick={() => onPick(r.kind, r.q)}
            className="flex h-9 w-full cursor-default items-center gap-2.5 rounded-[3px] px-2 text-left hover:bg-surface-2"
          >
            <History size={13} className="text-faint" />
            <Icon size={13} className="text-dim" />
            <span className="num flex-1 truncate text-[12.5px]">{r.q}</span>
            <span className="text-[11px] text-faint">{t(`kind.${r.kind}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
