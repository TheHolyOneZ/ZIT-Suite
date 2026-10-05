import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellOff, Eye, EyeOff, Lock } from "lucide-react";
import { commands, unwrap, type WatchMode } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { queryClient } from "@/core/query";
import { useActiveAccount } from "@/core/store/session";
import { toast } from "@/core/store/toasts";
import { Badge, Button, Checkbox, EmptyState, Input, Plotter, RelTime, Segmented } from "@/ui";
import { useRepoList } from "@/core/data/repos";
import { useUnreadCount, useWatched } from "./api";


export function WatchingSheet() {
  const { t } = useTranslation(["inbox", "common"]);
  const q = useWatched(true);
  const inboxData = useUnreadCount().data;
  const me = useActiveAccount()?.login ?? "";
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<WatchMode | null>(null);
  const [tab, setTab] = useState<"watched" | "not">("watched");
  const repos = useRepoList().data;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of inboxData ?? []) m.set(x.repo, (m.get(x.repo) ?? 0) + 1);
    return m;
  }, [inboxData]);

  const notWatched = useMemo(() => {
    const w = new Set((q.data ?? []).map((x) => x.repo));
    return (repos ?? [])
      .filter((r) => !w.has(r.full_name))
      .map((r) => ({
        repo: r.full_name,
        private: r.private,
        fork: r.fork,
        archived: r.archived,
        owner: r.owner.login,
        pushed_at: r.pushed_at ?? null,
      }));
  }, [q.data, repos]);
  const rows = useMemo(
    () =>
      (tab === "watched" ? (q.data ?? []) : notWatched)
        .filter((w) => !search || w.repo.toLowerCase().includes(search.toLowerCase()))
        .sort(
          (a, b) =>
            (counts.get(b.repo) ?? 0) - (counts.get(a.repo) ?? 0) ||
            Number(a.owner === me) - Number(b.owner === me) ||
            a.repo.localeCompare(b.repo),
        ),
    [q.data, notWatched, tab, search, counts, me],
  );
  if (q.isLoading) return <Plotter />;
  if (q.error) return <EmptyState title={errorMessage(q.error)} />;
  const others = (q.data ?? []).filter((w) => w.owner !== me).length;

  const apply = async (mode: WatchMode) => {
    setBusy(mode);
    try {
      const repos = [...picked];
      const failed = await unwrap(commands.watchSet(repos, mode));
      toast({
        kind: failed.length ? "warning" : "success",
        title: t(`watching.done.${mode}`, { count: repos.length - failed.length }),
        body: failed.length ? failed.join(", ") : undefined,
      });
      setPicked(new Set());
      queryClient.setQueryData(["inbox", "watched"], await unwrap(commands.watchedList(true)));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const toggle = (r: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(r)) n.delete(r);
      else n.add(r);
      return n;
    });

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line-strong bg-surface px-6 pt-5 pb-4">
        <div className="annot">{t("watching.kicker")}</div>
        <h2 className="text-[19px] font-semibold">{t("watching.title")}</h2>
        <p className="mt-1 text-[12.5px] text-dim">
          {t("watching.hint", { count: q.data?.length ?? 0, others })}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Segmented<"watched" | "not">
            size="sm"
            value={tab}
            onChange={(v) => (setTab(v), setPicked(new Set()))}
            options={[
              { value: "watched", label: t("watching.tabWatched", { count: q.data?.length ?? 0 }) },
              { value: "not", label: t("watching.tabNot", { count: notWatched.length }) },
            ]}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("watching.search")}
            className="!h-8 w-[200px]"
          />
          <span className="flex-1" />
          <span className="num text-[11.5px] text-faint">{t("selected", { count: picked.size })}</span>
          {tab === "not" && (
            <Button
              size="sm"
              icon={Eye}
              disabled={!picked.size}
              loading={busy === "watching"}
              onClick={() => void apply("watching")}
            >
              {t("watching.watch")}
            </Button>
          )}
          <Button
            size="sm"
            icon={EyeOff}
            disabled={!picked.size || tab === "not"}
            loading={busy === "participating"}
            onClick={() => void apply("participating")}
            title={t("watching.participatingHint")}
          >
            {t("watching.unwatch")}
          </Button>
          <Button
            size="sm"
            icon={BellOff}
            disabled={!picked.size}
            loading={busy === "ignoring"}
            onClick={() => void apply("ignoring")}
            title={t("watching.ignoreHint")}
          >
            {t("watching.ignore")}
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && (
          <EmptyState icon={<Eye size={20} />} title={search ? t("watching.noMatch") : t("watching.none")} />
        )}
        {rows.map((w) => {
          const n = counts.get(w.repo) ?? 0;
          return (
            <label
              key={w.repo}
              className="grid cursor-default grid-cols-[20px_minmax(0,1fr)_auto_110px] items-center gap-3 border-b border-line px-4 py-2 hover:bg-surface-2"
            >
              <Checkbox checked={picked.has(w.repo)} onChange={() => toggle(w.repo)} />
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="num truncate text-[12.5px]">{w.repo}</span>
                {w.private && <Lock size={11} className="shrink-0 text-faint" />}
                {w.owner !== me && <Badge>{t("watching.notYours")}</Badge>}
                {w.archived && <Badge tone="idle">{t("watching.archived")}</Badge>}
              </span>
              <span className={n ? "num text-[11.5px] text-accent" : "num text-[11.5px] text-faint"}>
                {t("watching.inInbox", { count: n })}
              </span>
              <span className="text-right text-[11px] text-faint">
                {w.pushed_at && <RelTime at={w.pushed_at} />}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
