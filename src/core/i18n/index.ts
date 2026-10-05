import i18n from "i18next";
import { initReactI18next } from "react-i18next";

type Json = Record<string, unknown>;

const core = import.meta.glob<Json>("../../locales/*/*.json", { eager: true, import: "default" });
const modules = import.meta.glob<Json>("../../modules/*/locales/*.json", { eager: true, import: "default" });

const resources: Record<string, Record<string, Json>> = {};
const add = (lng: string, ns: string, data: Json) => {
  (resources[lng] ??= {})[ns] = data;
};

for (const [path, data] of Object.entries(core)) {
  const m = path.match(/locales\/([^/]+)\/([^/]+)\.json$/);
  if (m) add(m[1], m[2], data);
}
for (const [path, data] of Object.entries(modules)) {
  const m = path.match(/modules\/([^/]+)\/locales\/([^/]+)\.json$/);
  if (m) add(m[2], m[1], data);
}

export const FALLBACK_LANGUAGE = "en";
export const languages = Object.keys(resources).sort((a, b) =>
  a === FALLBACK_LANGUAGE ? -1 : b === FALLBACK_LANGUAGE ? 1 : a.localeCompare(b),
);
export const namespaces = Object.keys(resources[FALLBACK_LANGUAGE] ?? {});


export function languageName(lng: string): string {
  try {
    const name = new Intl.DisplayNames([lng], { type: "language" }).of(lng);
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : lng;
  } catch {
    return lng;
  }
}

export function detectLanguage(): string {
  const preferred = navigator.languages ?? [navigator.language];
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (languages.includes(base)) return base;
  }
  return FALLBACK_LANGUAGE;
}

export async function initI18n(lng: string) {
  await i18n.use(initReactI18next).init({
    resources,
    lng: languages.includes(lng) ? lng : FALLBACK_LANGUAGE,
    fallbackLng: FALLBACK_LANGUAGE,
    ns: namespaces,
    defaultNS: "common",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  document.documentElement.lang = i18n.language;
  i18n.on("languageChanged", (l) => (document.documentElement.lang = l));
  return i18n;
}


export function tDynamic(key: string, options?: Record<string, unknown>): string {
  return (i18n.t as unknown as (k: string, o?: Record<string, unknown>) => string)(key, options);
}

export default i18n;
