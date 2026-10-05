import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import type { Feature } from "@/core/ipc";
import { Button, Dialog, Label, Segmented } from "@/ui";
import { RepoChecklist } from "@/app/RepoChecklist";
import { useQueue } from "@/modules/queue/store";
import { useSecurityTargets } from "./api";
import { FEATURES } from "./model";
import { useSecurityUi } from "./store";


export function FeaturesDialog() {
  const { t } = useTranslation(["security", "common"]);
  const req = useSecurityUi((s) => s.features);
  const set = useSecurityUi((s) => s.set);
  const targets = useSecurityTargets();
  const [feature, setFeature] = useState<Feature>("dependabot_alerts");
  const [enabled, setEnabled] = useState(true);
  const [repos, setRepos] = useState<Set<string>>(new Set());
  useEffect(() => {
    setFeature(req?.feature ?? "dependabot_alerts");
    setEnabled(req?.enabled ?? true);
    setRepos(new Set(req?.repos ?? []));
  }, [req]);
  const close = () => set({ features: null });
  const submit = () => {
    close();
    useQueue
      .getState()
      .requestRun(
        [...repos].map((repo) => ({ repo, action: { kind: "security_feature", feature, enabled } })),
      );
  };
  return (
    <Dialog
      open={!!req}
      onClose={close}
      width={860}
      kicker={t("title")}
      title={t("featuresDialog.title")}
      footer={
        <>
          <span className="num mr-auto text-[11.5px] text-faint">{t("repos", { count: repos.size })}</span>
          <Button variant="ghost" onClick={close}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="primary" icon={ShieldCheck} disabled={!repos.size} onClick={submit}>
            {t("featuresDialog.submit")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label>{t("featuresDialog.feature")}</Label>
            <div className="space-y-1">
              {FEATURES.map((f) => (
                <label
                  key={f}
                  className="flex cursor-default items-start gap-2 rounded-[3px] px-2 py-1.5 hover:bg-surface-2"
                >
                  <input
                    type="radio"
                    name="feature"
                    checked={feature === f}
                    onChange={() => setFeature(f)}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="block text-[13px]">{t(`feature.${f}.name`)}</span>
                    <span className="block text-[11.5px] text-faint">{t(`feature.${f}.what`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label>{t("featuresDialog.switch")}</Label>
            <Segmented<"on" | "off">
              className="w-full"
              value={enabled ? "on" : "off"}
              onChange={(v) => setEnabled(v === "on")}
              options={[
                { value: "on", label: t("turnOn") },
                { value: "off", label: t("turnOff") },
              ]}
            />
          </div>
          <p className="text-[11.5px] text-faint">{t("featuresDialog.note")}</p>
        </div>
        <RepoChecklist
          repos={targets}
          value={repos}
          onChange={setRepos}
          title={t("featuresDialog.targets")}
          height={430}
        />
      </div>
    </Dialog>
  );
}
