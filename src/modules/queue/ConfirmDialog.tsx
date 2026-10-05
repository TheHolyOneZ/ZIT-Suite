import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Play, ShieldAlert } from "lucide-react";
import { commands, unwrap, type DryRunOutcome, type DryRunResult } from "@/core/ipc";
import { errorMessage, toastError } from "@/core/errors";
import { tDynamic } from "@/core/i18n";
import { useSettings } from "@/core/store/settings";
import { toast } from "@/core/store/toasts";
import { Badge, Button, Checkbox, Dialog, Input, Mark, Plotter, type Glyph, type Tone } from "@/ui";
import { describeAction } from "./describe";
import { isDestructive, useQueue } from "./store";


export function confirmWordMatches(typed: string, word: string) {
  const norm = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
  const t = norm(typed);
  return t.length > 0 && (t === norm(word) || t === "delete");
}

export const outcomeTone: Record<DryRunOutcome, Tone> = { ready: "ok", noop: "idle", blocked: "danger" };
export const outcomeGlyph: Record<DryRunOutcome, Glyph> = { ready: "tick", noop: "equal", blocked: "block" };


export function ConfirmDialog() {
  const { t } = useTranslation(["queue", "common"]);
  const request = useQueue((s) => s.request);
  const close = useQueue((s) => s.closeRequest);
  const grace = useSettings((s) => s.graceSeconds);
  const typeToConfirm = useSettings((s) => s.typeToConfirmDelete);
  const [onlyReady, setOnlyReady] = useState(true);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTyped("");
    setOnlyReady(true);
  }, [request]);

  const dry = useQuery({
    queryKey: ["dry-run", request],
    queryFn: () => unwrap(commands.queueDryRun(request!)),
    enabled: !!request,
    staleTime: 0,
    gcTime: 0,
  });

  const results = useMemo(() => dry.data ?? [], [dry.data]);
  const counts = useMemo(() => {
    const c = { ready: 0, noop: 0, blocked: 0 };
    for (const r of results) c[r.outcome]++;
    return c;
  }, [results]);

  const toSubmit = request
    ? dry.data
      ? results.filter((r) => !onlyReady || r.outcome === "ready")
      : []
    : [];
  const destructive = toSubmit.some((r) => isDestructive(r.action));
  const deletesRepos = toSubmit.some((r) => r.action.kind === "delete");
  const transfers = toSubmit.some((r) => r.action.kind === "repo_transfer");
  const word = deletesRepos ? t("confirm.word") : t("confirm.wordTransfer");

  const needsTyping = (deletesRepos || transfers) && typeToConfirm;
  const canSubmit = toSubmit.length > 0 && (!needsTyping || confirmWordMatches(typed, word));

  const submit = async () => {
    setBusy(true);
    try {
      await unwrap(
        commands.queueSubmit(
          toSubmit.map(({ repo, action }) => ({ repo, action })),
          grace,
        ),
      );
      toast({
        kind: "info",
        title: t("confirm.queued", { count: toSubmit.length }),
        body: grace ? t("confirm.graceNote", { seconds: grace }) : undefined,
      });
      close();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!request}
      onClose={close}
      kicker={t("confirm.kicker")}
      title={t("confirm.title", { count: request?.length ?? 0 })}
      width={640}
      footer={
        <>
          <span className="mr-auto text-[12px] text-dim">
            {grace ? t("confirm.graceNote", { seconds: grace }) : t("confirm.noGrace")}
          </span>
          <Button variant="ghost" onClick={close}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            icon={Play}
            loading={busy}
            disabled={!canSubmit}
            onClick={submit}
          >
            {t("confirm.submit", { count: toSubmit.length })}
          </Button>
        </>
      }
    >
      {dry.isLoading ? (
        <div className="space-y-3 py-6">
          <div className="annot text-center">{t("confirm.dryRunning")}</div>
          <Plotter />
        </div>
      ) : dry.isError ? (
        <div className="text-danger">{errorMessage(dry.error)}</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(["ready", "noop", "blocked"] as const).map((o) => (
              <div key={o} className="rounded-[var(--radius)] border border-line bg-surface-2 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Mark glyph={outcomeGlyph[o]} tone={outcomeTone[o]} />
                  <span className="annot">{t(`outcome.${o}`)}</span>
                </div>
                <div className="num mt-1 text-[20px] font-semibold">{counts[o]}</div>
              </div>
            ))}
          </div>

          <div className="max-h-[300px] overflow-y-auto rounded-[var(--radius)] border border-line">
            {results.map((r) => (
              <DryRow key={`${r.repo}-${JSON.stringify(r.action)}`} r={r} />
            ))}
          </div>

          {(counts.noop > 0 || counts.blocked > 0) && (
            <Checkbox checked={onlyReady} onChange={setOnlyReady} label={t("confirm.onlyReady")} />
          )}

          {destructive && !needsTyping && (
            <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)] px-3 py-2 text-[12.5px] text-warn">
              <ShieldAlert size={14} />
              {t("confirm.destructiveOther")}
            </div>
          )}

          {needsTyping && toSubmit.length > 0 && (
            <div className="rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_7%,transparent)] p-3">
              <div className="mb-2 flex items-center gap-2 text-[12.5px] text-danger">
                <ShieldAlert size={14} />
                {deletesRepos ? t("confirm.destructive") : t("confirm.transferWarn")}
              </div>
              <Input
                autoFocus
                placeholder={t("confirm.typePlaceholder", { word })}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="num"
              />
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function DryRow({ r }: { r: DryRunResult }) {
  const { label, detail } = describeAction(r.action);
  const reason = r.reason
    ? tDynamic(`queue:dry.${r.reason}`, { defaultValue: "" }) ||
      tDynamic(`errors:${r.reason}`, { defaultValue: r.reason })
    : null;
  return (
    <div className="flex items-center gap-3 border-b border-line px-3 py-2 text-[12.5px] last:border-0">
      <Mark glyph={outcomeGlyph[r.outcome]} tone={outcomeTone[r.outcome]} />

      <div className="min-w-0 flex-1">
        <div className="num truncate" title={r.repo}>
          {r.repo}
        </div>
        {(detail || reason) && (
          <div className="flex min-w-0 gap-2 text-[11.5px]">
            {detail && <span className="num truncate text-text">{detail}</span>}
            {reason && <span className="truncate text-dim">{reason}</span>}
          </div>
        )}
      </div>
      <Badge tone={isDestructive(r.action) ? "danger" : "info"} mono>
        {label}
      </Badge>
    </div>
  );
}
