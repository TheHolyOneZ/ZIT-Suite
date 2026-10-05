import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { commands, unwrap } from "@/core/ipc";
import { errorMessage } from "@/core/errors";
import { EmptyState, Plotter, RelTime } from "@/ui";


export function BlameView({
  repo,
  branch,
  path,
  text,
}: {
  repo: string;
  branch: string;
  path: string;
  text: string;
}) {
  const { t } = useTranslation("files");
  const q = useQuery({
    queryKey: ["files", "blame", repo, branch, path],
    queryFn: () => unwrap(commands.filesBlame(repo, branch, path)),
    staleTime: 60_000,
  });
  const lines = useMemo(() => text.replace(/\n$/, "").split("\n"), [text]);
  const owner = useMemo(() => {
    const m = new Map<number, number>();
    (q.data ?? []).forEach((r, i) => {
      for (let n = r.start; n <= r.end; n++) m.set(n, i);
    });
    return m;
  }, [q.data]);
  if (q.isLoading) return <Plotter />;
  if (q.error) return <EmptyState title={errorMessage(q.error)} body={t("blame.note")} />;
  const ranges = q.data ?? [];
  return (
    <div className="num h-full overflow-auto text-[12px] leading-[19px]">
      {lines.map((line, i) => {
        const n = i + 1;
        const ri = owner.get(n);
        const r = ri === undefined ? null : ranges[ri];
        const first = r && r.start === n;
        return (
          <div
            key={n}
            className={`grid grid-cols-[340px_44px_minmax(0,1fr)] ${first && n > 1 ? "border-t border-line" : ""}`}
          >
            <button
              className="flex min-w-0 cursor-default items-center gap-2 border-r border-line px-2 text-left text-[11px] text-dim hover:text-text"
              style={
                r
                  ? {
                      boxShadow: `inset 3px 0 0 color-mix(in srgb, var(--accent) ${Math.round((r.age / 10) * 100)}%, transparent)`,
                    }
                  : undefined
              }
              onClick={() => r && void openUrl(r.url)}
              title={r ? `${r.sha.slice(0, 7)} · ${r.message}${r.author ? ` · ${r.author}` : ""}` : undefined}
            >
              {first && r && (
                <>
                  <span className="text-faint">{r.sha.slice(0, 7)}</span>
                  <span className="min-w-0 flex-1 truncate">{r.message}</span>
                  <span className="shrink-0 text-faint">{r.date && <RelTime at={r.date} />}</span>
                </>
              )}
            </button>
            <span className="pr-2 text-right text-faint select-none">{n}</span>
            <span className="pr-3 whitespace-pre">{line || " "}</span>
          </div>
        );
      })}
    </div>
  );
}
