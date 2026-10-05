import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Checkbox, Input } from "@/ui";


export function RepoChecklist({
  repos,
  value,
  onChange,
  title,
  note,
  disabled,
  height = 340,
}: {
  repos: string[];
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  title: ReactNode;
  note?: (repo: string) => ReactNode;
  disabled?: (repo: string) => boolean;
  height?: number;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");


  const [pinned, setPinned] = useState(() => new Set(value));
  const touched = useRef(false);

  useEffect(() => {
    if (!touched.current) setPinned(new Set(value));
  }, [value]);
  const list = useMemo(
    () =>
      repos
        .filter((r) => !q || r.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => Number(pinned.has(b)) - Number(pinned.has(a)) || a.localeCompare(b, undefined, { sensitivity: "base" })),
    [repos, q, pinned],
  );
  const pickable = list.filter((r) => !disabled?.(r));
  const shown = pickable.filter((r) => value.has(r)).length;
  const setMany = (rs: string[], on: boolean) => {
    touched.current = true;
    const n = new Set(value);
    for (const r of rs) {
      if (on) n.add(r);
      else n.delete(r);
    }
    onChange(n);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Checkbox
          checked={shown === pickable.length && pickable.length > 0}
          indeterminate={shown > 0 && shown < pickable.length}
          onChange={(on) => setMany(pickable, on)}
          label={<span className="annot">{title}</span>}
        />
        <div className="w-[220px]">
          <Input icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pickers.searchRepos")} className="h-7 text-[12px]" />
        </div>
      </div>
      <div className="overflow-y-auto rounded-[var(--radius)] border border-line p-1" style={{ height }}>
        {list.map((r) => {
          const off = disabled?.(r) ?? false;
          return (
            <button
              key={r}
              type="button"
              disabled={off}
              onClick={() => setMany([r], !value.has(r))}
              className="flex h-8 w-full items-center gap-2 rounded-[3px] px-2 text-left hover:bg-surface-2 disabled:opacity-50 cursor-default"
            >
              <Checkbox checked={value.has(r)} onChange={() => !off && setMany([r], !value.has(r))} />
              <span className="num min-w-0 flex-1 truncate text-[12px]">{r}</span>
              {note?.(r)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
