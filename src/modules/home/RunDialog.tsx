import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";
import { parse } from "yaml";
import { commands, unwrap, type Workflow } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { toast } from "@/core/store/toasts";
import { Button, Checkbox, Dialog, Input, Label, Plotter, Select } from "@/ui";
import { refreshGh } from "./ghapi";
import { dispatchInputs, type DispatchInput } from "./ghmodel";


export function RunDialog({
  repo,
  wf,
  branches,
  current,
  readLocal,
  onClose,
  onStarted,
}: {
  repo: string;
  wf: Workflow | null;
  branches: string[];
  current: string;
  readLocal?: (path: string) => Promise<string | null>;
  onClose: () => void;
  onStarted?: () => void;
}) {
  const { t } = useTranslation(["home", "common"]);
  const [ref, setRef] = useState(current);
  const [inputs, setInputs] = useState<DispatchInput[] | null | undefined>(undefined);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!wf) return;
    setRef(current);
    setInputs(undefined);
    setError(null);
    void (async () => {
      try {

        const local = readLocal ? await readLocal(wf.path).catch(() => null) : null;
        const text = local ?? (await unwrap(commands.actionsSource(repo, wf.path, null)));
        const found = dispatchInputs(parse(text));
        setInputs(found);
        setValues(
          Object.fromEntries(
            (found ?? []).map((i) => [
              i.name,
              i.default || (i.type === "choice" ? (i.options[0] ?? "") : ""),
            ]),
          ),
        );
      } catch (e) {
        setError(errorMessage(e));
        setInputs(null);
      }
    })();


    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wf]);

  if (!wf) return null;
  const missing = (inputs ?? []).filter((i) => i.required && !values[i.name]?.trim());
  const run = async () => {
    setBusy(true);
    try {
      await unwrap(commands.actionsDispatch(repo, wf.id, ref, values));
      toast({
        kind: "success",
        title: t("actionsTab.started", { name: wf.name }),
        body: t("actionsTab.startedBody"),
      });
      onClose();

      for (const ms of [2500, 7000])
        setTimeout(() => void refreshGh(repo, "actions").catch(() => undefined), ms);
      onStarted?.();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      width={520}
      kicker={wf.path}
      title={t("actionsTab.runTitle", { name: wf.name })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={Play}
            loading={busy}
            disabled={!inputs || missing.length > 0}
            onClick={() => void run()}
          >
            {t("actionsTab.run")}
          </Button>
        </>
      }
    >
      {inputs === undefined ? (
        <Plotter />
      ) : inputs === null ? (
        <p className="text-[12.5px] text-warn">{error ?? t("actionsTab.notManual")}</p>
      ) : (
        <div className="space-y-4">
          <div>
            <Label hint={t("actionsTab.branchHint")}>{t("actionsTab.branch")}</Label>
            <Select value={ref} onChange={(e) => setRef(e.target.value)}>
              {(branches.includes(ref) ? branches : [ref, ...branches]).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </div>
          {inputs.length === 0 && <p className="text-[12px] text-faint">{t("actionsTab.noInputs")}</p>}
          {inputs.map((i) => (
            <div key={i.name}>
              {i.type === "boolean" ? (
                <Checkbox
                  checked={values[i.name] === "true"}
                  onChange={(v) => setValues({ ...values, [i.name]: String(v) })}
                  label={
                    <span>
                      <span className="num text-[12.5px]">{i.name}</span>
                      {i.description && (
                        <span className="block text-[11.5px] text-faint">{i.description}</span>
                      )}
                    </span>
                  }
                />
              ) : (
                <>
                  <Label hint={i.description || undefined}>
                    <span className="num normal-case">{i.name}</span>
                    {i.required && <span className="text-danger"> *</span>}
                  </Label>
                  {i.type === "choice" ? (
                    <Select
                      value={values[i.name] ?? ""}
                      onChange={(e) => setValues({ ...values, [i.name]: e.target.value })}
                    >
                      {i.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      type={i.type === "number" ? "number" : "text"}
                      value={values[i.name] ?? ""}
                      onChange={(e) => setValues({ ...values, [i.name]: e.target.value })}
                    />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
