import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { Braces, Eye, EyeOff, FileUp, KeyRound } from "lucide-react";
import { commands, unwrap, type NewQueueItem } from "@/core/ipc";
import { toastError } from "@/core/errors";
import { cn } from "@/core/cn";
import { Button, Checkbox, Dialog, IconButton, Input, Label } from "@/ui";
import { RepoChecklist } from "@/app/RepoChecklist";
import { useQueue } from "@/modules/queue/store";
import { useSecretTargets } from "./api";
import { placeKey, scopeOf, validName, type Place } from "./model";
import { PlaceLabel } from "./shared";
import { useSecretsUi } from "./store";


export function ValueDialog() {
  const { t } = useTranslation(["secrets", "common"]);
  const req = useSecretsUi((s) => s.value);
  const set = useSecretsUi((s) => s.set);
  const targets = useSecretTargets();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [multiline, setMultiline] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [env, setEnv] = useState("");
  const [repos, setRepos] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [tried, setTried] = useState(false);
  const secret = req?.kind === "secret";

  useEffect(() => {

    setName(req?.name ?? "");
    setValue(req?.value ?? "");
    setMultiline((req?.value ?? "").includes("\n"));
    setReveal(false);
    setEnv(req?.env ?? "");
    setRepos(new Set(req?.repos ?? []));
    setPicked(new Set((req?.places ?? []).map(placeKey)));
    setTried(false);
  }, [req]);

  const nameOk = validName(name.trim());
  const places: Place[] = req?.places
    ? req.places.filter((p) => picked.has(placeKey(p)))
    : [...repos].map((repo) => ({ repo, env: env.trim() || null }));
  const close = () => set({ value: null });
  const submit = () => {
    setTried(true);
    if (!nameOk || (secret && !value) || places.length === 0) return;
    const n = name.trim().toUpperCase();
    const items: NewQueueItem[] = places.map((p) => ({
      repo: p.repo,
      action: secret
        ? { kind: "secret_set", scope: scopeOf(p), name: n, value }
        : { kind: "var_set", scope: scopeOf(p), name: n, value },
    }));
    close();
    useQueue.getState().requestRun(items);
  };
  const loadFile = async () => {
    const path = await open({ multiple: false, directory: false });
    if (typeof path !== "string") return;
    try {
      setValue(await unwrap(commands.readSecretFile(path)));
      setMultiline(true);
    } catch (e) {
      toastError(e);
    }
  };
  const togglePlace = (k: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });


  const masked = secret && !reveal;
  return (
    <Dialog
      open={!!req}
      onClose={close}
      width={req?.places ? 640 : 920}
      kicker={t("title")}
      title={secret ? t("dialog.secretTitle") : t("dialog.variableTitle")}
      footer={
        <>
          <span className="num mr-auto text-[11.5px] text-faint">
            {t("dialog.summary", { count: places.length })}
          </span>
          <Button variant="ghost" onClick={close}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={secret ? KeyRound : Braces}
            disabled={places.length === 0}
            onClick={submit}
          >
            {t("dialog.submit")}
          </Button>
        </>
      }
    >
      <div className={cn("gap-6", req?.places ? "space-y-4" : "grid grid-cols-2")}>
        <div className="space-y-4">
          <div>
            <Label
              hint={
                tried && !nameOk ? (
                  <span className="text-danger">{t("dialog.nameInvalid")}</span>
                ) : (
                  t("dialog.nameHint")
                )
              }
            >
              {t("dialog.name")}
            </Label>
            <Input
              autoFocus={!req?.name}
              value={name}
              readOnly={!!req?.name}
              onChange={(e) => setName(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
              placeholder="NPM_TOKEN"
              className={cn("num", tried && !nameOk && "!border-danger", req?.name && "opacity-70")}
            />
          </div>
          <div>
            <Label
              hint={
                tried && secret && !value ? (
                  <span className="text-danger">{t("dialog.valueRequired")}</span>
                ) : undefined
              }
            >
              {t("dialog.value")}
            </Label>
            {multiline ? (
              <textarea
                autoFocus={!!req?.name}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={6}
                spellCheck={false}
                className="num w-full resize-y rounded-[var(--radius)] border border-line-strong bg-surface px-2.5 py-2 text-[12px] outline-none focus:border-accent"
                style={masked ? ({ WebkitTextSecurity: "disc" } as React.CSSProperties) : undefined}
              />
            ) : (
              <Input
                autoFocus={!!req?.name}
                type={masked ? "password" : "text"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoComplete="off"
                className="num"
                trailing={
                  secret ? (
                    <IconButton
                      icon={reveal ? EyeOff : Eye}
                      label={t("dialog.reveal")}
                      size={13}
                      className="size-6"
                      onClick={() => setReveal(!reveal)}
                    />
                  ) : undefined
                }
              />
            )}
            <div className="mt-1.5 flex items-center gap-3">
              <Checkbox
                checked={multiline}
                onChange={setMultiline}
                label={<span className="text-[12px]">{t("dialog.multiline")}</span>}
              />
              {multiline && secret && (
                <Checkbox
                  checked={reveal}
                  onChange={setReveal}
                  label={<span className="text-[12px]">{t("dialog.reveal")}</span>}
                />
              )}
              <Button size="sm" variant="ghost" icon={FileUp} className="ml-auto" onClick={loadFile}>
                {t("dialog.fromFile")}
              </Button>
            </div>
            {secret && <p className="mt-2 text-[11.5px] text-faint">{t("dialog.secretHint")}</p>}
          </div>
          {!req?.places && (
            <div>
              <Label hint={t("dialog.envHint")}>{t("dialog.env")}</Label>
              <Input
                value={env}
                onChange={(e) => setEnv(e.target.value)}
                placeholder="production"
                className="num"
              />
            </div>
          )}
        </div>
        {req?.places ? (
          <div>
            <div className="annot mb-2">{t("dialog.applies")}</div>
            <div className="max-h-[260px] overflow-y-auto rounded-[var(--radius)] border border-line p-1">
              {req.places.map((p) => (
                <button
                  key={placeKey(p)}
                  type="button"
                  onClick={() => togglePlace(placeKey(p))}
                  className="flex h-8 w-full cursor-default items-center gap-2 rounded-[3px] px-2 text-left hover:bg-surface-2"
                >
                  <Checkbox checked={picked.has(placeKey(p))} onChange={() => togglePlace(placeKey(p))} />
                  <PlaceLabel place={p} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <RepoChecklist
            repos={targets}
            value={repos}
            onChange={setRepos}
            title={t("dialog.targets")}
            height={430}
          />
        )}
      </div>
    </Dialog>
  );
}
