import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, LogOut, Monitor, Moon, Plus, Sun, TriangleAlert } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import logo from "@/assets/logo.png";
import { cn } from "@/core/cn";
import { toastError } from "@/core/errors";
import { commands, unwrap, type TrayPrefs } from "@/core/ipc";
import { languageName, languages, tDynamic } from "@/core/i18n";
import { formatDate } from "@/core/i18n/format";
import { allModules, useEnabledModules } from "@/core/modules/registry";
import type { ModuleManifest, ModuleSettingField } from "@/core/modules/types";
import { useSession } from "@/core/store/session";
import { ACCENT_PRESETS, useSettings } from "@/core/store/settings";

import {
  Avatar,
  Badge,
  Button,
  Input,
  PageHeader,
  Panel,
  Segmented,
  Select,
  Toggle,
  useConfirmClick,
} from "@/ui";
import { useSetLanguage } from "@/app/LanguageThemeControls";
import { missingScopes, signOut, switchAccount } from "@/modules/auth/api";
import { useSettingsNav } from "./sections";
import { SettingsIndex } from "./SettingsPanel";

export function SettingsPage() {
  const { t } = useTranslation(["settings", "common"]);
  const go = useSettingsNav((s) => s.go);
  const modulesWithSettings = useEnabledModules().filter((m) => m.settings?.length);

  return (
    <div className="flex h-full flex-col">
      <PageHeader kicker={t("kicker")} title={t("title")} meta={t("meta")} />
      <SettingsIndex />
      <div
        className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
        onScroll={(e) => {
          const top = e.currentTarget.getBoundingClientRect().top;
          const sections = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-section]")];
          const el = e.currentTarget;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;

          const current = atBottom
            ? sections.at(-1)
            : (sections.findLast((s) => s.getBoundingClientRect().top - top < 120) ?? sections[0]);
          if (current) useSettingsNav.setState({ section: current.dataset.section! });
        }}
      >
        <div className="mx-auto max-w-[820px] space-y-6 pb-24">
          <Appearance />
          <Language />
          <Accounts />
          <QueueSettings />
          <Background />
          <Notifications />
          <Modules onJump={go} />
          {modulesWithSettings.map((m) => (
            <ModuleSection key={m.id} m={m} />
          ))}
          <About />
        </div>
      </div>
    </div>
  );
}

function Block({
  id,
  title,
  desc,
  children,
}: {
  id: string;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section id={`settings-${id}`} data-section={id} className="scroll-mt-4">
      <Panel ticks>
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {desc && <p className="mt-0.5 text-[12px] text-dim">{desc}</p>}
        </div>
        <div className="divide-y divide-[var(--line)]">{children}</div>
      </Panel>
    </section>
  );
}

function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-3.5">
      <div className="min-w-0">
        <div className="text-[13px]">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] text-dim">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Appearance() {
  const { t } = useTranslation(["settings", "common"]);
  const theme = useSettings((s) => s.theme);
  const accent = useSettings((s) => s.accent);
  const set = useSettings((s) => s.set);
  return (
    <Block id="appearance" title={t("sections.appearance.title")} desc={t("sections.appearance.desc")}>
      <Row label={t("appearance.theme")}>
        <Segmented
          value={theme}
          onChange={(v) => set({ theme: v })}
          options={[
            { value: "system", label: t("common:theme.system"), icon: Monitor },
            { value: "dark", label: t("common:theme.dark"), icon: Moon },
            { value: "light", label: t("common:theme.light"), icon: Sun },
          ]}
        />
      </Row>
      <Row label={t("appearance.accent")} hint={t("appearance.accentHint")}>
        <div className="flex items-center gap-2">
          {ACCENT_PRESETS.map((p) => (
            <button
              key={p.id}
              title={t(`appearance.accents.${p.id}`)}
              onClick={() => set({ accent: p.value })}
              className={cn(
                "flex size-6 items-center justify-center rounded-[3px] border cursor-default",
                accent === p.value ? "border-text" : "border-transparent",
              )}
              style={{ background: p.value }}
            >
              {accent === p.value && <Check size={12} color="#000" strokeWidth={3} />}
            </button>
          ))}
          <label
            className="relative ml-1 flex size-6 cursor-default items-center justify-center overflow-hidden rounded-[3px] border border-dashed border-line-strong"
            title={t("appearance.custom")}
          >
            <Plus size={12} className="text-dim" />
            <input
              type="color"
              value={accent}
              onChange={(e) => set({ accent: e.target.value })}
              className="absolute inset-0 opacity-0"
            />
          </label>
          <span className="num w-[70px] text-[11px] text-faint uppercase">{accent}</span>
        </div>
      </Row>
    </Block>
  );
}

function Language() {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const setLanguage = useSetLanguage();
  return (
    <Block id="language" title={t("sections.language.title")} desc={t("sections.language.desc")}>
      <div className="grid grid-cols-2 gap-2 p-4">
        {languages.map((l) => (
          <button
            key={l}
            onClick={() => setLanguage(l)}
            className={cn(
              "flex items-center gap-3 rounded-[var(--radius)] border px-3 py-2.5 text-left cursor-default",
              i18n.language === l ? "border-accent bg-surface-2" : "border-line hover:border-line-strong",
            )}
          >
            <span className="num w-7 text-[11px] text-faint uppercase">{l}</span>
            <span className="flex-1 text-[13px]">{languageName(l)}</span>
            {i18n.language === l && <Check size={14} className="text-accent" />}
          </button>
        ))}
      </div>
      <div className="px-5 py-3 text-[12px] text-dim">{t("language.contribute")}</div>
    </Block>
  );
}

function Accounts() {
  const { t } = useTranslation(["settings", "common"]);
  const session = useSession((s) => s.session);
  const setAdding = useSession((s) => s.setAddingAccount);
  const required = [...new Set(allModules.flatMap((m) => m.requiredScopes ?? []))];
  const run = (fn: () => Promise<void>) => fn().catch((e) => toastError(e));

  return (
    <Block id="accounts" title={t("sections.accounts.title")} desc={t("sections.accounts.desc")}>
      {session?.accounts.map((a) => {
        const active = a.id === session.active;
        const missing = missingScopes(a.scopes, required);
        return (
          <div key={a.id} className="flex items-center gap-3 px-5 py-3.5">
            <Avatar src={a.avatar_url} alt={a.login} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium">{a.name ?? a.login}</span>
                <span className="num text-[11.5px] text-faint">@{a.login}</span>
                {active && (
                  <Badge tone="ok" mono>
                    {t("accounts.active")}
                  </Badge>
                )}
                <Badge mono>{t(`accounts.method.${a.method}`)}</Badge>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11.5px] text-dim">
                {a.scopes === null ? (
                  <span>{t("accounts.fineGrained")}</span>
                ) : missing && missing.length > 0 ? (
                  <span className="flex items-center gap-1 text-warn">
                    <TriangleAlert size={12} /> {t("accounts.missingScopes", { scopes: missing.join(", ") })}
                  </span>
                ) : (
                  <span>{t("accounts.scopesOk")}</span>
                )}
                <span className="text-faint">· {t("accounts.added", { date: formatDate(a.added_at) })}</span>
              </div>
            </div>
            {!active && (
              <Button size="sm" onClick={() => run(() => switchAccount(a.id))}>
                {t("accounts.switch")}
              </Button>
            )}
            <SignOutButton onConfirm={() => run(() => signOut(a.id))} />
          </div>
        );
      })}
      <div className="px-5 py-3">
        <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
          {t("common:account.add")}
        </Button>
      </div>
    </Block>
  );
}

function SignOutButton({ onConfirm }: { onConfirm: () => void }) {
  const { t } = useTranslation(["settings", "common"]);
  const { armed, onClick } = useConfirmClick(onConfirm);
  return (
    <Button size="sm" variant="danger" icon={LogOut} onClick={onClick}>
      {armed ? t("common:account.confirmSignOut") : t("accounts.signOut")}
    </Button>
  );
}

function QueueSettings() {
  const { t } = useTranslation(["settings", "common"]);
  const grace = useSettings((s) => s.graceSeconds);
  const typeToConfirm = useSettings((s) => s.typeToConfirmDelete);
  const set = useSettings((s) => s.set);
  return (
    <Block id="queue" title={t("sections.queue.title")} desc={t("sections.queue.desc")}>
      <Row label={t("queue.grace")} hint={t("queue.graceHint")}>
        <div className="w-24">
          <Input
            type="number"
            min={0}
            max={120}
            value={grace}
            onChange={(e) => set({ graceSeconds: Math.max(0, Math.min(120, Number(e.target.value) || 0)) })}
            className="num text-right"
          />
        </div>
      </Row>
      <Row label={t("queue.typeToConfirm")} hint={t("queue.typeToConfirmHint")}>
        <Toggle checked={typeToConfirm} onChange={(v) => set({ typeToConfirmDelete: v })} />
      </Row>
    </Block>
  );
}


function Background() {
  const { t } = useTranslation("settings");
  const [prefs, setPrefs] = useState<TrayPrefs | null>(null);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  useEffect(() => {
    void commands.trayGetPrefs().then(setPrefs);
    void unwrap(commands.autostartGet()).then(setAutostart, () => setAutostart(false));
  }, []);
  const save = async (p: TrayPrefs) => {
    setPrefs(p);
    try {
      await unwrap(commands.traySetPrefs(p));
    } catch (e) {
      toastError(e);
    }
  };
  const login = async (on: boolean) => {
    setAutostart(on);
    try {
      await unwrap(commands.autostartSet(on));
    } catch (e) {
      setAutostart(!on);
      toastError(e);
    }
  };
  if (!prefs) return null;
  return (
    <Block id="background" title={t("sections.background.title")} desc={t("sections.background.desc")}>
      <Row label={t("background.closeToTray")} hint={t("background.closeToTrayHint")}>
        <Toggle checked={prefs.close_to_tray} onChange={(v) => void save({ ...prefs, close_to_tray: v })} />
      </Row>
      <Row label={t("background.login")} hint={t("background.loginHint")}>
        <Toggle checked={!!autostart} disabled={autostart === null} onChange={(v) => void login(v)} />
      </Row>
      <Row label={t("background.startHidden")} hint={t("background.startHiddenHint")}>
        <Toggle
          checked={prefs.start_hidden}
          disabled={!autostart}
          onChange={(v) => void save({ ...prefs, start_hidden: v })}
        />
      </Row>
    </Block>
  );
}

function Notifications() {
  const { t } = useTranslation(["settings", "common"]);
  const s = useSettings();
  return (
    <Block
      id="notifications"
      title={t("sections.notifications.title")}
      desc={t("sections.notifications.desc")}
    >
      <Row label={t("notifications.desktop")}>
        <Toggle checked={s.desktopNotifications} onChange={(v) => s.set({ desktopNotifications: v })} />
      </Row>
      <Row label={t("notifications.onFinish")}>
        <Toggle checked={s.notifyOnFinish} onChange={(v) => s.set({ notifyOnFinish: v })} />
      </Row>
      <Row label={t("notifications.onFailure")}>
        <Toggle checked={s.notifyOnFailure} onChange={(v) => s.set({ notifyOnFailure: v })} />
      </Row>
    </Block>
  );
}

function Modules({ onJump }: { onJump: (s: string) => void }) {
  const { t } = useTranslation(["settings", "common"]);
  const disabled = useSettings((s) => s.disabledModules);
  const toggle = useSettings((s) => s.toggleModule);
  const visible = allModules.filter((m) => !m.hidden);
  return (
    <Block id="modules" title={t("sections.modules.title")} desc={t("sections.modules.desc")}>
      {visible.map((m) => (
        <div key={m.id} className="flex items-center gap-3 px-5 py-3">
          <span className="flex size-8 items-center justify-center rounded-[var(--radius)] border border-line text-dim">
            <m.icon size={15} />
          </span>
          <div className="flex-1">
            <div className="text-[13px]">{tDynamic(m.titleKey)}</div>
            <div className="annot !text-[9.5px]">{t(`common:pillars.${m.pillar}`)}</div>
          </div>
          {m.settings?.length && !disabled.includes(m.id) ? (
            <Button size="sm" variant="ghost" onClick={() => onJump(`module-${m.id}`)}>
              {t("modules.configure")}
            </Button>
          ) : null}
          {m.required ? (
            <Badge mono>{t("modules.core")}</Badge>
          ) : (
            <Toggle
              checked={!disabled.includes(m.id)}
              onChange={() => toggle(m.id)}
              label={tDynamic(m.titleKey)}
            />
          )}
        </div>
      ))}
      <div className="px-5 py-3 text-[12px] text-dim">{t("modules.more")}</div>
    </Block>
  );
}

function ModuleSection({ m }: { m: ModuleManifest }) {
  return (
    <Block id={`module-${m.id}`} title={tDynamic(m.titleKey)}>
      {m.settings!.map((f) => (
        <ModuleField key={f.key} moduleId={m.id} field={f} />
      ))}
    </Block>
  );
}

function ModuleField({ moduleId, field }: { moduleId: string; field: ModuleSettingField }) {
  const raw = useSettings((s) => s.moduleSettings[moduleId]?.[field.key]);
  const setValue = useSettings((s) => s.setModuleSetting);
  const value = raw ?? field.default;
  const set = (v: unknown) => setValue(moduleId, field.key, v);
  return (
    <Row label={tDynamic(field.labelKey)} hint={field.hintKey ? tDynamic(field.hintKey) : undefined}>
      {field.type === "number" ? (
        <div className="w-24">
          <Input
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={value as number}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isNaN(n)) set(Math.max(field.min ?? -Infinity, Math.min(field.max ?? Infinity, n)));
            }}
            className="num text-right"
          />
        </div>
      ) : field.type === "boolean" ? (
        <Toggle checked={value as boolean} onChange={set} />
      ) : (
        <div className="w-44">
          <Select value={value as string} onChange={(e) => set(e.target.value)}>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {tDynamic(o.labelKey)}
              </option>
            ))}
          </Select>
        </div>
      )}
    </Row>
  );
}

const REPO_URL = "https://github.com/TheHolyOneZ/ZIT-Suite";
const HOMEPAGE = "https://zsync.eu/zit-suite/";


function About() {
  const { t } = useTranslation("settings");
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);
  const link = (label: string, url: string) => (
    <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => void openUrl(url)}>
      {label}
    </Button>
  );
  return (
    <Block id="about" title={t("sections.about.title")} desc={t("sections.about.desc")}>
      <div className="flex items-center gap-4 px-5 py-4">
        <img src={logo} alt="" className="size-14 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[17px] font-semibold">ZIT-Suite</span>
            {version && <span className="num text-[12px] text-accent">v{version}</span>}
          </div>
          <div className="text-[12.5px] text-dim">{t("about.tagline")}</div>
        </div>
      </div>
      <Row label={t("about.author")}>
        <button
          className="num cursor-default text-[12.5px] hover:text-accent"
          onClick={() => void openUrl("https://github.com/TheHolyOneZ")}
        >
          TheHolyOneZ
        </button>
      </Row>
      <Row label={t("about.license")} hint={t("about.licenseHint")}>
        <button
          className="num cursor-default text-[12.5px] hover:text-accent"
          onClick={() => void openUrl("https://www.gnu.org/licenses/gpl-3.0.html")}
        >
          GPL-3.0
        </button>
      </Row>
      <Row label={t("about.builtWith")}>
        <span className="num text-[12px] text-dim">Tauri 2 · Rust · React 19 · TypeScript</span>
      </Row>
      <Row label={t("about.homepage")} hint={t("about.homepageHint")}>
        <button
          className="num cursor-default text-[12.5px] hover:text-accent"
          onClick={() => void openUrl(HOMEPAGE)}
        >
          zsync.eu/zit-suite
        </button>
      </Row>
      <Row label={t("about.more")} hint={t("about.moreHint")}>
        <span className="flex flex-col items-end gap-0.5">
          <button
            className="num cursor-default text-[12.5px] hover:text-accent"
            onClick={() => void openUrl("https://zsync.eu")}
          >
            zsync.eu <span className="text-faint">· {t("about.projects")}</span>
          </button>
          <button
            className="num cursor-default text-[12.5px] hover:text-accent"
            onClick={() => void openUrl("https://zlogic.eu")}
          >
            zlogic.eu <span className="text-faint">· {t("about.mods")}</span>
          </button>
        </span>
      </Row>
      <div className="flex flex-wrap gap-1 px-4 py-2.5">
        {link(t("about.homepage"), HOMEPAGE)}
        {link(t("about.download"), `${HOMEPAGE}#download`)}
        {link(t("about.source"), REPO_URL)}
        {link(t("about.issues"), `${REPO_URL}/issues`)}
      </div>
    </Block>
  );
}
