import { useTranslation } from "react-i18next";
import { cn } from "@/core/cn";
import { tDynamic } from "@/core/i18n";
import { useEnabledModules } from "@/core/modules/registry";
import { CORE_SECTIONS, useSettingsNav } from "./sections";


export function SettingsIndex() {
  const { t } = useTranslation("settings");
  const { section, go } = useSettingsNav();
  const moduleSections = useEnabledModules().filter((m) => m.settings?.length);
  const items = [
    ...CORE_SECTIONS.map((s) => ({ id: s, label: t(`sections.${s}.title`) })),
    ...moduleSections.map((m) => ({ id: `module-${m.id}`, label: tDynamic(m.titleKey) })),
    { id: "about", label: t("sections.about.title") },
  ];
  return (
    <nav className="flex shrink-0 items-stretch overflow-x-auto border-b border-line bg-surface px-4">
      {items.map((it, i) => (
        <button
          key={it.id}
          onClick={() => go(it.id)}
          className={cn(
            "relative flex h-10 items-center gap-2 px-3 text-[12.5px] whitespace-nowrap cursor-default",
            section === it.id ? "text-text" : "text-dim hover:text-text",
          )}
        >
          <span className="num text-[10px] text-faint">{String(i + 1).padStart(2, "0")}</span>
          {it.label}
          <span
            className={cn(
              "absolute inset-x-2 bottom-0 h-[2px]",
              section === it.id ? "bg-accent" : "bg-transparent",
            )}
          />
        </button>
      ))}
    </nav>
  );
}
