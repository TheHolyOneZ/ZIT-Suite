import { useTranslation } from "react-i18next";
import { ExternalLink, Layers, Plus, Trash2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { SheetParams } from "@/core/sheets/store";
import { sheets } from "@/core/sheets/store";
import { Button, EmptyState, IconButton, Mark } from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { useSecretsIndex } from "./api";
import { configKey, configOf } from "./model";
import { RuleSummary } from "./shared";
import { useSecretsUi } from "./store";


export function EnvSheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["secrets", "common"]);
  const name = String(params.name);
  const { index } = useSecretsIndex();
  const setUi = useSecretsUi((s) => s.set);
  const g = index.environments.find((x) => x.name === name);
  if (!g) return <EmptyState title={t("gone")} />;
  const repos = g.repos.map((r) => r.repo);
  const base = configOf(g.repos[0].env);
  const baseKey = configKey(base);
  const remove = (rs: string[]) =>
    useQueue.getState().requestRun(rs.map((repo) => ({ repo, action: { kind: "env_delete", name } })));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-line-strong bg-surface px-6 pt-5 pb-4">
        <div className="annot">{t("env.kicker")}</div>
        <h2 className="num truncate text-[19px] font-semibold">{name}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[12px] text-dim">
          <span>{t("places", { count: g.repos.length })}</span>
          <span className={g.configs > 1 ? "flex items-center gap-1 text-warn" : "flex items-center gap-1"}>
            <Mark glyph={g.configs > 1 ? "warn" : "equal"} tone={g.configs > 1 ? "warn" : "idle"} size={11} />
            {g.configs > 1 ? t("env.drift") : t("env.same")}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="primary"
            icon={Layers}
            onClick={() => setUi({ env: { name, config: base, repos, fixed: true } })}
          >
            {t("env.configure")}
          </Button>
          <Button icon={Plus} onClick={() => setUi({ env: { name, config: base, repos: [] } })}>
            {t("env.add")}
          </Button>
          <Button variant="danger" icon={Trash2} onClick={() => remove(repos)}>
            {t("env.deleteAll")}
          </Button>
        </div>
      </header>
      {g.repos.map((r) => {
        const differs = configKey(configOf(r.env)) !== baseKey;
        return (
          <div
            key={r.repo}
            className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_170px_60px] items-center gap-3 border-b border-line px-4 py-2 hover:bg-surface-2"
          >
            <button
              onClick={() => sheets.push("secrets", "repo", { repo: r.repo, title: r.repo.split("/")[1] })}
              className="flex min-w-0 cursor-default items-center gap-2 text-left"
            >
              <Mark glyph={differs ? "warn" : "block"} tone={differs ? "warn" : "info"} size={11} />
              <span className="num truncate text-[12.5px] hover:text-accent">{r.repo}</span>
            </button>
            <RuleSummary env={r.env} />
            <span className="num text-right text-[11px] whitespace-nowrap text-faint">
              {t("rules.secrets", { count: r.secrets })} · {t("rules.variables", { count: r.variables })}
            </span>
            <span className="flex justify-end">
              <IconButton
                icon={ExternalLink}
                label={t("env.open")}
                size={13}
                className="size-7"
                onClick={() =>
                  openUrl(r.env.html_url || `https://github.com/${r.repo}/settings/environments`)
                }
              />
              <IconButton
                icon={Trash2}
                label={t("env.delete")}
                size={13}
                className="size-7 hover:text-danger"
                onClick={() => remove([r.repo])}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}
