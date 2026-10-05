import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, X } from "lucide-react";
import type { Repo } from "@/core/ipc";
import { Button, Dialog, IconButton, Input, Label, Segmented, Select, useConfirmClick } from "@/ui";
import {
  condComplete,
  FIELDS,
  newCond,
  OPS,
  toRule,
  type Cond,
  type CustomRule,
  type Field,
  type Op,
} from "./custom";
import type { FixKind, Severity } from "./model";
import { useInsights } from "./store";


export function RuleDialog({
  rule,
  repos,
  onClose,
}: {
  rule: CustomRule | null;
  repos: Repo[];
  onClose: () => void;
}) {
  const { t } = useTranslation("insights");
  const save = useInsights((s) => s.saveRule);
  const remove = useInsights((s) => s.deleteRule);
  const [name, setName] = useState(rule?.name ?? "");
  const [severity, setSeverity] = useState<Severity>(rule?.severity ?? "info");
  const [fix, setFix] = useState<FixKind | "">(rule?.fix ?? "");
  const [conds, setConds] = useState<Cond[]>(rule?.conds ?? [newCond()]);
  const draft: CustomRule = {
    id: rule?.id ?? `custom:${crypto.randomUUID()}`,
    name: name.trim(),
    severity,
    fix: fix || null,
    conds,
  };
  const hits = useMemo(() => {
    const r = toRule(draft);
    const now = Date.now();
    return repos.filter((x) => r.test(x, now));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos, conds]);
  const ok = !!draft.name && conds.length > 0 && conds.every(condComplete);
  const del = useConfirmClick(() => {
    if (rule) remove(rule.id);
    onClose();
  });
  const patch = (i: number, p: Partial<Cond>) =>
    setConds(conds.map((c, j) => (j === i ? { ...c, ...p } : c)));

  return (
    <Dialog
      open
      onClose={onClose}
      kicker={t("custom.kicker")}
      title={rule ? t("custom.edit") : t("custom.new")}
      width={640}
      footer={
        <>
          {rule && (
            <Button
              variant={del.armed ? "danger" : "ghost"}
              icon={Trash2}
              onClick={del.onClick}
            >
              {del.armed ? t("custom.confirmDelete") : t("custom.delete")}
            </Button>
          )}
          <span className="flex-1 text-[11.5px] text-dim">{t("custom.hits", { count: hits.length })}</span>
          <Button onClick={onClose}>{t("custom.cancel")}</Button>
          <Button variant="primary" disabled={!ok} onClick={() => (save(draft), onClose())}>
            {t("custom.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>{t("custom.name")}</Label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("custom.namePlaceholder")}
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <div>
            <Label>{t("custom.severity")}</Label>
            <Segmented<Severity>
              size="sm"
              value={severity}
              onChange={setSeverity}
              options={(["info", "warning", "critical"] as const).map((v) => ({
                value: v,
                label: t(`custom.sev.${v}`),
              }))}
            />
          </div>
          <div className="w-[220px]">
            <Label hint={t("custom.fixHint")}>{t("custom.fix")}</Label>
            <Select value={fix} onChange={(e) => setFix(e.target.value as FixKind | "")}>
              <option value="">{t("custom.noFix")}</option>
              <option value="archive">{t("custom.fixKind.archive")}</option>
              <option value="set_private">{t("custom.fixKind.set_private")}</option>
              <option value="delete">{t("custom.fixKind.delete")}</option>
            </Select>
          </div>
        </div>
        <div>
          <Label hint={t("custom.allHint")}>{t("custom.when")}</Label>
          <div className="space-y-1.5">
            {conds.map((c, i) => {
              const kind = FIELDS[c.field];
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-[200px]">
                    <Select value={c.field} onChange={(e) => patch(i, newCond(e.target.value as Field))}>
                      {(Object.keys(FIELDS) as Field[]).map((f) => (
                        <option key={f} value={f}>
                          {t(`custom.field.${f}`)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-[150px]">
                    <Select value={c.op} onChange={(e) => patch(i, { op: e.target.value as Op })}>
                      {OPS[kind].map((o) => (
                        <option key={o} value={o}>
                          {t(`custom.op.${o}`)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {kind !== "flag" && (
                    <Input
                      className="num flex-1"
                      value={c.value}
                      inputMode={kind === "number" ? "decimal" : undefined}
                      onChange={(e) => patch(i, { value: e.target.value })}
                      placeholder={kind === "number" ? "0" : ""}
                    />
                  )}
                  {kind === "flag" && <span className="flex-1" />}
                  <IconButton
                    icon={X}
                    label={t("custom.removeCond")}
                    size={12}
                    disabled={conds.length === 1}
                    onClick={() => setConds(conds.filter((_, j) => j !== i))}
                  />
                </div>
              );
            })}
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={Plus}
            className="mt-1.5"
            onClick={() => setConds([...conds, newCond()])}
          >
            {t("custom.addCond")}
          </Button>
        </div>
        {hits.length > 0 && (
          <div className="num max-h-[90px] overflow-y-auto text-[11.5px] text-faint">
            {hits
              .slice(0, 40)
              .map((r) => r.name)
              .join(" · ")}
            {hits.length > 40 && " …"}
          </div>
        )}
      </div>
    </Dialog>
  );
}


export function useDescribe() {
  const { t } = useTranslation("insights");
  return (conds: Cond[]) =>
    conds
      .filter(condComplete)
      .map(
        (c) =>
          `${t(`custom.field.${c.field}`)} ${t(`custom.op.${c.op}`)}${FIELDS[c.field] === "flag" ? "" : ` ${c.value.trim()}`}`,
      )
      .join(" · ");
}
