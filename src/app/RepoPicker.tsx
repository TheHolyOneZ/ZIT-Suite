import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, FolderGit2, Lock, Search } from "lucide-react";
import { useRepoList } from "@/core/data/repos";
import { cn } from "@/core/cn";
import { Input, Popover } from "@/ui";


export function RepoPicker({
  value,
  onChange,
  writable,
  className,
  placeholder,
}: {
  value: string | null;
  onChange: (fullName: string) => void;
  writable?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const { data = [] } = useRepoList();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.toLowerCase();
    return data
      .filter((r) => !writable || (!r.archived && (r.permissions?.push ?? false)))
      .filter((r) => !needle || r.full_name.toLowerCase().includes(needle))
      .slice(0, 200);
  }, [data, q, writable]);

  return (
    <Popover
      className="w-[340px] p-0"
      trigger={(p) => (
        <button
          {...p}
          type="button"
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-[var(--radius)] border border-line-strong bg-surface px-2.5 text-left text-[13px] cursor-default hover:border-dim",
            className,
          )}
        >
          <FolderGit2 size={14} className="shrink-0 text-faint" />
          <span className={cn("num min-w-0 flex-1 truncate", !value && "text-faint")}>{value ?? placeholder ?? t("pickers.repo")}</span>
          <ChevronDown size={14} className="text-faint" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="border-b border-line p-2">
            <Input autoFocus icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pickers.searchRepos")} />
          </div>
          <div className="max-h-[320px] overflow-y-auto p-1">
            {list.length === 0 && <div className="px-2 py-4 text-center text-[12px] text-faint">{t("palette.empty")}</div>}
            {list.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onChange(r.full_name);
                  close();
                }}
                className="flex h-8 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[12.5px] hover:bg-surface-2 cursor-default"
              >
                <span className="num min-w-0 flex-1 truncate">{r.full_name}</span>
                {r.private && <Lock size={11} className="text-faint" />}
                {value === r.full_name && <Check size={13} className="text-accent" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}
