import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { CommitInfo, Workspace } from "@/core/ipc";
import { formatRelative } from "@/core/i18n/format";
import { EmptyState, Mark, Plotter } from "@/ui";
import { useHistory } from "./api";
import { UndoFromButton, UndoLastButton } from "./WorkTools";

export function HistoryTab({ ws }: { ws: Workspace }) {
  const { t } = useTranslation("home");
  const { data, isLoading } = useHistory(ws.id);
  if (isLoading) return <Plotter />;
  if (!data?.length) return <EmptyState title={t("history.empty")} />;
  return (
    <div>
      {!data[0].pushed && data.length > 1 && (
        <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-1.5">
          <span className="flex-1 text-[11.5px] text-faint">{t("undo.hint")}</span>
          <UndoLastButton ws={ws} />
        </div>
      )}
      {data.map((c, i) => (
        <CommitRow
          key={c.sha}
          c={c}
          repo={ws.push_repo}
          undo={!c.pushed && data.slice(0, i + 1).every((x) => !x.pushed) ? { ws, count: i + 1 } : undefined}
        />
      ))}
    </div>
  );
}

export function CommitRow({
  c,
  repo,
  mark,
  undo,
}: {
  c: CommitInfo;
  repo: string | null;
  mark?: "incoming" | "outgoing" | "yours";
  undo?: { ws: Workspace; count: number };
}) {
  const { t } = useTranslation("home");
  const onGitHub = mark === "incoming" || (mark !== "outgoing" && c.pushed);
  const link = onGitHub && repo ? `https://github.com/${repo}/commit/${c.sha}` : null;
  return (
    <div className="group flex items-center gap-3 border-b border-line px-4 py-2 hover:bg-surface-2">
      <Mark
        glyph={onGitHub ? "tick" : "hourglass"}
        tone={onGitHub ? "ok" : "accent"}
        size={12}
        title={onGitHub ? t("history.uploaded") : t("history.local")}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px]">{c.summary}</div>
        <div className="text-[11px] text-faint">
          {t("history.by", { author: c.author, when: formatRelative(c.time) })}
        </div>
      </div>
      {!mark && (
        <span className="text-[10.5px] text-faint">
          {onGitHub ? t("history.uploaded") : t("history.local")}
        </span>
      )}
      {undo && <UndoFromButton ws={undo.ws} c={c} count={undo.count} />}
      {link ? (
        <button
          className="num cursor-default text-[11px] text-dim hover:text-accent"
          onClick={() => void openUrl(link)}
        >
          {c.short}
        </button>
      ) : (
        <span className="num text-[11px] text-faint">{c.short}</span>
      )}
    </div>
  );
}
