import { useTranslation } from "react-i18next";
import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { languageName, languages } from "@/core/i18n";
import { useSettings, type ThemeMode } from "@/core/store/settings";
import { IconButton, MenuItem, Popover } from "@/ui";

const nextTheme: Record<ThemeMode, ThemeMode> = { system: "dark", dark: "light", light: "system" };
const themeIcon = { system: Monitor, dark: Moon, light: Sun };

export function useSetLanguage() {
  const { i18n } = useTranslation();
  const set = useSettings((s) => s.set);
  return (lng: string) => {
    set({ language: lng });
    void i18n.changeLanguage(lng);
  };
}

export function LanguageThemeControls() {
  const { t, i18n } = useTranslation();
  const theme = useSettings((s) => s.theme);
  const set = useSettings((s) => s.set);
  const setLanguage = useSetLanguage();

  return (
    <div className="flex items-center gap-1">
      <Popover
        placement="bottom-end"
        trigger={(p) => <IconButton {...p} icon={Languages} label={t("shell.language")} />}
      >
        {(close) =>
          languages.map((l) => (
            <MenuItem
              key={l}
              active={i18n.language === l}
              trailing={<span className="num text-[10.5px] text-faint uppercase">{l}</span>}
              onClick={() => {
                setLanguage(l);
                close();
              }}
            >
              {languageName(l)}
            </MenuItem>
          ))
        }
      </Popover>
      <IconButton icon={themeIcon[theme]} label={t(`theme.${theme}`)} onClick={() => set({ theme: nextTheme[theme] })} />
    </div>
  );
}
