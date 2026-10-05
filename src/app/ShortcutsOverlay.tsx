import { useTranslation } from "react-i18next";
import { tDynamic } from "@/core/i18n";
import { useEnabledModules } from "@/core/modules/registry";
import { useUi } from "@/core/store/ui";
import { Dialog, Kbd } from "@/ui";
import { MOD } from "@/core/platform";

export function ShortcutsOverlay() {
  const { t } = useTranslation();
  const open = useUi((s) => s.shortcutsOpen);
  const setUi = useUi((s) => s.set);
  const modules = useEnabledModules().filter((m) => m.shortcuts?.length);

  const global = [
    { keys: [MOD, "K"], label: t("shortcuts.palette") },
    { keys: [MOD, "1–9"], label: t("shortcuts.modules") },
    { keys: ["Esc"], label: t("shortcuts.back") },
    { keys: ["Alt", "←"], label: t("shortcuts.back") },
    { keys: ["?"], label: t("shortcuts.help") },
  ];

  const Row = ({ keys, label }: { keys: string[]; label: string }) => (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[13px] text-dim">{label}</span>
      <span className="flex gap-1">{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
    </div>
  );

  return (
    <Dialog open={open} onClose={() => setUi({ shortcutsOpen: false })} kicker={t("shortcuts.kicker")} title={t("shell.shortcuts")} width={620}>
      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <div className="annot mb-1">{t("shortcuts.global")}</div>
          {global.map((g) => <Row key={g.label} {...g} />)}
        </div>
        {modules.map((m) => (
          <div key={m.id}>
            <div className="annot mb-1">{tDynamic(m.titleKey)}</div>
            {m.shortcuts!.map((s) => <Row key={s.labelKey} keys={s.keys} label={tDynamic(s.labelKey)} />)}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
