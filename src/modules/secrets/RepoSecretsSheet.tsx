import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Braces, ExternalLink, KeyRound, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { SecretMeta, Variable } from "@/core/ipc";
import { errorMessage } from "@/core/errors";
import type { SheetParams } from "@/core/sheets/store";
import { Button, EmptyState, IconButton, Panel, Plotter, RelTime } from "@/ui";
import { useQueue } from "@/modules/queue/store";
import { useRepoSecrets } from "./api";
import { configOf, scopeOf, type Place } from "./model";
import { RuleSummary } from "./shared";
import { useSecretsUi } from "./store";


export function RepoSecretsSheet({ params }: { params: SheetParams }) {
  const { t } = useTranslation(["secrets", "common"]);
  const repo = String(params.repo);
  const { data, isLoading, error } = useRepoSecrets(repo);
  const setUi = useSecretsUi((s) => s.set);
  if (isLoading) return <Plotter />;
  if (error || !data) return <EmptyState title={errorMessage(error)} />;
  if (data.error) return <EmptyState title={errorMessage(data.error)} />;
  const here: Place = { repo, env: null };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-line-strong bg-surface px-6 pt-5 pb-4">
        <div className="min-w-[200px] flex-1">
          <div className="annot">{t("repo.kicker")}</div>
          <h2 className="num truncate text-[19px] font-semibold">{repo}</h2>
        </div>
        <IconButton
          icon={ExternalLink}
          label="GitHub"
          onClick={() => openUrl(`https://github.com/${repo}/settings/secrets/actions`)}
        />
      </header>
      <div className="space-y-4 p-4">
        <Block
          title={t("repo.secrets")}
          action={
            <Button
              size="sm"
              icon={KeyRound}
              onClick={() => setUi({ value: { kind: "secret", repos: [repo] } })}
            >
              {t("repo.addSecret")}
            </Button>
          }
        >
          <SecretRows place={here} secrets={data.secrets} />
        </Block>
        <Block
          title={t("repo.variables")}
          action={
            <Button
              size="sm"
              icon={Braces}
              onClick={() => setUi({ value: { kind: "variable", repos: [repo] } })}
            >
              {t("repo.addVariable")}
            </Button>
          }
        >
          <VariableRows place={here} variables={data.variables} />
        </Block>
        <Block
          title={t("repo.environments")}
          action={
            <Button size="sm" icon={Layers} onClick={() => setUi({ env: { repos: [repo] } })}>
              {t("repo.addEnv")}
            </Button>
          }
        >
          {data.environments.length === 0 && <None />}
          {data.environments.map(({ env, secrets, variables }) => {
            const place: Place = { repo, env: env.name };
            return (
              <div key={env.name} className="border-b border-line last:border-b-0">
                <div className="flex flex-wrap items-center gap-2 bg-surface-2 px-3 py-2">
                  <Layers size={13} className="text-info" />
                  <span className="num text-[12.5px] font-medium">{env.name}</span>
                  <span className="min-w-0 flex-1">
                    <RuleSummary env={env} />
                  </span>
                  <IconButton
                    icon={Pencil}
                    label={t("env.configure")}
                    size={13}
                    className="size-7"
                    onClick={() =>
                      setUi({ env: { name: env.name, config: configOf(env), repos: [repo], fixed: true } })
                    }
                  />
                  <IconButton
                    icon={KeyRound}
                    label={t("repo.addSecret")}
                    size={13}
                    className="size-7"
                    onClick={() => setUi({ value: { kind: "secret", repos: [repo], env: env.name } })}
                  />
                  <IconButton
                    icon={Plus}
                    label={t("repo.addVariable")}
                    size={13}
                    className="size-7"
                    onClick={() => setUi({ value: { kind: "variable", repos: [repo], env: env.name } })}
                  />
                  <IconButton
                    icon={Trash2}
                    label={t("env.delete")}
                    size={13}
                    className="size-7 hover:text-danger"
                    onClick={() =>
                      useQueue
                        .getState()
                        .requestRun([{ repo, action: { kind: "env_delete", name: env.name } }])
                    }
                  />
                </div>
                <div className="pl-5">
                  <SecretRows place={place} secrets={secrets} quiet />
                  <VariableRows place={place} variables={variables} quiet />
                </div>
              </div>
            );
          })}
        </Block>
      </div>
    </div>
  );
}

function Block({ title, action, children }: { title: string; action: ReactNode; children: ReactNode }) {
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="annot">{title}</span>
        {action}
      </div>
      {children}
    </Panel>
  );
}

function None() {
  const { t } = useTranslation("secrets");
  return <div className="px-3 py-2.5 text-[12px] text-faint">{t("repo.none")}</div>;
}

function SecretRows({ place, secrets, quiet }: { place: Place; secrets: SecretMeta[]; quiet?: boolean }) {
  const { t } = useTranslation("secrets");
  const setUi = useSecretsUi((s) => s.set);
  if (!secrets.length) return quiet ? null : <None />;
  return secrets.map((s) => (
    <div
      key={s.name}
      className="grid grid-cols-[18px_minmax(0,1fr)_130px_60px] items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0"
    >
      <KeyRound size={12} className="text-faint" />
      <span className="num truncate text-[12.5px]">{s.name}</span>
      <span className="text-right text-[11px] text-faint">
        <RelTime at={s.updated_at} />
      </span>
      <span className="flex justify-end">
        <IconButton
          icon={Pencil}
          label={t("secret.rotate")}
          size={12}
          className="size-6"
          onClick={() => setUi({ value: { kind: "secret", name: s.name, places: [place] } })}
        />
        <IconButton
          icon={Trash2}
          label={t("secret.remove")}
          size={12}
          className="size-6 hover:text-danger"
          onClick={() =>
            useQueue
              .getState()
              .requestRun([
                { repo: place.repo, action: { kind: "secret_delete", scope: scopeOf(place), name: s.name } },
              ])
          }
        />
      </span>
    </div>
  ));
}

function VariableRows({ place, variables, quiet }: { place: Place; variables: Variable[]; quiet?: boolean }) {
  const { t } = useTranslation("secrets");
  const setUi = useSecretsUi((s) => s.set);
  if (!variables.length) return quiet ? null : <None />;
  return variables.map((v) => (
    <div
      key={v.name}
      className="grid grid-cols-[18px_minmax(0,0.8fr)_minmax(0,1fr)_60px] items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0"
    >
      <Braces size={12} className="text-faint" />
      <span className="num truncate text-[12.5px]">{v.name}</span>
      <span className="num truncate text-[12px] text-dim" title={v.value}>
        {v.value}
      </span>
      <span className="flex justify-end">
        <IconButton
          icon={Pencil}
          label={t("variable.edit")}
          size={12}
          className="size-6"
          onClick={() =>
            setUi({ value: { kind: "variable", name: v.name, value: v.value, places: [place] } })
          }
        />
        <IconButton
          icon={Trash2}
          label={t("variable.remove")}
          size={12}
          className="size-6 hover:text-danger"
          onClick={() =>
            useQueue
              .getState()
              .requestRun([
                { repo: place.repo, action: { kind: "var_delete", scope: scopeOf(place), name: v.name } },
              ])
          }
        />
      </span>
    </div>
  ));
}
