import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AtSign,
  CircleUser,
  Clock,
  Inbox,
  MessageSquareDot,
  PenLine,
  Tag,
  UserX,
  CheckCheck,
} from "lucide-react";
import { cn } from "@/core/cn";
import { useSession } from "@/core/store/session";
import { Checkbox, FacetColumn, FacetGrid, Input, Section, Segmented, Select, type FilterChip } from "@/ui";
import { RepoPicker } from "@/app/RepoPicker";
import { useIssueSearch } from "./api";
import { LabelChip } from "./LabelChip";
import { DEFAULT_ISSUE_FILTER, type BuiltinView, type IssueFilter } from "./query";
import { useIssuesPrefs, useIssuesUi } from "./store";


export function IssueFacets() {
  const { t } = useTranslation("issues");
  const ui = useIssuesUi();
  const org = useSession((s) => s.org);
  const f = ui.filter;

  return (
    <FacetGrid>
      <FacetColumn>
        <Section title={t("panel.scope")}>
          <div className="space-y-1.5">
            <Segmented
              className="w-full"
              size="sm"
              value={f.scope.kind === "org" ? "mine" : f.scope.kind}
              onChange={(k) =>
                ui.setFilter({
                  scope:
                    k === "mine"
                      ? org
                        ? { kind: "org", org }
                        : { kind: "mine" }
                      : k === "everywhere"
                        ? { kind: "everywhere" }
                        : { kind: "repo", repo: f.scope.kind === "repo" ? f.scope.repo : "" },
                })
              }
              options={[
                { value: "mine", label: org ? org : t("scope.mine") },
                { value: "repo", label: t("scope.repo") },
                { value: "everywhere", label: t("scope.everywhere") },
              ]}
            />
            {f.scope.kind === "repo" && (
              <RepoPicker
                value={f.scope.repo || null}
                onChange={(repo) => ui.setFilter({ scope: { kind: "repo", repo } })}
              />
            )}
            {f.scope.kind === "everywhere" && (
              <p className="text-[11px] text-faint">{t("scope.everywhereHint")}</p>
            )}
          </div>
        </Section>
        <Section title={t("panel.state")}>
          <div className="space-y-1.5">
            <Segmented
              className="w-full"
              size="sm"
              value={f.state}
              onChange={(state) => ui.setFilter({ state })}
              options={[
                { value: "open", label: t("state.open") },
                { value: "closed", label: t("state.closed") },
                { value: "all", label: t("state.all") },
              ]}
            />
            {f.state !== "open" && (
              <Select
                value={f.reason}
                onChange={(e) => ui.setFilter({ reason: e.target.value as IssueFilter["reason"] })}
                className="h-7 text-[12px]"
              >
                <option value="any">{t("reason.any")}</option>
                <option value="completed">{t("state.completed")}</option>
                <option value="not_planned">{t("state.notPlanned")}</option>
              </Select>
            )}
          </div>
        </Section>
        <Section title={t("filters.sort")}>
          <SortRow />
        </Section>
      </FacetColumn>
      <FacetColumn>
        <LabelsFilter />
      </FacetColumn>
      <FacetColumn>
        <Section title={t("panel.people")}>
          <div className="space-y-2">
            <PeopleRow
              label={t("filters.assignee")}
              value={f.assignee}
              onChange={(assignee) => ui.setFilter({ assignee })}
              allowNone
            />
            <PeopleRow
              label={t("filters.author")}
              value={f.author}
              onChange={(author) => ui.setFilter({ author })}
            />
            <PeopleRow
              label={t("filters.involves")}
              value={f.involves}
              onChange={(involves) => ui.setFilter({ involves })}
            />
          </div>
        </Section>
        <Section title={t("panel.more")}>
          <div className="space-y-2.5">
            <div>
              <div className="mb-1 text-[12px] text-dim">{t("filters.milestone")}</div>
              <Input
                value={f.milestone === "none" ? "" : f.milestone}
                disabled={f.milestone === "none"}
                placeholder={t("filters.milestonePlaceholder")}
                onChange={(e) => ui.setFilter({ milestone: e.target.value })}
                className="h-7 text-[12px]"
              />
              <Checkbox
                className="mt-1.5"
                checked={f.milestone === "none"}
                onChange={(v) => ui.setFilter({ milestone: v ? "none" : "" })}
                label={t("filters.noMilestone")}
              />
            </div>
            <div>
              <div className="mb-1 text-[12px] text-dim">{t("filters.staleDays")}</div>
              <Input
                type="number"
                min={1}
                value={f.staleDays ?? ""}
                placeholder="—"
                onChange={(e) =>
                  ui.setFilter({ staleDays: e.target.value ? Math.max(1, Number(e.target.value)) : null })
                }
                className="num h-7 text-[12px]"
              />
            </div>
          </div>
        </Section>
      </FacetColumn>
    </FacetGrid>
  );
}

function LabelsFilter() {
  const { t } = useTranslation("issues");
  const f = useIssuesUi((s) => s.filter);
  const setFilter = useIssuesUi((s) => s.setFilter);
  const { issues } = useIssueSearch();
  const [draft, setDraft] = useState("");
  const [exclude, setExclude] = useState(false);

  const seen = useMemo(() => {
    const m = new Map<string, { name: string; color: string; n: number }>();
    for (const i of issues)
      for (const l of i.labels)
        m.set(l.name, { name: l.name, color: l.color, n: (m.get(l.name)?.n ?? 0) + 1 });
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 12);
  }, [issues]);
  const add = (name: string) => {
    const n = name.trim();
    if (!n) return;
    if (exclude) setFilter({ excludeLabels: [...new Set([...f.excludeLabels, n])] });
    else setFilter({ labels: [...new Set([...f.labels, n])] });
    setDraft("");
  };
  return (
    <Section title={t("panel.labels")}>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {f.labels.map((l) => (
            <LabelChip
              key={l}
              label={{ name: l, color: seen.find((s) => s.name === l)?.color ?? "888888" }}
              onRemove={() => setFilter({ labels: f.labels.filter((x) => x !== l) })}
            />
          ))}
          {f.excludeLabels.map((l) => (
            <LabelChip
              key={`-${l}`}
              label={{ name: `−${l}`, color: "d93838" }}
              onRemove={() => setFilter({ excludeLabels: f.excludeLabels.filter((x) => x !== l) })}
            />
          ))}
        </div>
        <form onSubmit={(e) => (e.preventDefault(), add(draft))} className="flex gap-1.5">
          <div className="flex-1">
            <Input
              icon={Tag}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={exclude ? t("filters.excludeLabel") : t("filters.addLabel")}
              className="h-7 text-[12px]"
            />
          </div>
          <button
            type="button"
            onClick={() => setExclude(!exclude)}
            className={cn(
              "h-7 rounded-[3px] border px-2 text-[11px] cursor-default",
              exclude ? "border-danger text-danger" : "border-line-strong text-dim",
            )}
            title={t("filters.excludeToggle")}
          >
            −
          </button>
        </form>
        {seen.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {seen
              .filter((s) => !f.labels.includes(s.name))
              .map((s) => (
                <button
                  key={s.name}
                  onClick={() => add(s.name)}
                  className="opacity-70 hover:opacity-100 cursor-default"
                >
                  <LabelChip label={s} />
                </button>
              ))}
          </div>
        )}
        <Checkbox
          checked={f.noLabels}
          onChange={(noLabels) => setFilter({ noLabels })}
          label={t("filters.noLabels")}
        />
      </div>
    </Section>
  );
}

function PeopleRow({
  label,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allowNone?: boolean;
}) {
  const { t } = useTranslation("issues");
  const mode = value === "" ? "any" : value === "@me" ? "me" : value === "none" ? "none" : "user";
  const [user, setUser] = useState(mode === "user" ? value : "");
  return (
    <div>
      <div className="mb-1 text-[12px] text-dim">{label}</div>
      <div className="flex gap-1.5">
        <Select
          value={mode}
          onChange={(e) => {
            const m = e.target.value;
            onChange(m === "any" ? "" : m === "me" ? "@me" : m === "none" ? "none" : user);
          }}
          className="h-7 w-[92px] text-[12px]"
        >
          <option value="any">{t("people.any")}</option>
          <option value="me">{t("people.me")}</option>
          {allowNone && <option value="none">{t("people.none")}</option>}
          <option value="user">{t("people.user")}</option>
        </Select>
        {mode === "user" && (
          <div className="flex-1">
            <Input
              value={user}
              placeholder="login"
              onChange={(e) => setUser(e.target.value)}
              onBlur={() => onChange(user.trim())}
              onKeyDown={(e) => e.key === "Enter" && onChange(user.trim())}
              className="num h-7 text-[12px]"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SortRow() {
  const { t } = useTranslation("issues");
  const sort = useIssuesPrefs((s) => s.sort);
  const order = useIssuesPrefs((s) => s.order);
  const set = useIssuesPrefs((s) => s.set);
  return (
    <div>
      <div className="mb-1 text-[12px] text-dim">{t("filters.sort")}</div>
      <div className="flex gap-1.5">
        <Select
          value={sort}
          onChange={(e) => set({ sort: e.target.value as typeof sort })}
          className="h-7 flex-1 text-[12px]"
        >
          {(["updated", "created", "comments", "reactions", "interactions"] as const).map((s) => (
            <option key={s} value={s}>
              {t(`sort.${s}`)}
            </option>
          ))}
        </Select>
        <Segmented
          size="sm"
          value={order}
          onChange={(o) => set({ order: o })}
          options={[
            { value: "desc", label: "↓", title: t("sort.desc") },
            { value: "asc", label: "↑", title: t("sort.asc") },
          ]}
        />
      </div>
    </div>
  );
}

export const VIEW_ICONS: Record<BuiltinView, typeof Inbox> = {
  myOpen: Inbox,
  involving: MessageSquareDot,
  assigned: CircleUser,
  created: PenLine,
  mentioned: AtSign,
  unassigned: UserX,
  stale: Clock,
  recentlyClosed: CheckCheck,
};


export function useIssueChips(): FilterChip[] {
  const { t } = useTranslation("issues");
  const f = useIssuesUi((s) => s.filter);
  const raw = useIssuesUi((s) => s.rawQuery);
  const setFilter = useIssuesUi((s) => s.setFilter);
  if (raw !== null) return [];
  const c: FilterChip[] = [];
  const d = DEFAULT_ISSUE_FILTER;
  if (f.scope.kind === "repo" && f.scope.repo)
    c.push({
      id: "scope",
      facet: t("scope.repo"),
      value: f.scope.repo,
      onRemove: () => setFilter({ scope: d.scope }),
    });
  if (f.scope.kind === "everywhere")
    c.push({
      id: "scope",
      facet: t("panel.scope"),
      value: t("scope.everywhere"),
      onRemove: () => setFilter({ scope: d.scope }),
    });
  if (f.state !== d.state)
    c.push({
      id: "state",
      facet: t("panel.state"),
      value: t(`state.${f.state}`),
      onRemove: () => setFilter({ state: d.state, reason: "any" }),
    });
  if (f.reason !== "any")
    c.push({
      id: "reason",
      facet: t("panel.reason"),
      value: t(f.reason === "completed" ? "state.completed" : "state.notPlanned"),
      onRemove: () => setFilter({ reason: "any" }),
    });
  for (const l of f.labels)
    c.push({
      id: `l-${l}`,
      facet: t("chips.label"),
      value: l,
      onRemove: () => setFilter({ labels: f.labels.filter((x) => x !== l) }),
    });
  for (const l of f.excludeLabels)
    c.push({
      id: `x-${l}`,
      facet: t("chips.label"),
      value: l,
      negative: true,
      onRemove: () => setFilter({ excludeLabels: f.excludeLabels.filter((x) => x !== l) }),
    });
  if (f.noLabels)
    c.push({
      id: "nolabel",
      facet: t("chips.label"),
      value: t("people.none"),
      onRemove: () => setFilter({ noLabels: false }),
    });
  const person = (v: string) => (v === "@me" ? t("people.me") : v === "none" ? t("people.none") : `@${v}`);
  if (f.assignee)
    c.push({
      id: "assignee",
      facet: t("filters.assignee"),
      value: person(f.assignee),
      onRemove: () => setFilter({ assignee: "" }),
    });
  if (f.author)
    c.push({
      id: "author",
      facet: t("filters.author"),
      value: person(f.author),
      onRemove: () => setFilter({ author: "" }),
    });
  if (f.involves)
    c.push({
      id: "involves",
      facet: t("filters.involves"),
      value: person(f.involves),
      onRemove: () => setFilter({ involves: "" }),
    });
  if (f.mentions)
    c.push({
      id: "mentions",
      facet: t("chips.mentions"),
      value: person(f.mentions),
      onRemove: () => setFilter({ mentions: "" }),
    });
  if (f.milestone)
    c.push({
      id: "milestone",
      facet: t("filters.milestone"),
      value: f.milestone === "none" ? t("people.none") : f.milestone,
      onRemove: () => setFilter({ milestone: "" }),
    });
  if (f.staleDays)
    c.push({
      id: "stale",
      facet: t("chips.stale"),
      value: `> ${f.staleDays}d`,
      onRemove: () => setFilter({ staleDays: null }),
    });
  if (f.text)
    c.push({ id: "text", facet: t("chips.text"), value: f.text, onRemove: () => setFilter({ text: "" }) });
  if (f.extra)
    c.push({
      id: "extra",
      facet: t("chips.extra"),
      value: f.extra,
      onRemove: () => setFilter({ extra: "" }),
    });
  return c;
}
