import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { commands } from "@/core/ipc";
import { cn } from "@/core/cn";
import { languages, tDynamic } from "@/core/i18n";
import { formatNumber } from "@/core/i18n/format";
import { useEnabledModules, useNavModules } from "@/core/modules/registry";
import type { ModuleManifest, Pillar } from "@/core/modules/types";
import { combo } from "@/core/platform";
import { useSheets } from "@/core/sheets/store";
import { useSession } from "@/core/store/session";
import { useSetLanguage } from "./LanguageThemeControls";
import { StatusSegment } from "./StatusSegment";


export function PillarBar() {
  const { t, i18n } = useTranslation();
  const setLanguage = useSetLanguage();
  const nextLanguage = languages[(languages.indexOf(i18n.language) + 1) % languages.length];
  const modules = useNavModules();
  const enabled = useEnabledModules();
  const active = useSheets((s) => s.active);
  const open = useSheets((s) => s.open);

  const pillars = (["build", "manage", "ship"] as Pillar[]).map((p) => ({
    p,
    items: modules.filter((m) => m.pillar === p),
  }));
  const squeeze = useSqueeze();
  const system = modules.filter((m) => m.pillar === "system");
  const indexOf = (m: ModuleManifest) => modules.indexOf(m) + 1;

  return (
    <footer className="relative z-10 flex h-[var(--pillar-h)] shrink-0 items-stretch border-t border-line-strong bg-surface text-[12px]">


      <div
        ref={squeeze.ref}
        onWheel={(e) => {
          const el = e.currentTarget;
          if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
        }}
        className="no-scrollbar flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden"
      >
        {pillars.map(({ p, items }) => (
          <Fragment key={p}>
            <div
              className={cn(
                "flex items-stretch border-r border-line pr-1",
                items.length === 0 && "opacity-40",
              )}
            >
              <span className="annot flex items-center px-3 !text-[9.5px]">{t(`pillars.${p}`)}</span>
              {items.length === 0 && <span className="flex items-center pr-3 text-[11px] text-faint">—</span>}
              {items.map((m) => (
                <Tab
                  key={m.id}
                  m={m}
                  index={indexOf(m)}
                  active={active === m.id}
                  onClick={() => open(m.id)}
                  compact={squeeze.level >= 3 || (squeeze.level >= 1 && active !== m.id)}
                  tight={squeeze.level >= 2}
                />
              ))}
            </div>
          </Fragment>
        ))}
        <div className="flex-1" />
      </div>
      {system.map((m) => (
        <Tab
          key={m.id}
          m={m}
          index={indexOf(m)}
          active={active === m.id}
          onClick={() => open(m.id)}
          compact
        />
      ))}
      <div className="num flex shrink-0 items-stretch text-[11px] text-dim">
        <RateLimit />
        {enabled.flatMap((m) => (m.statusItems ?? []).map((Item, i) => <Item key={`${m.id}-${i}`} />))}
        <StatusSegment
          className="uppercase"
          title={t("palette.language", { name: nextLanguage.toUpperCase() })}
          onClick={() => setLanguage(nextLanguage)}
        >
          {i18n.language}
        </StatusSegment>
      </div>
    </footer>
  );
}


function Tab({
  m,
  index,
  active,
  onClick,
  compact,
  tight,
}: {
  m: ModuleManifest;
  index: number;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
  tight?: boolean;
}) {
  const title = tDynamic(m.navKey ?? m.titleKey);
  return (
    <button
      onClick={onClick}
      title={index <= 9 ? `${title} · ${combo(String(index))}` : title}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative -mt-px flex shrink-0 items-center gap-2 border-x border-transparent transition-colors cursor-default",
        tight ? "px-[9px]" : "px-3",
        active ? "border-line-strong bg-bg text-text" : "text-dim hover:bg-surface-2 hover:text-text",
      )}
    >
      <span className={cn("absolute inset-x-0 top-0 h-[2px]", active ? "bg-accent" : "bg-transparent")} />
      <m.icon size={14} strokeWidth={active ? 2.1 : 1.8} className={active ? "text-accent" : undefined} />
      {!compact && <span className="whitespace-nowrap">{title}</span>}
    </button>
  );
}

function RateLimit() {
  const { t } = useTranslation();
  const active = useSession((s) => s.session?.active);
  const { data } = useQuery({
    queryKey: ["rate", active],
    queryFn: () => commands.githubRateLimit(),
    refetchInterval: 10_000,
    enabled: !!active,
  });
  const core = data?.find((r) => r.resource === "core");
  if (!core) return <StatusSegment>{t("status.api")} —</StatusSegment>;
  const ratio = core.remaining / Math.max(1, core.limit);
  const tone = ratio < 0.1 ? "danger" : ratio < 0.3 ? "warn" : "ok";
  const time = (unix: number) =>
    new Date(unix * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const title = (data ?? [])
    .map((r) =>
      t("status.rateLine", {
        resource: r.resource,
        remaining: formatNumber(r.remaining),
        limit: formatNumber(r.limit),
        reset: time(r.reset),
      }),
    )
    .join("\n");
  return (
    <StatusSegment title={title}>
      <span className="text-faint">{t("status.api")}</span>
      <span className="relative h-1 w-10 overflow-hidden rounded-[1px] bg-surface-3">
        <span
          className="absolute inset-y-0 left-0"
          style={{ width: `${ratio * 100}%`, background: `var(--${tone})` }}
        />
      </span>
      <span>{formatNumber(core.remaining)}</span>
    </StatusSegment>
  );
}


function useSqueeze() {
  const ref = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState(0);
  const needed = useRef<number[]>([]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (level < 3 && el.scrollWidth > el.clientWidth + 1) {
        needed.current[level] = el.scrollWidth;
        setLevel(level + 1);
      } else if (level > 0 && el.clientWidth >= (needed.current[level - 1] ?? Infinity)) setLevel(level - 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  });
  return { ref, level };
}
