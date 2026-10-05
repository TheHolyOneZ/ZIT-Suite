import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderUp } from "lucide-react";
import { commands, unwrap, type FolderScan, type TreeItem } from "@/core/ipc";
import { errorMessage } from "@/core/errors";
import { toast } from "@/core/store/toasts";
import { Button, Checkbox, Dialog, Input, Label, Meter } from "@/ui";
import { formatBytes } from "@/modules/home/model";
import type { StagedMap } from "./model";


const BIG_TOTAL = 50 * 1024 * 1024;


export function FolderUploadDialog({
  scan,
  folder,
  items,
  staged,
  onStage,
  onClose,
}: {
  scan: FolderScan;
  folder: string;
  items: TreeItem[];
  staged: StagedMap;
  onStage: (s: StagedMap) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["files", "common"]);
  const [intoSub, setIntoSub] = useState(true);
  const [sub, setSub] = useState(scan.name);
  const [progress, setProgress] = useState<number | null>(null);
  const base = [folder, intoSub ? sub.trim().replace(/^\/+|\/+$/g, "") : ""].filter(Boolean).join("/");
  const target = (rel: string) => (base ? `${base}/${rel}` : rel);
  const total = scan.files.reduce((n, f) => n + f.size, 0);
  const replaces = scan.files.filter((f) => items.some((i) => i.path === target(f.rel))).length;

  const stage = async () => {
    let next = { ...staged };
    let failed = 0;
    for (let i = 0; i < scan.files.length; i++) {
      const f = scan.files[i];
      setProgress(i / scan.files.length);
      try {
        const base64 = await unwrap(commands.filesReadLocal(f.abs));
        next = { ...next, [target(f.rel)]: { kind: "upload", base64, size: f.size } };
      } catch (e) {
        failed++;
        if (failed === 1)
          toast({ kind: "error", title: t("folder.readFailed", { name: f.rel }), body: errorMessage(e) });
      }
    }
    onStage(next);
    toast({
      kind: "success",
      title: t("folder.staged", { count: scan.files.length - failed, into: base || "/" }),
      body: t("folder.stagedBody"),
    });
    onClose();
  };

  return (
    <Dialog
      open
      onClose={progress === null ? onClose : () => undefined}
      width={600}
      kicker={t("title")}
      title={t("folder.title", { name: scan.name })}
      footer={
        <>
          {progress !== null && <Meter value={progress * 100} className="mr-auto w-[200px]" />}
          <Button variant="ghost" disabled={progress !== null} onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={FolderUp}
            loading={progress !== null}
            disabled={!scan.files.length}
            onClick={() => void stage()}
          >
            {t("folder.stage", { count: scan.files.length })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-[12px]">
          <Stat label={t("folder.files")} value={String(scan.files.length)} />
          <Stat label={t("folder.size")} value={formatBytes(total)} warn={total > BIG_TOTAL} />
          <Stat label={t("folder.skipped")} value={String(scan.skipped_count)} />
        </div>
        <div>
          <Checkbox
            checked={intoSub}
            onChange={setIntoSub}
            label={<span className="text-[12.5px]">{t("folder.intoSub")}</span>}
          />
          {intoSub && (
            <div className="mt-2 pl-6">
              <Label>{t("folder.subName")}</Label>
              <Input value={sub} onChange={(e) => setSub(e.target.value)} className="num !h-8" />
            </div>
          )}
          <p className="num mt-2 text-[11.5px] text-dim">{t("folder.target", { path: `/${base}` })}</p>
        </div>
        {total > BIG_TOTAL && <p className="text-[12px] text-warn">{t("folder.big")}</p>}
        {replaces > 0 && <p className="text-[12px] text-warn">{t("folder.replaces", { count: replaces })}</p>}
        {scan.too_large.length > 0 && (
          <p className="text-[12px] text-warn">
            {t("folder.tooLarge", {
              count: scan.too_large.length,
              list: scan.too_large.slice(0, 3).join(", "),
            })}
          </p>
        )}
        {scan.truncated && (
          <p className="text-[12px] text-warn">{t("folder.truncated", { count: scan.files.length })}</p>
        )}
        {scan.skipped_count > 0 && (
          <details className="text-[11.5px] text-faint">
            <summary className="cursor-default">
              {t("folder.skippedList", { count: scan.skipped_count })}
            </summary>
            <div className="num mt-1 max-h-[120px] overflow-y-auto">
              {scan.skipped.map((s) => (
                <div key={s}>{s}</div>
              ))}
              {scan.skipped_count > scan.skipped.length && <div>…</div>}
            </div>
          </details>
        )}
        <p className="text-[11.5px] text-faint">{t("folder.note")}</p>
      </div>
    </Dialog>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-[var(--radius)] border border-line px-3 py-2">
      <div className="annot !text-[9.5px]">{label}</div>
      <div className={warn ? "num text-[16px] text-warn" : "num text-[16px]"}>{value}</div>
    </div>
  );
}
