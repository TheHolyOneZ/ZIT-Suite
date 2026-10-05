import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Download, FolderOpen } from "lucide-react";
import { commands, events, unwrap, type ExportKinds, type ExportReport } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { toast } from "@/core/store/toasts";
import { Button, Checkbox, Dialog, Input, Label, Meter } from "@/ui";
import { useReposUi } from "./store";

export function ExportDialog() {
  const { t } = useTranslation(["repos", "common"]);
  const repos = useReposUi((s) => s.exportFor);
  const set = useReposUi((s) => s.set);
  const [kinds, setKinds] = useState<ExportKinds>({
    readme: true,
    metadata: true,
    release_info: false,
    release_assets: false,
  });
  const [dir, setDir] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<ExportReport | null>(null);

  useEffect(() => {
    setProgress(null);
    setReport(null);
  }, [repos]);

  useEffect(() => {
    const un = events.exportProgress.listen((e) => setProgress(e.payload));
    return () => void un.then((f) => f());
  }, []);

  const close = () => (!progress || report ? set({ exportFor: null }) : undefined);
  const running = !!progress && !report;

  const run = async () => {
    setProgress({ done: 0, total: repos!.length });
    try {
      const r = await unwrap(commands.reposExport(repos!, kinds, dir));
      setReport(r);
      toast({
        kind: r.failures.length ? "warning" : "success",
        title: t("export.done", { count: r.files_written }),
      });
    } catch (e) {
      setProgress(null);
      toastError(e);
    }
  };

  const kindKeys = ["readme", "metadata", "release_info", "release_assets"] as const;

  return (
    <Dialog
      open={!!repos}
      onClose={close}
      kicker={t("export.kicker")}
      title={t("export.title", { count: repos?.length ?? 0 })}
      footer={
        report ? (
          <Button variant="primary" onClick={() => set({ exportFor: null })}>
            {t("common:actions.done")}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close} disabled={running}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              variant="primary"
              icon={Download}
              loading={running}
              disabled={!dir || !Object.values(kinds).some(Boolean)}
              onClick={run}
            >
              {t("export.start")}
            </Button>
          </>
        )
      }
    >
      {report ? (
        <div className="space-y-3">
          <div className="text-[13px]">{t("export.done", { count: report.files_written })}</div>
          {report.failures.length > 0 && (
            <div className="max-h-[240px] overflow-y-auto rounded-[var(--radius)] border border-line">
              {report.failures.map((f, i) => (
                <div key={i} className="flex gap-3 border-b border-line px-3 py-2 text-[12px] last:border-0">
                  <span className="num flex-1 truncate">{f.repo}</span>
                  <span className="text-faint">
                    {t(`export.kinds.${f.kind as (typeof kindKeys)[number]}`, { defaultValue: f.kind })}
                  </span>
                  <span className="text-danger">{errorMessage(f.error)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label>{t("export.include")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {kindKeys.map((k) => (
                <Checkbox
                  key={k}
                  checked={kinds[k]}
                  onChange={(v) => setKinds({ ...kinds, [k]: v })}
                  label={t(`export.kinds.${k}`)}
                />
              ))}
            </div>
          </div>
          <div>
            <Label>{t("export.folder")}</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  readOnly
                  value={dir}
                  placeholder={t("export.pickFolder")}
                  className="num text-[12px]"
                />
              </div>
              <Button
                icon={FolderOpen}
                onClick={async () => {
                  const d = await openDialog({ directory: true, multiple: false });
                  if (typeof d === "string") setDir(d);
                }}
              >
                {t("export.browse")}
              </Button>
            </div>
          </div>
          {progress && (
            <div className="space-y-1.5">
              <Meter value={(progress.done / Math.max(1, progress.total)) * 100} />
              <div className="num text-[11px] text-faint">
                {progress.done} / {progress.total}
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
