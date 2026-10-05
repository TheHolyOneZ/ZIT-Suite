import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpCircle } from "lucide-react";
import { commands, unwrap } from "@/core/ipc";
import { errorMessage } from "@/core/errors";
import { cn } from "@/core/cn";
import { toast } from "@/core/store/toasts";
import { Button, Checkbox, Dialog, Input, Label, Mark, Segmented } from "@/ui";
import { bumpManifest, canBump } from "./bump";
import { freshness, type Package, type Use } from "./model";

type Mode = "pr" | "commit";
type State = { s: "running" | "done" | "skipped" | "failed"; note?: string };


export function BumpDialog({
  pkg,
  onClose,
  onDone,
}: {
  pkg: Package;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(["deps", "common"]);
  const editable = pkg.uses.filter(
    (u) => canBump(pkg.ecosystem, u.path) && freshness(u.spec, pkg.ecosystem, "0") !== "local",
  );
  const [version, setVersion] = useState(pkg.latest ?? "");
  const [picked, setPicked] = useState<Set<string>>(
    () =>
      new Set(editable.filter((u) => freshness(u.spec, pkg.ecosystem, pkg.latest) !== "current").map(key)),
  );
  const [mode, setMode] = useState<Mode>("pr");
  const [status, setStatus] = useState<Record<string, State>>({});
  const [running, setRunning] = useState(false);
  const chosen = editable.filter((u) => picked.has(key(u)));
  const byRepo = groupBy(chosen);
  const done = Object.keys(status).length > 0 && Object.values(status).every((s) => s.s !== "running");

  const run = async () => {
    setRunning(true);
    let ok = 0;
    for (const [repo, uses] of byRepo) {
      setStatus((c) => ({ ...c, [repo]: { s: "running" } }));
      try {
        const branch = uses[0].branch;
        const tree = await unwrap(commands.filesTree(repo, branch, true));
        const changes = [];
        for (const u of uses) {
          const item = tree.items.find((i) => i.path === u.path);
          if (!item) continue;
          const blob = await unwrap(commands.filesBlob(repo, item.sha));
          const next =
            blob.text != null
              ? bumpManifest(blob.text, pkg.ecosystem, u.path, pkg.name, version.trim())
              : null;
          if (next) changes.push({ kind: "text" as const, path: u.path, text: next, executable: null });
        }
        if (!changes.length) {
          setStatus((c) => ({ ...c, [repo]: { s: "skipped", note: t("bump.nothing") } }));
          continue;
        }
        const message = t("bump.message", { name: pkg.name, version: version.trim() });
        if (mode === "commit") {
          await unwrap(commands.filesCommit(repo, branch, tree.commit, false, message, changes));
          setStatus((c) => ({ ...c, [repo]: { s: "done" } }));
        } else {
          const head = `zit/bump-${pkg.name.replace(/[^A-Za-z0-9._-]+/g, "-")}-${version.trim().replace(/[^A-Za-z0-9.]+/g, "")}`;
          await unwrap(commands.filesCommit(repo, head, tree.commit, true, message, changes));
          const pr = await unwrap(
            commands.pullsCreate(repo, {
              title: message,
              head,
              base: branch,
              body: t("bump.prBody", { manager: [...new Set(uses.map((u) => u.manager))].join(", ") }),
              draft: false,
            }),
          );
          setStatus((c) => ({ ...c, [repo]: { s: "done", note: `#${pr.number}` } }));
        }
        ok++;
      } catch (e) {
        setStatus((c) => ({ ...c, [repo]: { s: "failed", note: errorMessage(e) } }));
      }
    }
    setRunning(false);
    if (ok) {
      toast({ kind: "success", title: t("bump.finished", { count: ok }) });
      onDone();
    }
  };

  const glyph = (s?: State["s"]) =>
    s === "done"
      ? "tick"
      : s === "failed"
        ? "cross"
        : s === "skipped"
          ? "skip"
          : s === "running"
            ? "running"
            : "pending";
  const tone = (s?: State["s"]) =>
    s === "done" ? "ok" : s === "failed" ? "danger" : s === "running" ? "accent" : "idle";

  return (
    <Dialog
      open
      onClose={running ? () => undefined : onClose}
      width={680}
      kicker={t("title")}
      title={t("bump.title", { name: pkg.name })}
      footer={
        <>
          <span className="mr-auto text-[11.5px] text-faint">{t("bump.lockNote")}</span>
          <Button variant="ghost" disabled={running} onClick={onClose}>
            {done ? t("common:actions.close") : t("common:actions.cancel")}
          </Button>
          {!done && (
            <Button
              variant="primary"
              icon={ArrowUpCircle}
              loading={running}
              disabled={!byRepo.size || !/\d/.test(version)}
              onClick={() => void run()}
            >
              {mode === "pr"
                ? t("bump.runPr", { count: byRepo.size })
                : t("bump.runCommit", { count: byRepo.size })}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[180px_minmax(0,1fr)] items-end gap-3">
          <div>
            <Label hint={pkg.latest ? t("bump.latestIs", { version: pkg.latest }) : undefined}>
              {t("bump.to")}
            </Label>
            <Input value={version} onChange={(e) => setVersion(e.target.value.trim())} className="num" />
          </div>
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "pr", label: t("bump.modePr") },
              { value: "commit", label: t("bump.modeCommit") },
            ]}
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto rounded-[var(--radius)] border border-line">
          {editable.map((u) => {
            const st = status[u.repo];
            return (
              <div
                key={key(u)}
                className="flex items-center gap-3 border-b border-line px-3 py-1.5 text-[12px] last:border-b-0"
              >
                {st ? (
                  <Mark glyph={glyph(st.s)} tone={tone(st.s)} size={10} />
                ) : (
                  <Checkbox
                    checked={picked.has(key(u))}
                    onChange={(on) =>
                      setPicked((p) => (on ? new Set(p).add(key(u)) : (p.delete(key(u)), new Set(p))))
                    }
                    label={null}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="num block truncate">{u.repo}</span>
                  <span className="num block truncate text-[11px] text-faint">
                    {u.path} · {u.manager}
                  </span>
                </span>
                <span className="num text-[11.5px] text-dim">{u.spec}</span>
                {st?.note && (
                  <span
                    className={cn(
                      "max-w-[160px] truncate text-[11px]",
                      st.s === "failed" ? "text-danger" : "text-faint",
                    )}
                    title={st.note}
                  >
                    {st.note}
                  </span>
                )}
              </div>
            );
          })}
          {!editable.length && (
            <div className="px-3 py-4 text-center text-[12px] text-faint">{t("bump.noneEditable")}</div>
          )}
        </div>
        {editable.length < pkg.uses.length && (
          <p className="text-[11.5px] text-faint">
            {t("bump.someSkipped", { count: pkg.uses.length - editable.length })}
          </p>
        )}
      </div>
    </Dialog>
  );
}

const key = (u: Use) => `${u.repo}::${u.path}`;

function groupBy(uses: Use[]): Map<string, Use[]> {
  const m = new Map<string, Use[]>();
  for (const u of uses) m.set(u.repo, [...(m.get(u.repo) ?? []), u]);
  return m;
}
