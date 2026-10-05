import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Archive, Download, ExternalLink, GitFork, Hourglass, ListPlus, Lock, Plus, RefreshCw, Star, StarOff, Trash2, X } from "lucide-react";
import { commands, unwrap, type StarList, type Starred } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { formatNumber } from "@/core/i18n/format";
import { queryClient } from "@/core/query";
import { toast } from "@/core/store/toasts";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  FacetColumn,
  FacetGrid,
  FilterBar,
  IconButton,
  Input,
  Label,
  MenuItem,
  PageHeader,
  Plotter,
  Popover,
  RelTime,
  Select,
  useConfirmClick,
  useNow,
  type FilterChip,
} from "@/ui";
import { refreshStars, unstar, useStarLists, useStars } from "./api";
import { csvExport, filterStars, isStale, languageCounts, markdownExport, membership, parseRepo, type Flag } from "./model";
import { EMPTY, useStarsUi, type StarSort } from "./store";

const FLAGS: { id: Flag; icon: typeof Archive }[] = [
  { id: "archived", icon: Archive },
  { id: "stale", icon: Hourglass },
  { id: "fork", icon: GitFork },
];

export function StarsPage() {
  const { t } = useTranslation(["stars", "common"]);
  useNow();
  const q = useStars();
  const listsQ = useStarLists();
  const ui = useStarsUi();
  const all = useMemo(() => q.data ?? [], [q.data]);
  const lists = useMemo(() => listsQ.data ?? [], [listsQ.data]);
  const member = useMemo(() => membership(lists), [lists]);
  const { filter, sort } = ui;
  const shown = useMemo(() => {
    const f = filterStars(all, filter, lists);
    const by: Record<StarSort, (a: Starred, b: Starred) => number> = {
      starred: (a, b) => b.starred_at.localeCompare(a.starred_at),
      stars: (a, b) => b.stars - a.stars,
      pushed: (a, b) => (b.pushed_at ?? "").localeCompare(a.pushed_at ?? ""),
      name: (a, b) => a.repo.localeCompare(b.repo),
    };
    return [...f].sort(by[sort]);
  }, [all, filter, lists, sort]);
  const langs = useMemo(() => languageCounts(all), [all]);
  const sel = [...ui.selected].filter((r) => shown.some((s) => s.repo === r));

  const chips: FilterChip[] = [];
  if (ui.filter.language) chips.push({ id: "lang", facet: t("facets.language"), value: ui.filter.language, onRemove: () => ui.setFilter({ language: null }) });
  if (ui.filter.list) chips.push({ id: "list", facet: t("facets.list"), value: lists.find((l) => l.id === ui.filter.list)?.name ?? "", onRemove: () => ui.setFilter({ list: null }) });
  for (const f of ui.filter.flags) chips.push({ id: f, facet: t("facets.flag"), value: t(`flags.${f}`), onRemove: () => ui.setFilter({ flags: ui.filter.flags.filter((x) => x !== f) }) });

  const exportAs = async (kind: "md" | "csv") => {
    const path = await save({ defaultPath: kind === "md" ? "my-stars.md" : "my-stars.csv", filters: [{ name: kind.toUpperCase(), extensions: [kind] }] });
    if (!path) return;
    try {
      await unwrap(commands.exportTextFile(path, kind === "md" ? markdownExport(shown, t("exportTitle")) : csvExport(shown)));
      toast({ kind: "success", title: t("exported", { count: shown.length }) });
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="relative flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={
          q.data ? (
            <>
              <span className="num">{t("meta.count", { count: all.length })}</span>
              <span className="text-faint">·</span>
              <span className="num">{t("meta.languages", { count: langs.length })}</span>
              <span className="text-faint">·</span>
              <span className="num">{t("meta.archived", { count: all.filter((s) => s.archived).length })}</span>
              <span className="text-faint">·</span>
              <span className="num">{t("meta.stale", { count: all.filter((s) => isStale(s)).length })}</span>
            </>
          ) : (
            <span>{t("subtitle")}</span>
          )
        }
        actions={
          <>
            <Popover
              placement="bottom-end"
              trigger={(p) => (
                <Button {...p} icon={Download} disabled={!shown.length}>
                  {t("export")}
                </Button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem onClick={() => (close(), void exportAs("md"))}>{t("exportMd")}</MenuItem>
                  <MenuItem onClick={() => (close(), void exportAs("csv"))}>{t("exportCsv")}</MenuItem>
                </>
              )}
            </Popover>
            <Button icon={RefreshCw} loading={q.isFetching} onClick={() => void refreshStars()}>
              {t("refresh")}
            </Button>
            <Button variant="primary" icon={Star} onClick={() => ui.set({ adding: true })}>
              {t("starRepo")}
            </Button>
          </>
        }
      />
      <FilterBar
        search={ui.filter.search}
        onSearch={(search) => ui.setFilter({ search })}
        placeholder={t("searchPlaceholder")}
        chips={chips}
        onReset={() => ui.setFilter(EMPTY)}
        facetsWidth={480}
        facets={(close) => (
          <FacetGrid>
            <FacetColumn>
              <div className="annot px-2 pb-1">{t("facets.language")}</div>
              <div className="max-h-[260px] overflow-y-auto">
                {langs.map((l) => (
                  <button key={l.name} className="flex h-7 w-full cursor-default items-center gap-2 rounded-[3px] px-2 text-[12.5px] hover:bg-surface-2" onClick={() => (ui.setFilter({ language: l.name }), close())}>
                    <span className="size-2.5 rounded-[2px]" style={{ background: l.color ?? "var(--line-strong)" }} />
                    <span className="flex-1 text-left">{l.name}</span>
                    <span className="num text-[11px] text-faint">{l.count}</span>
                  </button>
                ))}
              </div>
            </FacetColumn>
            <FacetColumn>
              <div className="annot px-2 pb-1">{t("facets.flag")}</div>
              {FLAGS.map((f) => (
                <Checkbox
                  key={f.id}
                  checked={ui.filter.flags.includes(f.id)}
                  onChange={(on) => ui.setFilter({ flags: on ? [...ui.filter.flags, f.id] : ui.filter.flags.filter((x) => x !== f.id) })}
                  label={<span className="text-[12.5px]">{t(`flags.${f.id}`)}</span>}
                />
              ))}
              {lists.length > 0 && (
                <>
                  <div className="annot px-2 pt-2 pb-1">{t("facets.list")}</div>
                  {lists.map((l) => (
                    <button key={l.id} className="flex h-7 w-full cursor-default items-center justify-between rounded-[3px] px-2 text-[12.5px] hover:bg-surface-2" onClick={() => (ui.setFilter({ list: l.id }), close())}>
                      {l.name}
                      <span className="num text-[11px] text-faint">{l.items.length}</span>
                    </button>
                  ))}
                </>
              )}
            </FacetColumn>
          </FacetGrid>
        )}
        right={
          <div className="flex items-center gap-3">
            <ListsManager lists={lists} />
            <Select value={ui.sort} onChange={(e) => ui.set({ sort: e.target.value as StarSort })} className="!h-8 !w-[160px] shrink-0">
              {(["starred", "stars", "pushed", "name"] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`sort.${s}`)}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      {sel.length > 0 && <BulkBar sel={sel} all={all} lists={lists} member={member} />}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {q.isLoading ? (
          <Plotter />
        ) : q.isError ? (
          <EmptyState title={errorMessage(q.error)} />
        ) : shown.length === 0 ? (
          <EmptyState icon={<Star size={20} />} title={all.length ? t("empty.filtered") : t("empty.none")} />
        ) : (
          shown.map((s) => (
            <div
              key={s.repo}
              className={cn("grid grid-cols-[20px_minmax(0,1.4fr)_120px_70px_100px_100px_32px] items-center gap-3 border-b border-line px-4 py-2 hover:bg-surface-2", (s.archived || isStale(s)) && "opacity-70")}
            >
              <Checkbox checked={ui.selected.has(s.repo)} onChange={() => ui.toggle(s.repo)} />
              <div className="min-w-0">
                <button className="flex max-w-full cursor-default items-center gap-1.5 text-left" onClick={() => void openUrl(s.url)}>
                  <img src={s.avatar} alt="" className="size-4 shrink-0 rounded-[3px]" loading="lazy" />
                  <span className="num truncate text-[12.5px] hover:text-accent">{s.repo}</span>
                  {s.private && <Lock size={10} className="shrink-0 text-faint" />}
                  {s.archived && <Badge tone="idle">{t("flags.archived")}</Badge>}
                  {!s.archived && isStale(s) && <Badge tone="warn">{t("flags.stale")}</Badge>}
                </button>
                <div className="truncate text-[11.5px] text-faint">{s.description || "—"}</div>
                {(member.get(s.id) ?? []).length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {(member.get(s.id) ?? []).map((id) => (
                      <Badge key={id}>{lists.find((l) => l.id === id)?.name}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <span className="flex items-center gap-1.5 truncate text-[11.5px] text-dim">
                {s.language && <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: s.language_color ?? "var(--line-strong)" }} />}
                {s.language ?? "—"}
              </span>
              <span className="num flex items-center justify-end gap-1 text-[11.5px] text-dim">
                <Star size={11} /> {formatNumber(s.stars)}
              </span>
              <span className="text-right text-[11px] text-faint" title={t("pushed")}>
                {s.pushed_at ? <RelTime at={s.pushed_at} /> : "—"}
              </span>
              <span className="text-right text-[11px] text-faint" title={t("starredAt")}>
                <RelTime at={s.starred_at} />
              </span>
              <IconButton icon={ExternalLink} label={t("open")} size={12} className="size-7" onClick={() => void openUrl(s.url)} />
            </div>
          ))
        )}
      </div>
      <AddStarDialog />
    </div>
  );
}

function BulkBar({ sel, all, lists, member }: { sel: string[]; all: Starred[]; lists: StarList[]; member: Map<string, string[]> }) {
  const { t } = useTranslation(["stars", "common"]);
  const set = useStarsUi((s) => s.set);
  const remove = useConfirmClick(async () => {
    const n = await unstar(sel);
    set({ selected: new Set() });
    toast({ kind: "success", title: t("unstarred", { count: n }) });
  });

  const toggleList = async (listId: string, add: boolean) => {
    const items = all.filter((s) => sel.includes(s.repo));
    try {
      for (const s of items) {
        const cur = member.get(s.id) ?? [];
        const next = add ? [...new Set([...cur, listId])] : cur.filter((x) => x !== listId);
        if (next.length !== cur.length) await unwrap(commands.starSetLists(s.id, next));
      }
      toast({ kind: "success", title: add ? t("addedToList", { count: items.length }) : t("removedFromList", { count: items.length }) });
      void queryClient.invalidateQueries({ queryKey: ["stars"], predicate: (q) => q.queryKey.at(-1) === "lists" });
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-1.5">
      <span className="num text-[12px] text-dim">{t("selected", { count: sel.length })}</span>
      {lists.length > 0 && (
        <Popover
          trigger={(p) => (
            <Button {...p} size="sm" icon={ListPlus}>
              {t("lists.button")}
            </Button>
          )}
        >
          {(close) =>
            lists.map((l) => {
              const ids = all.filter((s) => sel.includes(s.repo)).map((s) => s.id);
              const allIn = ids.every((id) => (member.get(id) ?? []).includes(l.id));
              return (
                <MenuItem key={l.id} onClick={() => (close(), void toggleList(l.id, !allIn))}>
                  {allIn ? t("lists.removeFrom", { name: l.name }) : t("lists.addTo", { name: l.name })}
                </MenuItem>
              );
            })
          }
        </Popover>
      )}
      <Button size="sm" variant="danger" icon={StarOff} onClick={remove.onClick}>
        {remove.armed ? t("confirmUnstar", { count: sel.length }) : t("unstar")}
      </Button>
      <IconButton icon={X} label={t("common:actions.cancel")} size={13} className="ml-auto size-7" onClick={() => set({ selected: new Set() })} />
    </div>
  );
}

function ListsManager({ lists }: { lists: StarList[] }) {
  const { t } = useTranslation(["stars", "common"]);
  const [name, setName] = useState("");
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      await unwrap(commands.starListCreate(name.trim(), "", priv));
      setName("");
      toast({ kind: "success", title: t("lists.created") });
      void queryClient.invalidateQueries({ queryKey: ["stars"], predicate: (q) => q.queryKey.at(-1) === "lists" });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover
      placement="bottom-end"
      className="w-[300px] p-3"
      trigger={(p) => (
        <Button {...p} size="sm" variant="ghost" icon={ListPlus}>
          {t("lists.title", { count: lists.length })}
        </Button>
      )}
    >
      <div className="space-y-2">
        <div className="annot">{t("lists.manage")}</div>
        {lists.length === 0 && <p className="text-[12px] text-faint">{t("lists.none")}</p>}
        {lists.map((l) => (
          <ListRow key={l.id} l={l} />
        ))}
        <div className="flex gap-2 pt-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("lists.newPlaceholder")} className="!h-8" />
          <Button size="sm" icon={Plus} loading={busy} disabled={!name.trim()} onClick={() => void create()}>
            {t("lists.create")}
          </Button>
        </div>
        <Checkbox checked={priv} onChange={setPriv} label={<span className="text-[12px]">{t("lists.private")}</span>} />
      </div>
    </Popover>
  );
}

function ListRow({ l }: { l: StarList }) {
  const { t } = useTranslation("stars");
  const del = useConfirmClick(async () => {
    try {
      await unwrap(commands.starListDelete(l.id));
      void queryClient.invalidateQueries({ queryKey: ["stars"], predicate: (q) => q.queryKey.at(-1) === "lists" });
    } catch (e) {
      toastError(e);
    }
  });
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 truncate text-[12.5px]">{l.name}</span>
      {l.private && <Lock size={10} className="text-faint" />}
      <span className="num text-[11px] text-faint">{l.items.length}</span>
      <IconButton icon={Trash2} label={del.armed ? t("lists.confirmDelete") : t("lists.delete")} size={12} className={del.armed ? "size-6 text-danger" : "size-6 hover:text-danger"} onClick={del.onClick} />
    </div>
  );
}

function AddStarDialog() {
  const { t } = useTranslation(["stars", "common"]);
  const open = useStarsUi((s) => s.adding);
  const set = useStarsUi((s) => s.set);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const repo = parseRepo(input);
  const submit = async () => {
    if (!repo) return;
    setBusy(true);
    try {
      const failed = await unwrap(commands.starsSet([repo], true));
      if (failed.length) toast({ kind: "error", title: t("starFailed", { repo }) });
      else {
        toast({ kind: "success", title: t("starredRepo", { repo }) });
        setInput("");
        set({ adding: false });
        void refreshStars();
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={() => set({ adding: false })}
      width={460}
      kicker={t("title")}
      title={t("starRepo")}
      footer={
        <>
          <Button variant="ghost" onClick={() => set({ adding: false })}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="primary" icon={Star} loading={busy} disabled={!repo} onClick={() => void submit()}>
            {t("star")}
          </Button>
        </>
      }
    >
      <Label hint={input && !repo ? <span className="text-danger">{t("badRepo")}</span> : t("repoHint")}>{t("repo")}</Label>
      <Input autoFocus value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} placeholder="https://github.com/owner/name" className="num" />
    </Dialog>
  );
}
