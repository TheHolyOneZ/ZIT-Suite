import { DUE_FMT } from "./dates";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Search } from "lucide-react";
import type { Label, Milestone, SimpleUser } from "@/core/ipc";
import { formatDate } from "@/core/i18n/format";
import { Avatar, Input, Plotter, Popover } from "@/ui";
import { useAssignable, useLabels, useMilestones } from "./api";
import { LabelChip } from "./LabelChip";

type Trigger = (p: {
  onClick: () => void;
  ref: React.Ref<HTMLButtonElement>;
  "aria-expanded": boolean;
}) => ReactNode;

function FilterList<T>({
  items,
  loading,
  match,
  render,
  isOn,
  onToggle,
  empty,
  footer,
}: {
  items: T[];
  loading: boolean;
  match: (t: T, q: string) => boolean;
  render: (t: T) => ReactNode;
  isOn: (t: T) => boolean;
  onToggle: (t: T) => void;
  empty: string;
  footer?: ReactNode;
}) {
  const { t } = useTranslation("issues");
  const [q, setQ] = useState("");
  const list = useMemo(() => items.filter((i) => match(i, q.toLowerCase())), [items, q, match]);
  return (
    <div>
      <div className="border-b border-line p-2">
        <Input
          autoFocus
          icon={Search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("pickers.filter")}
          className="h-7 text-[12px]"
        />
      </div>
      <div className="max-h-[300px] overflow-y-auto p-1">
        {loading && <Plotter className="my-3" />}
        {!loading && list.length === 0 && (
          <div className="px-2 py-4 text-center text-[12px] text-faint">
            {q ? t("pickers.noMatch") : empty}
          </div>
        )}
        {list.map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onToggle(item)}
            className="flex min-h-8 w-full items-center gap-2 rounded-[3px] px-2 py-1 text-left text-[12.5px] hover:bg-surface-2 cursor-default"
          >
            <span className="flex size-3.5 shrink-0 items-center justify-center">
              {isOn(item) && <Check size={13} className="text-accent" />}
            </span>
            <span className="min-w-0 flex-1">{render(item)}</span>
          </button>
        ))}
      </div>
      {footer}
    </div>
  );
}

export function LabelPicker({
  repo,
  value,
  onToggle,
  trigger,
  open,
  onOpenChange,
}: {
  repo: string;
  value: string[];
  onToggle: (label: Label, on: boolean) => void;
  trigger: Trigger;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const { t } = useTranslation("issues");
  const { data = [], isLoading } = useLabels(repo);
  const has = (n: string) => value.some((v) => v.toLowerCase() === n.toLowerCase());
  return (
    <Popover
      className="w-[300px] p-0"
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      placement="bottom-end"
    >
      <FilterList
        items={data}
        loading={isLoading}
        match={(l, q) => !q || l.name.toLowerCase().includes(q)}
        render={(l) => (
          <span className="flex flex-col gap-0.5">
            <LabelChip label={l} />
            {l.description && <span className="truncate text-[11px] text-faint">{l.description}</span>}
          </span>
        )}
        isOn={(l) => has(l.name)}
        onToggle={(l) => onToggle(l, !has(l.name))}
        empty={t("pickers.noLabels")}
      />
    </Popover>
  );
}

export function AssigneePicker({
  repo,
  value,
  onToggle,
  trigger,
  open,
  onOpenChange,
}: {
  repo: string;
  value: string[];
  onToggle: (user: SimpleUser, on: boolean) => void;
  trigger: Trigger;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const { t } = useTranslation("issues");
  const { data = [], isLoading } = useAssignable(repo);
  const has = (l: string) => value.includes(l);
  return (
    <Popover
      className="w-[280px] p-0"
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      placement="bottom-end"
    >
      <FilterList
        items={data}
        loading={isLoading}
        match={(u, q) => !q || u.login.toLowerCase().includes(q)}
        render={(u) => (
          <span className="flex items-center gap-2">
            <Avatar src={u.avatar_url} alt={u.login} size={18} />
            <span className="num">{u.login}</span>
          </span>
        )}
        isOn={(u) => has(u.login)}
        onToggle={(u) => onToggle(u, !has(u.login))}
        empty={t("pickers.noAssignees")}
      />
    </Popover>
  );
}

export function MilestonePicker({
  repo,
  value,
  onPick,
  trigger,
  open,
  onOpenChange,
}: {
  repo: string;
  value: number | null;
  onPick: (m: Milestone | null) => void;
  trigger: Trigger;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const { t } = useTranslation("issues");
  const { data = [], isLoading } = useMilestones(repo, "open");
  const items: (Milestone | null)[] = [null, ...data];
  return (
    <Popover
      className="w-[300px] p-0"
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      placement="bottom-end"
    >
      {(close) => (
        <FilterList
          items={items}
          loading={isLoading}
          match={(m, q) => !q || (m?.title.toLowerCase().includes(q) ?? false)}
          render={(m) =>
            m ? (
              <span className="flex items-center justify-between gap-2">
                <span className="truncate">{m.title}</span>
                {m.due_on && (
                  <span className="num shrink-0 text-[10.5px] text-faint">
                    {formatDate(m.due_on, DUE_FMT)}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-dim">{t("pickers.noMilestone")}</span>
            )
          }
          isOn={(m) => (m?.number ?? null) === value}
          onToggle={(m) => {
            onPick(m);
            close();
          }}
          empty={t("pickers.noMilestones")}
        />
      )}
    </Popover>
  );
}
