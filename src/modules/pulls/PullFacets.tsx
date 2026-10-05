import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCheck,
  CircleUser,
  Eye,
  FileClock,
  GitMerge,
  Inbox,
  PenLine,
  Tag,
  TriangleAlert,
} from "lucide-react";
import { useSession } from "@/core/store/session";
import { FacetColumn, FacetGrid, Input, Section, Segmented, Select, type FilterChip } from "@/ui";
import { RepoPicker } from "@/app/RepoPicker";
import { LabelChip } from "@/modules/issues/LabelChip";
import {
  DEFAULT_PULL_FILTER,
  type ChecksFilter,
  type DraftFilter,
  type PullSort,
  type PullView,
  type ReviewFilter,
} from "./query";
import { usePullsUi } from "./store";

export const PULL_VIEW_ICONS: Record<PullView, typeof Inbox> = {
  reviewRequested: Eye,
  mine: PenLine,
  myRepos: Inbox,
  assigned: CircleUser,
  failing: TriangleAlert,
  readyToMerge: GitMerge,
  drafts: FileClock,
  recentlyMerged: CheckCheck,
};

export function PullFacets() {
  const { t } = useTranslation("pulls");
  const ui = usePullsUi();
  const org = useSession((s) => s.org);
  const f = ui.filter;
  return (
    <FacetGrid>
      <FacetColumn>
        <Section title={t("facets.scope")}>
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
                { value: "mine", label: org ?? t("scope.mine") },
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
          </div>
        </Section>
        <Section title={t("facets.state")}>
          <Segmented
            className="w-full"
            size="sm"
            value={f.state}
            onChange={(state) => ui.setFilter({ state })}
            options={(["open", "merged", "closed", "all"] as const).map((v) => ({
              value: v,
              label: t(`stateFilter.${v}`),
            }))}
          />
        </Section>
        <Section title={t("facets.sort")}>
          <Select
            value={f.sort}
            onChange={(e) => ui.setFilter({ sort: e.target.value as PullSort })}
            className="h-7 text-[12px]"
          >
            {(["updated", "created", "comments", "best"] as const).map((v) => (
              <option key={v} value={v}>
                {t(`sort.${v}`)}
              </option>
            ))}
          </Select>
        </Section>
      </FacetColumn>
      <FacetColumn>
        <Section title={t("facets.review")}>
          <Select
            value={f.review}
            onChange={(e) => ui.setFilter({ review: e.target.value as ReviewFilter })}
            className="h-7 text-[12px]"
          >
            {(["any", "none", "required", "approved", "changes_requested"] as const).map((v) => (
              <option key={v} value={v}>
                {t(`reviewFilter.${v}`)}
              </option>
            ))}
          </Select>
        </Section>
        <Section title={t("facets.checks")}>
          <Segmented
            className="w-full"
            size="sm"
            value={f.checks}
            onChange={(checks: ChecksFilter) => ui.setFilter({ checks })}
            options={(["any", "success", "failure", "pending"] as const).map((v) => ({
              value: v,
              label: t(`checksFilter.${v}`),
            }))}
          />
        </Section>
        <Section title={t("facets.draft")}>
          <Segmented
            className="w-full"
            size="sm"
            value={f.draft}
            onChange={(draft: DraftFilter) => ui.setFilter({ draft })}
            options={(["any", "ready", "draft"] as const).map((v) => ({
              value: v,
              label: t(`draftFilter.${v}`),
            }))}
          />
        </Section>
        <LabelsFacet />
      </FacetColumn>
      <FacetColumn>
        <Section title={t("facets.people")}>
          <div className="space-y-2">
            <Person
              label={t("facets.author")}
              value={f.author}
              onChange={(author) => ui.setFilter({ author })}
            />
            <Person
              label={t("facets.assignee")}
              value={f.assignee}
              onChange={(assignee) => ui.setFilter({ assignee })}
            />
            <Person
              label={t("facets.reviewRequested")}
              value={f.reviewRequested}
              onChange={(reviewRequested) => ui.setFilter({ reviewRequested })}
            />
            <Person
              label={t("facets.involves")}
              value={f.involves}
              onChange={(involves) => ui.setFilter({ involves })}
            />
          </div>
        </Section>
      </FacetColumn>
    </FacetGrid>
  );
}

function Person({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation("pulls");
  const [draft, setDraft] = useState(value === "@me" ? "" : value);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12px] text-dim">
        {label}
        <button
          type="button"
          onClick={() => onChange(value === "@me" ? "" : "@me")}
          className={`text-[11px] cursor-default ${value === "@me" ? "text-accent" : "text-faint hover:text-text"}`}
        >
          {t("people.me")}
        </button>
      </div>
      <Input
        value={value === "@me" ? "" : draft}
        disabled={value === "@me"}
        placeholder={value === "@me" ? t("people.meActive") : "login"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() !== value && onChange(draft.trim())}
        onKeyDown={(e) => e.key === "Enter" && onChange(draft.trim())}
        className="num h-7 text-[12px]"
      />
    </div>
  );
}

function LabelsFacet() {
  const { t } = useTranslation("pulls");
  const f = usePullsUi((s) => s.filter);
  const setFilter = usePullsUi((s) => s.setFilter);
  const [draft, setDraft] = useState("");
  return (
    <Section title={t("facets.labels")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) setFilter({ labels: [...new Set([...f.labels, draft.trim()])] });
          setDraft("");
        }}
      >
        <Input
          icon={Tag}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("facets.addLabel")}
          className="h-7 text-[12px]"
        />
      </form>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {f.labels.map((l) => (
          <LabelChip
            key={l}
            label={{ name: l, color: "888888" }}
            onRemove={() => setFilter({ labels: f.labels.filter((x) => x !== l) })}
          />
        ))}
      </div>
    </Section>
  );
}

export function usePullChips(): FilterChip[] {
  const { t } = useTranslation("pulls");
  const f = usePullsUi((s) => s.filter);
  const raw = usePullsUi((s) => s.rawQuery);
  const setFilter = usePullsUi((s) => s.setFilter);
  if (raw !== null) return [];
  const d = DEFAULT_PULL_FILTER;
  const c: FilterChip[] = [];
  const person = (v: string) => (v === "@me" ? t("people.me") : `@${v}`);
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
      facet: t("facets.scope"),
      value: t("scope.everywhere"),
      onRemove: () => setFilter({ scope: d.scope }),
    });
  if (f.state !== d.state)
    c.push({
      id: "state",
      facet: t("facets.state"),
      value: t(`stateFilter.${f.state}`),
      onRemove: () => setFilter({ state: d.state }),
    });
  if (f.review !== "any")
    c.push({
      id: "review",
      facet: t("facets.review"),
      value: t(`reviewFilter.${f.review}`),
      onRemove: () => setFilter({ review: "any" }),
    });
  if (f.checks !== "any")
    c.push({
      id: "checks",
      facet: t("facets.checks"),
      value: t(`checksFilter.${f.checks}`),
      onRemove: () => setFilter({ checks: "any" }),
    });
  if (f.draft !== "any")
    c.push({
      id: "draft",
      facet: t("facets.draft"),
      value: t(`draftFilter.${f.draft}`),
      onRemove: () => setFilter({ draft: "any" }),
    });
  for (const l of f.labels)
    c.push({
      id: `l-${l}`,
      facet: t("facets.labels"),
      value: l,
      onRemove: () => setFilter({ labels: f.labels.filter((x) => x !== l) }),
    });
  if (f.author)
    c.push({
      id: "author",
      facet: t("facets.author"),
      value: person(f.author),
      onRemove: () => setFilter({ author: "" }),
    });
  if (f.assignee)
    c.push({
      id: "assignee",
      facet: t("facets.assignee"),
      value: person(f.assignee),
      onRemove: () => setFilter({ assignee: "" }),
    });
  if (f.reviewRequested)
    c.push({
      id: "rr",
      facet: t("facets.reviewRequested"),
      value: person(f.reviewRequested),
      onRemove: () => setFilter({ reviewRequested: "" }),
    });
  if (f.involves)
    c.push({
      id: "inv",
      facet: t("facets.involves"),
      value: person(f.involves),
      onRemove: () => setFilter({ involves: "" }),
    });
  if (f.text)
    c.push({ id: "text", facet: t("facets.text"), value: f.text, onRemove: () => setFilter({ text: "" }) });
  if (f.extra)
    c.push({
      id: "extra",
      facet: t("facets.query"),
      value: f.extra,
      onRemove: () => setFilter({ extra: "" }),
    });
  return c;
}
