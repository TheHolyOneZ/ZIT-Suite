import { Command } from "cmdk";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Keyboard, Languages, Moon, Plus, UserRound } from "lucide-react";
import { languageName, languages, tDynamic } from "@/core/i18n";
import { useEnabledModules, useNavModules } from "@/core/modules/registry";
import { useSession } from "@/core/store/session";
import { useSettings } from "@/core/store/settings";
import { useUi } from "@/core/store/ui";
import { useSheets } from "@/core/sheets/store";
import { Kbd } from "@/ui";
import { combo } from "@/core/platform";
import { switchAccount } from "@/modules/auth/api";
import { useSetLanguage } from "./LanguageThemeControls";


export function CommandPalette() {
  const { t } = useTranslation();
  const open = useUi((s) => s.paletteOpen);
  const setUi = useUi((s) => s.set);
  const navigate = useSheets((s) => s.open);
  const nav = useNavModules();
  const enabled = useEnabledModules();
  const accounts = useSession((s) => s.session?.accounts ?? []);
  const active = useSession((s) => s.session?.active);
  const setAdding = useSession((s) => s.setAddingAccount);
  const settings = useSettings();
  const setLanguage = useSetLanguage();

  if (!open) return null;
  const close = () => setUi({ paletteOpen: false });
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const ctx = { navigate };

  const item = "flex h-9 items-center gap-2.5 rounded-[3px] px-2.5 text-[13px] text-text data-[selected=true]:bg-surface-2 data-[selected=true]:shadow-[inset_2px_0_0_var(--accent)] cursor-default";

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-[var(--overlay)] pt-[14vh]" onMouseDown={close}>
      <Command
        label={t("shell.palette")}
        loop
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && close()}
        className="relative w-full max-w-[600px] overflow-hidden rounded-[var(--radius)] border border-line-strong bg-surface shadow-[var(--shadow)]"
      >
        <div className="flex items-center gap-2 border-b border-line px-3.5">
          <span className="annot text-accent">›</span>
          <Command.Input autoFocus placeholder={t("palette.placeholder")} className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint" />
          <Kbd>esc</Kbd>
        </div>
        <Command.List className="max-h-[50vh] overflow-y-auto p-1.5">
          <Command.Empty className="px-3 py-6 text-center text-[12.5px] text-faint">{t("palette.empty")}</Command.Empty>

          <Command.Group heading={t("palette.goTo")} >
            {nav.map((m, i) => (
              <Command.Item key={m.id} value={`go ${tDynamic(m.titleKey)} ${m.id}`} onSelect={run(() => navigate(m.id))} className={item}>
                <m.icon size={15} className="text-dim" />
                <span className="flex-1">{tDynamic(m.titleKey)}</span>
                {i < 9 && <Kbd>{combo(String(i + 1))}</Kbd>}
              </Command.Item>
            ))}
          </Command.Group>

          {enabled.some((m) => m.commands?.length) && (
            <Command.Group heading={t("palette.actions")} >
              {enabled.flatMap((m) =>
                (m.commands ?? []).map((c) => (
                  <Command.Item key={`${m.id}.${c.id}`} value={`${tDynamic(c.titleKey)} ${tDynamic(m.titleKey)}`} onSelect={run(() => c.run(ctx))} className={item}>
                    {c.icon ? <c.icon size={15} className="text-dim" /> : <ArrowRight size={15} className="text-dim" />}
                    <span className="flex-1">{tDynamic(c.titleKey)}</span>
                    <span className="annot">{tDynamic(m.titleKey)}</span>
                    {c.shortcut && <Kbd>{c.shortcut}</Kbd>}
                  </Command.Item>
                )),
              )}
            </Command.Group>
          )}

          <Command.Group heading={t("palette.accounts")} >
            {accounts
              .filter((a) => a.id !== active)
              .map((a) => (
                <Command.Item key={a.id} value={`switch account ${a.login}`} onSelect={run(() => void switchAccount(a.id))} className={item}>
                  <UserRound size={15} className="text-dim" />
                  {t("palette.switchTo", { login: a.login })}
                </Command.Item>
              ))}
            <Command.Item value="add account" onSelect={run(() => setAdding(true))} className={item}>
              <Plus size={15} className="text-dim" />
              {t("account.add")}
            </Command.Item>
          </Command.Group>

          <Command.Group heading={t("palette.preferences")} >
            <Command.Item value="toggle theme dark light" onSelect={run(() => settings.set({ theme: settings.theme === "light" ? "dark" : "light" }))} className={item}>
              <Moon size={15} className="text-dim" />
              {t("palette.toggleTheme")}
            </Command.Item>
            <Command.Item value="back fold sheet" onSelect={run(() => useSheets.getState().pop())} className={item}>
              <ArrowLeft size={15} className="text-dim" />
              {t("palette.back")}
              <span className="flex-1" />
              <Kbd>Esc</Kbd>
            </Command.Item>
            {languages.map((l) => (
              <Command.Item key={l} value={`language ${languageName(l)} ${l}`} onSelect={run(() => setLanguage(l))} className={item}>
                <Languages size={15} className="text-dim" />
                {t("palette.language", { name: languageName(l) })}
              </Command.Item>
            ))}
            <Command.Item value="keyboard shortcuts help" onSelect={run(() => setUi({ shortcutsOpen: true }))} className={item}>
              <Keyboard size={15} className="text-dim" />
              {t("shell.shortcuts")}
              <span className="flex-1" />
              <Kbd>?</Kbd>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>,
    document.body,
  );
}
