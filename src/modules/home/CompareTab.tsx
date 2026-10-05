import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Download, GitFork, Upload } from "lucide-react";
import type { CommitInfo, RemoteCompare, SyncState, Workspace } from "@/core/ipc";
import { errorMessage } from "@/core/errors";
import { Button, EmptyState, Plotter } from "@/ui";
import { useWorkspaceActions } from "./actions";
import { useHistory } from "./api";
import { CommitRow } from "./HistoryTab";
import { AheadBehind, GitTerm } from "./parts";


export function CompareTab({
  ws,
  sync,
  loading,
}: {
  ws: Workspace;
  sync: SyncState | undefined;
  loading: boolean;
}) {
  const { t } = useTranslation("home");
  const act = useWorkspaceActions(ws);

  const history = useHistory(ws.id).data;
  const pushed = new Set(history?.filter((c) => c.pushed).map((c) => c.sha));
  if (!sync && loading) return <Plotter />;
  if (!ws.push_repo && !ws.reference_repo)
    return <EmptyState icon={<GitFork size={20} />} title={t("reference.notSet")} />;
  return (
    <div className="mx-auto max-w-[900px] space-y-5 p-4">
      {sync?.push && (
        <Section title={t("reference.github")} c={sync.push}>
          <Lists
            c={sync.push}
            repo={ws.push_repo}
            newLabel={t("reference.newOnGitHub")}
            yoursLabel={t("reference.notUploaded")}
            newAction={
              sync.push.behind > 0 && sync.push.related ? (
                <Button
                  size="sm"
                  icon={Download}
                  loading={act.busy === "latest"}
                  onClick={() => void act.getLatest("push", sync.push!.branch)}
                >
                  {t("reference.getLatestPush")}
                  <GitTerm term="pull" />
                </Button>
              ) : null
            }
            yoursAction={
              sync.push.ahead > 0 ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon={Upload}
                  loading={act.busy === "upload"}
                  onClick={() => void act.upload()}
                >
                  {t("actions.upload")}
                  <GitTerm term="push" />
                </Button>
              ) : null
            }
          />
        </Section>
      )}
      {sync?.reference ? (
        <Section title={t("strip.reference")} c={sync.reference} note={t("reference.what")} reference>
          {!sync.reference.related && (
            <p className="rounded-[var(--radius)] border border-line bg-surface-2 p-2 text-[12px] text-warn">
              {t("reference.unrelated")}
            </p>
          )}
          <Lists
            c={sync.reference}
            repo={sync.reference.slug}
            yoursRepo={ws.push_repo}
            pushed={pushed}
            newLabel={t("reference.newThere")}
            yoursLabel={t("reference.onlyYours")}
            newAction={
              sync.reference.behind > 0 && sync.reference.related ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon={Download}
                  loading={act.busy === "latest"}
                  onClick={() => void act.getLatest("reference", sync.reference!.branch)}
                >
                  {t("reference.getLatest")}
                  <GitTerm term="pull" />
                </Button>
              ) : null
            }
          />
          {sync.reference.related && !sync.reference.behind && (
            <p className="text-[12px] text-ok">{t("reference.upToDate")}</p>
          )}
        </Section>
      ) : (
        !ws.reference_repo && <p className="text-[12px] text-faint">{t("reference.notSet")}</p>
      )}
    </div>
  );
}

function Section({
  title,
  c,
  note,
  reference,
  children,
}: {
  title: string;
  c: RemoteCompare;
  note?: string;
  reference?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="annot">{title}</span>
        <span className="num text-[12.5px]">
          {c.slug} · {c.branch}
        </span>
        <span className="ml-auto">{c.related && <AheadBehind c={c} reference={reference} />}</span>
      </div>
      {note && <p className="text-[12px] text-dim">{note}</p>}
      {c.error && <p className="text-[12px] text-danger">{errorMessage(c.error)}</p>}
      {children}
    </section>
  );
}

function Lists({
  c,
  repo,
  yoursRepo,
  pushed,
  newLabel,
  yoursLabel,
  newAction,
  yoursAction,
}: {
  c: RemoteCompare;
  repo: string | null;

  yoursRepo?: string | null;
  pushed?: Set<string>;
  newLabel: string;
  yoursLabel: string;
  newAction?: ReactNode;
  yoursAction?: ReactNode;
}) {
  const yours = pushed ? c.outgoing.map((x) => ({ ...x, pushed: pushed.has(x.sha) })) : c.outgoing;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <CommitList
        label={newLabel}
        count={c.behind}
        items={c.incoming}
        repo={repo}
        mark="incoming"
        action={newAction}
      />
      <CommitList
        label={yoursLabel}
        count={c.ahead}
        items={yours}
        repo={pushed ? (yoursRepo ?? null) : repo}
        mark={pushed ? "yours" : "outgoing"}
        action={yoursAction}
      />
    </div>
  );
}

function CommitList({
  label,
  count,
  items,
  repo,
  mark,
  action,
}: {
  label: string;
  count: number;
  items: CommitInfo[];
  repo: string | null;
  mark: "incoming" | "outgoing" | "yours";
  action?: ReactNode;
}) {
  const { t } = useTranslation("home");
  return (
    <div className="flex flex-col rounded-[var(--radius)] border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-[12.5px] font-medium">{label}</span>
        <span className="num text-[11px] text-faint">{count}</span>
      </div>
      <div className="max-h-[300px] flex-1 overflow-y-auto">
        {items.length ? (
          items.map((x) => <CommitRow key={x.sha} c={x} repo={repo} mark={mark} />)
        ) : (
          <div className="px-3 py-3 text-[12px] text-faint">{t("reference.nothing")}</div>
        )}
      </div>
      {action && <div className="border-t border-line p-2">{action}</div>}
    </div>
  );
}
