import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { BellOff, Check, CheckCheck, Eye, Inbox, MailOpen, RefreshCw, X } from "lucide-react";
import type { Thread } from "@/core/ipc";
import { errorMessage } from "@/core/errors";
import { cn } from "@/core/cn";
import { useHotkeys } from "@/core/keyboard";
import { sheets } from "@/core/sheets/store";
import {
  Badge,
  Button,
  Checkbox,
  useConfirmClick,
  EmptyState,
  FacetColumn,
  FacetGrid,
  FilterBar,
  IconButton,
  Mark,
  PageHeader,
  Plotter,
  RelTime,
  Segmented,
  useNow,
  ViewsMenu,
  type FilterChip,
} from "@/ui";
import { act, readAll, refreshInbox, useInbox, useSubjectStates } from "./api";
import {
  filterThreads,
  groupThreads,
  KINDS,
  kindKey,
  noisiest,
  REASONS,
  reasonKey,
  reasonOf,
  type GroupBy,
} from "./model";
import { EMPTY_FILTER, useInboxPrefs, useInboxUi, type InboxView } from "./store";


export function openThread(t: Thread) {
  if (t.unread) void act([t.id], "read");
  if (t.number != null && t.kind === "PullRequest")
    sheets.push("pulls", "pull", { repo: t.repo, number: t.number, title: t.title });
  else if (t.number != null && t.kind === "Issue")
    sheets.push("issues", "issue", { repo: t.repo, number: t.number, title: t.title });
  else void openUrl(t.web_url);
}

export function InboxPage() {
  const { t } = useTranslation(["inbox", "common"]);
  useNow();
  const q = useInbox();
  const prefs = useInboxPrefs();
  const ui = useInboxUi();
  const all = useMemo(() => q.data ?? [], [q.data]);
  const shown = useMemo(() => filterThreads(all, ui.filter), [all, ui.filter]);
  const groups = useMemo(() => groupThreads(shown, prefs.groupBy), [shown, prefs.groupBy]);
  const flat = groups.flatMap((g) => g.threads);
  const states = useSubjectStates(shown);
  const unread = all.filter((x) => x.unread).length;
  const cursor = flat[Math.min(ui.cursor, flat.length - 1)];
  const sel = [...ui.selected].filter((id) => flat.some((x) => x.id === id));
  const targets = () => (sel.length ? sel : cursor ? [cursor.id] : []);

  useHotkeys({
    j: () => ui.set({ cursor: Math.min(flat.length - 1, ui.cursor + 1) }),
    arrowdown: () => ui.set({ cursor: Math.min(flat.length - 1, ui.cursor + 1) }),
    k: () => ui.set({ cursor: Math.max(0, ui.cursor - 1) }),
    arrowup: () => ui.set({ cursor: Math.max(0, ui.cursor - 1) }),
    x: () => cursor && ui.toggle(cursor.id),
    space: () => cursor && ui.toggle(cursor.id),
    enter: () => cursor && openThread(cursor),
    e: () => void act(targets(), "done"),
    r: () => void act(targets(), "read"),
    m: () => void act(targets(), "mute"),
  });

  const chips: FilterChip[] = [];
  for (const r of ui.filter.reasons)
    chips.push({
      id: `r:${r}`,
      facet: t("facets.reason"),
      value: t(`reason.${reasonKey(r)}`),
      onRemove: () => ui.setFilter({ reasons: ui.filter.reasons.filter((x) => x !== r) }),
    });
  for (const k of ui.filter.kinds)
    chips.push({
      id: `k:${k}`,
      facet: t("facets.kind"),
      value: t(`kind.${kindKey(k)}`),
      onRemove: () => ui.setFilter({ kinds: ui.filter.kinds.filter((x) => x !== k) }),
    });
  if (ui.filter.repo)
    chips.push({
      id: "repo",
      facet: t("facets.repo"),
      value: ui.filter.repo,
      onRemove: () => ui.setFilter({ repo: null }),
    });
  if (ui.filter.owner)
    chips.push({
      id: "owner",
      facet: t("facets.owner"),
      value: ui.filter.owner,
      onRemove: () => ui.setFilter({ owner: null }),
    });
  const owners = [...new Set(all.map((x) => x.repo.split("/")[0]))].sort((a, b) => a.localeCompare(b));
  const toggleIn = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const noisy = noisiest(all, 4);

  return (
    <div className="relative flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={
          q.data ? (
            <>
              <span className={cn("num", unread > 0 && "text-accent")}>
                {t("meta.unread", { count: unread })}
              </span>
              <span className="text-faint">·</span>
              <span className="num">{t("meta.total", { count: all.length })}</span>
              <span className="text-faint">·</span>
              <span className="num">
                {t("meta.checked", { when: new Date(q.dataUpdatedAt).toLocaleTimeString() })}
              </span>
            </>
          ) : (
            <span>{t("subtitle")}</span>
          )
        }
        actions={
          <>
            <Checkbox
              checked={prefs.desktop}
              onChange={(desktop) => prefs.set({ desktop })}
              label={
                <span className="text-[12px]" title={t("desktop.hint")}>
                  {t("desktop.label")}
                </span>
              }
            />
            <Button
              icon={Eye}
              onClick={() => sheets.push("inbox", "watching", { title: t("watching.title") })}
            >
              {t("watching.button")}
            </Button>
            <Button icon={RefreshCw} loading={q.isFetching} onClick={() => void refreshInbox()}>
              {t("refresh")}
            </Button>
            <Button
              variant="primary"
              icon={CheckCheck}
              disabled={!unread}
              onClick={() => void readAll(ui.filter.repo)}
            >
              {ui.filter.repo ? t("readAllRepo") : t("readAll")}
            </Button>
          </>
        }
      />
      <FilterBar
        search={ui.filter.search}
        onSearch={(search) => ui.setFilter({ search })}
        placeholder={t("searchPlaceholder")}
        chips={chips}
        onReset={() => ui.setFilter(EMPTY_FILTER)}
        views={
          <ViewsMenu
            saved={prefs.views.map((v) => ({ id: v.id, label: v.name }))}
            activeId={ui.activeView}
            onPick={(id) => {
              const v = prefs.views.find((x) => x.id === id);
              if (v) ui.set({ filter: { ...EMPTY_FILTER, ...v.filter }, activeView: id, cursor: 0 });
            }}
            onSave={(name) => {
              const id = `v${Date.now()}`;
              prefs.set({ views: [...prefs.views, { id, name, filter: ui.filter }] });
              ui.set({ activeView: id });
            }}
            onDelete={(id) => prefs.set({ views: prefs.views.filter((v) => v.id !== id) })}
          />
        }
        facetsWidth={460}
        facets={
          <FacetGrid>
            <FacetColumn>
              <div className="annot px-2 pb-1">{t("facets.reason")}</div>
              {Object.keys(REASONS).map((r) => (
                <Checkbox
                  key={r}
                  checked={ui.filter.reasons.includes(r)}
                  onChange={() => ui.setFilter({ reasons: toggleIn(ui.filter.reasons, r) })}
                  label={<span className="text-[12.5px]">{t(`reason.${reasonKey(r)}`)}</span>}
                />
              ))}
            </FacetColumn>
            <FacetColumn>
              <div className="annot px-2 pb-1">{t("facets.kind")}</div>
              {[...KINDS, "Other"].map((k) => (
                <Checkbox
                  key={k}
                  checked={ui.filter.kinds.includes(k)}
                  onChange={() => ui.setFilter({ kinds: toggleIn(ui.filter.kinds, k) })}
                  label={<span className="text-[12.5px]">{t(`kind.${kindKey(k)}`)}</span>}
                />
              ))}
              {owners.length > 1 && (
                <>
                  <div className="annot px-2 pt-3 pb-1">{t("facets.owner")}</div>
                  {owners.map((o) => (
                    <Checkbox
                      key={o}
                      checked={ui.filter.owner === o}
                      onChange={(on) => ui.setFilter({ owner: on ? o : null })}
                      label={<span className="num text-[12.5px]">{o}</span>}
                    />
                  ))}
                </>
              )}
            </FacetColumn>
          </FacetGrid>
        }
        right={
          <div className="flex items-center gap-3">
            <Segmented<GroupBy>
              size="sm"
              value={prefs.groupBy}
              onChange={(groupBy) => prefs.set({ groupBy })}
              options={(["reason", "repo", "none"] as const).map((g) => ({
                value: g,
                label: t(`group.${g}`),
              }))}
            />
            <Segmented<InboxView>
              value={prefs.view}
              onChange={(view) => prefs.set({ view })}
              options={(["unread", "participating", "all"] as const).map((v) => ({
                value: v,
                label: t(`view.${v}`),
              }))}
            />
          </div>
        }
      />
      {sel.length > 0 && (
        <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-1.5">
          <span className="num text-[12px] text-dim">{t("selected", { count: sel.length })}</span>
          <Button size="sm" icon={MailOpen} onClick={() => void act(sel, "read")}>
            {t("actions.read")} <span className="text-faint">R</span>
          </Button>
          <Button size="sm" icon={Check} onClick={() => void act(sel, "done")}>
            {t("actions.done")} <span className="text-faint">E</span>
          </Button>
          <Button size="sm" icon={BellOff} onClick={() => void act(sel, "mute")}>
            {t("actions.mute")} <span className="text-faint">M</span>
          </Button>
          <IconButton
            icon={X}
            label={t("common:actions.cancel")}
            size={13}
            className="ml-auto size-7"
            onClick={() => ui.set({ selected: new Set() })}
          />
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {q.isLoading ? (
          <Plotter />
        ) : q.isError ? (
          <EmptyState
            title={errorMessage(q.error)}
            action={<Button onClick={() => q.refetch()}>{t("common:actions.retry")}</Button>}
          />
        ) : flat.length === 0 ? (
          <EmptyState
            icon={<Inbox size={20} />}
            title={
              all.length ? t("empty.filtered") : prefs.view === "unread" ? t("empty.zero") : t("empty.none")
            }
            body={all.length ? undefined : t("empty.zeroBody")}
          />
        ) : (
          <>
            {groups.map((g) => (
              <section key={g.key}>
                {prefs.groupBy !== "none" && (
                  <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-4 py-1.5">
                    {prefs.groupBy === "reason" ? (
                      <>
                        <Mark glyph={reasonOf(g.key).glyph} tone={reasonOf(g.key).tone} size={11} />
                        <span className="annot">{t(`reason.${reasonKey(g.key)}`)}</span>
                      </>
                    ) : (
                      <button
                        className="annot cursor-default normal-case hover:text-accent"
                        onClick={() => ui.setFilter({ repo: g.key })}
                      >
                        {g.key}
                      </button>
                    )}
                    <span className="num text-[11px] text-faint">
                      {g.unread}/{g.threads.length}
                    </span>
                    <span className="flex-1" />
                    <GroupDone ids={g.threads.map((x) => x.id)} />
                  </div>
                )}
                {g.threads.map((th) => (
                  <Row
                    key={th.id}
                    th={th}
                    active={cursor?.id === th.id}
                    selected={ui.selected.has(th.id)}
                    onSelect={() => ui.toggle(th.id)}
                    onFocus={() => ui.set({ cursor: flat.indexOf(th) })}
                    state={th.number != null ? states.get(`${th.repo}#${th.number}`) : undefined}
                  />
                ))}
              </section>
            ))}
            {noisy.length > 0 && noisy[0].count >= 5 && (
              <div className="m-4 rounded-[var(--radius)] border border-line bg-surface p-3 text-[12px] text-dim">
                <span className="annot mr-2">{t("noisy.title")}</span>
                {noisy.map((n) => (
                  <button
                    key={n.repo}
                    className="num mr-3 cursor-default hover:text-accent"
                    onClick={() => ui.setFilter({ repo: n.repo })}
                  >
                    {n.repo} <span className="text-faint">{n.count}</span>
                  </button>
                ))}
                <button
                  className="cursor-default text-accent hover:underline"
                  onClick={() => sheets.push("inbox", "watching", { title: t("watching.title") })}
                >
                  {t("noisy.manage")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const STATE_TONE: Record<string, "ok" | "idle" | "accent" | "danger"> = {
  open: "ok",
  draft: "idle",
  merged: "accent",
  closed: "danger",
  completed: "accent",
  not_planned: "idle",
};

function Row({
  th,
  active,
  selected,
  onSelect,
  onFocus,
  state,
}: {
  th: Thread;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
  onFocus: () => void;
  state?: string;
}) {
  const { t } = useTranslation("inbox");
  const r = reasonOf(th.reason);
  return (
    <div
      className={cn(
        "group grid cursor-default grid-cols-[20px_18px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-4 py-2 hover:bg-surface-2",
        active && "bg-surface-2",
        th.unread && "shadow-[inset_2px_0_0_var(--accent)]",
      )}
      onMouseEnter={onFocus}
    >
      <Checkbox checked={selected} onChange={onSelect} />
      <Mark glyph={r.glyph} tone={th.unread ? r.tone : "idle"} title={t(`reason.${reasonKey(th.reason)}`)} />
      <button className="min-w-0 cursor-default text-left" onClick={() => openThread(th)}>
        <span className={cn("block truncate text-[13px]", th.unread ? "font-medium text-text" : "text-dim")}>
          {th.title}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-[11px] text-faint">
          <span className="num truncate">{th.repo}</span>
          {th.number != null && <span className="num">#{th.number}</span>}
          {state && <Badge tone={STATE_TONE[state] ?? "idle"}>{t(`subjectState.${state as "open"}`)}</Badge>}
          <span>{t(`kind.${kindKey(th.kind)}`)}</span>
          {r.rank <= 1 && <Badge tone={r.tone}>{t(`reason.${reasonKey(th.reason)}`)}</Badge>}
        </span>
      </button>
      <span className="flex items-center gap-1">
        <span className="text-[11px] text-faint group-hover:hidden">
          <RelTime at={th.updated_at} />
        </span>
        <span className="hidden group-hover:flex">
          {th.unread && (
            <IconButton
              icon={MailOpen}
              label={t("actions.read")}
              size={13}
              className="size-7"
              onClick={() => void act([th.id], "read")}
            />
          )}
          <IconButton
            icon={Check}
            label={t("actions.done")}
            size={13}
            className="size-7"
            onClick={() => void act([th.id], "done")}
          />
          <IconButton
            icon={BellOff}
            label={t("actions.mute")}
            size={13}
            className="size-7"
            onClick={() => void act([th.id], "mute")}
          />
        </span>
      </span>
    </div>
  );
}


function GroupDone({ ids }: { ids: string[] }) {
  const { t } = useTranslation("inbox");
  const c = useConfirmClick(() => void act(ids, "done"));
  return (
    <Button
      size="sm"
      variant="ghost"
      className={cn("h-6 text-[11px]", c.armed && "text-danger")}
      onClick={c.onClick}
    >
      {c.armed ? t("groupDoneConfirm", { count: ids.length }) : t("groupDone")}
    </Button>
  );
}
