import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FileCode2, Globe, Lock, MessageSquare, Plus, RefreshCw, Star } from "lucide-react";
import { errorMessage } from "@/core/errors";
import { cn } from "@/core/cn";
import { sheets, useTopSheet } from "@/core/sheets/store";
import { useSheetRole } from "@/core/sheets/role";
import {
  Button,
  EmptyState,
  FilterBar,
  PageHeader,
  Plotter,
  RelTime,
  Segmented,
  useNow,
  type FilterChip,
} from "@/ui";
import { refreshGists, useGists } from "./api";
import { filterGists, languages, titleOf, type Visibility } from "./model";
import { useGistsUi } from "./store";

export function GistsPage() {
  const { t } = useTranslation(["gists", "common"]);
  useNow();
  const ui = useGistsUi();
  const q = useGists(ui.starred);
  const all = useMemo(() => q.data ?? [], [q.data]);
  const shown = useMemo(
    () => filterGists(all, ui.search, ui.visibility, ui.language),
    [all, ui.search, ui.visibility, ui.language],
  );
  const langs = useMemo(() => languages(all), [all]);
  const open = useTopSheet("gists", "gist")?.id;
  const compact = useSheetRole() === "peek";
  const secret = all.filter((g) => !g.public).length;

  const chips: FilterChip[] = ui.language
    ? [
        {
          id: "lang",
          facet: t("facets.language"),
          value: ui.language,
          onRemove: () => ui.set({ language: null }),
        },
      ]
    : [];

  return (
    <div className="relative flex h-full flex-col">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        meta={
          q.data ? (
            <>
              <span className="num">{t("meta.count", { count: all.length })}</span>
              {!ui.starred && (
                <>
                  <span className="text-faint">·</span>
                  <span className="num">{t("meta.secret", { count: secret })}</span>
                </>
              )}
            </>
          ) : (
            <span>{t("subtitle")}</span>
          )
        }
        actions={
          <>
            <Button icon={RefreshCw} loading={q.isFetching} onClick={() => void refreshGists()}>
              {t("refresh")}
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => ui.set({ creating: true })}>
              {t("new")}
            </Button>
          </>
        }
      />
      <FilterBar
        search={ui.search}
        onSearch={(search) => ui.set({ search })}
        placeholder={t("searchPlaceholder")}
        chips={chips}
        onReset={() => ui.set({ search: "", visibility: "all", language: null })}
        facetsWidth={240}
        facets={(close) => (
          <div className="max-h-[320px] overflow-y-auto p-1">
            <div className="annot px-2 pb-1">{t("facets.language")}</div>
            {langs.map((l) => (
              <button
                key={l.name}
                className="flex h-8 w-full cursor-default items-center justify-between rounded-[3px] px-2 text-[12.5px] hover:bg-surface-2"
                onClick={() => (ui.set({ language: l.name }), close())}
              >
                {l.name}
                <span className="num text-[11px] text-faint">{l.count}</span>
              </button>
            ))}
          </div>
        )}
        right={
          <div className="flex items-center gap-3">
            {!ui.starred && (
              <Segmented<Visibility>
                size="sm"
                value={ui.visibility}
                onChange={(visibility) => ui.set({ visibility })}
                options={(["all", "public", "secret"] as const).map((v) => ({
                  value: v,
                  label: t(`visibility.${v}`),
                }))}
              />
            )}
            <Segmented<"mine" | "starred">
              value={ui.starred ? "starred" : "mine"}
              onChange={(v) => ui.set({ starred: v === "starred" })}
              options={[
                { value: "mine", label: t("views.mine"), icon: FileCode2 },
                { value: "starred", label: t("views.starred"), icon: Star },
              ]}
            />
          </div>
        }
      />
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {q.isLoading ? (
          <Plotter />
        ) : q.isError ? (
          <EmptyState title={errorMessage(q.error)} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<FileCode2 size={20} />}
            title={all.length ? t("empty.filtered") : ui.starred ? t("empty.starred") : t("empty.mine")}
            body={all.length || ui.starred ? undefined : t("empty.mineBody")}
            action={
              all.length || ui.starred ? undefined : (
                <Button variant="primary" icon={Plus} onClick={() => ui.set({ creating: true })}>
                  {t("new")}
                </Button>
              )
            }
          />
        ) : (
          shown.map((g) => (
            <button
              key={g.id}
              onClick={() => sheets.push("gists", "gist", { id: g.id, title: titleOf(g) })}
              className={cn(
                "grid w-full cursor-default items-center gap-3 border-b border-line px-4 py-2.5 text-left hover:bg-surface-2",
                compact
                  ? "grid-cols-[18px_minmax(0,1fr)]"
                  : "grid-cols-[18px_minmax(0,1.4fr)_minmax(0,1fr)_60px_110px]",
                open === g.id && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
              )}
            >
              {g.public ? (
                <Globe size={13} className="text-faint" />
              ) : (
                <Lock size={13} className="text-warn" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-[13px]">{titleOf(g)}</span>
                <span className="num block truncate text-[11px] text-faint">
                  {ui.starred && `${g.owner} · `}
                  {g.files.map((f) => f.filename).join(", ")}
                </span>
              </span>
              {!compact && (
                <>
                  <span className="truncate text-[11.5px] text-dim">
                    {[...new Set(g.files.map((f) => f.language).filter(Boolean))].join(", ")}
                  </span>
                  <span className="flex items-center justify-end gap-1 text-[11px] text-faint">
                    {g.comments > 0 && (
                      <>
                        <MessageSquare size={11} /> {g.comments}
                      </>
                    )}
                  </span>
                  <span className="text-right text-[11.5px] text-faint">
                    <RelTime at={g.updated_at} />
                  </span>
                </>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
