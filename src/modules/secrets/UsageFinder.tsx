import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FileSearch } from "lucide-react";
import { commands, unwrap } from "@/core/ipc";
import { errorMessage } from "@/core/errors";
import { Button } from "@/ui";
import { findUses } from "./model";

interface Hit {
  repo: string;
  path: string;
  lines: number[];
}


export function UsageFinder({
  kind,
  name,
  repos,
}: {
  kind: "secrets" | "vars";
  name: string;
  repos: string[];
}) {
  const { t } = useTranslation("secrets");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const run = async () => {
    setBusy(true);
    const out: Hit[] = [];
    const errs: string[] = [];
    for (const repo of [...new Set(repos)]) {
      try {
        const dir = await unwrap(commands.filesDir(repo, ".github/workflows", null));
        for (const f of dir.filter((e) => e.kind === "file" && /\.ya?ml$/i.test(e.name))) {
          const text = await unwrap(commands.filesReadText(repo, f.path, null));
          const lines = text ? findUses(text, kind, name) : [];
          if (lines.length) out.push({ repo, path: f.path, lines });
        }
      } catch (e) {
        errs.push(`${repo}: ${errorMessage(e)}`);
      }
    }
    setHits(out);
    setErrors(errs);
    setBusy(false);
  };
  const unused = hits ? [...new Set(repos)].filter((r) => !hits.some((h) => h.repo === r)) : [];
  return (
    <section className="border-b border-line px-6 py-3">
      <div className="flex items-center gap-2">
        <span className="annot flex-1">{t("usage.title")}</span>
        <Button size="sm" icon={FileSearch} loading={busy} onClick={() => void run()}>
          {hits ? t("usage.again") : t("usage.find")}
        </Button>
      </div>
      {hits && (
        <div className="mt-2 space-y-1 text-[12px]">
          {hits.length === 0 && <p className="text-faint">{t("usage.none")}</p>}
          {hits.map((h) => (
            <button
              key={`${h.repo}/${h.path}`}
              className="num flex w-full cursor-default items-center gap-2 text-left hover:text-accent"
              onClick={() => void openUrl(`https://github.com/${h.repo}/blob/HEAD/${h.path}#L${h.lines[0]}`)}
            >
              <span className="truncate">{h.repo}</span>
              <span className="truncate text-faint">{h.path}</span>
              <span className="ml-auto text-faint">{t("usage.lines", { list: h.lines.join(", ") })}</span>
            </button>
          ))}
          {unused.length > 0 && hits.length > 0 && (
            <p className="text-warn">
              {t("usage.unused", { count: unused.length, list: unused.join(", ") })}
            </p>
          )}
          {errors.map((e) => (
            <p key={e} className="text-danger">
              {e}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
