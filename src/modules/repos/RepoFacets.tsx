import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tag } from "lucide-react";
import { cn } from "@/core/cn";
import { formatNumber } from "@/core/i18n/format";
import {
  Badge,
  Button,
  Checkbox,
  FacetColumn,
  FacetGrid,
  IconButton,
  Input,
  Mark,
  Section,
  Segmented,
  type FilterChip,
} from "@/ui";
import { useRepoRows } from "./api";
import { DEFAULT_FILTER, NO_LANGUAGE, type Range, type TriState } from "./filters";
import { HEALTH_ORDER, healthGlyph, healthTone } from "./health";
import { languageColor } from "./languageColors";
import { BUILTIN_TAGS, tagTone, useReposPrefs, useReposUi } from "./store";


export function RepoFacets() {
  const { t } = useTranslation(["repos", "common"]);
  const { rows } = useRepoRows();
  const filter = useReposUi((s) => s.filter);
  const setFilter = useReposUi((s) => s.setFilter);

  const languages = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows)
      m.set(r.repo.language ?? NO_LANGUAGE, (m.get(r.repo.language ?? NO_LANGUAGE) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const healthCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.health.status] = (c[r.health.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <FacetGrid>
      <FacetColumn>
        <Section title={t("panel.health")}>
          <div className="space-y-0.5">
            {HEALTH_ORDER.map((h) => (
              <Row
                key={h}
                active={filter.health.includes(h)}
                onClick={() => setFilter({ health: toggleIn(filter.health, h) })}
                count={healthCounts[h] ?? 0}
              >
                <Mark glyph={healthGlyph[h]} tone={healthTone[h]} size={12} />
                {t(`health.${h}`)}
              </Row>
            ))}
          </div>
        </Section>

        <Section title={t("panel.visibility")}>
          <Segmented
            className="w-full"
            size="sm"
            value={filter.visibility}
            onChange={(visibility) => setFilter({ visibility })}
            options={[
              { value: "all", label: t("visibility.all") },
              { value: "public", label: t("visibility.public") },
              { value: "private", label: t("visibility.private") },
            ]}
          />
        </Section>

        <Section title={t("panel.type")}>
          <div className="space-y-2">
            <TriRow label={t("filters.forks")} value={filter.fork} onChange={(fork) => setFilter({ fork })} />
            <TriRow
              label={t("filters.templates")}
              value={filter.template}
              onChange={(template) => setFilter({ template })}
            />
            <Checkbox
              checked={filter.hasIssues}
              onChange={(hasIssues) => setFilter({ hasIssues })}
              label={t("filters.hasIssues")}
            />
          </div>
        </Section>
      </FacetColumn>
      <FacetColumn>
        <Section title={t("panel.languages")}>
          <div className="space-y-0.5">
            {languages.map(([lang, n]) => (
              <Row
                key={lang}
                active={filter.languages.includes(lang)}
                onClick={() => setFilter({ languages: toggleIn(filter.languages, lang) })}
                count={n}
              >
                <span
                  className="size-2 rounded-[1px]"
                  style={{ background: languageColor(lang === NO_LANGUAGE ? null : lang) }}
                />
                {lang === NO_LANGUAGE ? t("filters.noLanguage") : lang}
              </Row>
            ))}
          </div>
        </Section>
      </FacetColumn>
      <FacetColumn>
        <TagsSection />

        <Section title={t("panel.ranges")}>
          <div className="space-y-3">
            <RangeRow
              label={t("filters.stars")}
              value={filter.stars}
              onChange={(stars) => setFilter({ stars })}
            />
            <RangeRow
              label={t("filters.sizeMb")}
              value={filter.sizeKb.map((v) => (v == null ? null : v / 1024)) as Range}
              onChange={(r) => setFilter({ sizeKb: r.map((v) => (v == null ? null : v * 1024)) as Range })}
            />
            <div>
              <div className="mb-1 text-[12px] text-dim">{t("filters.created")}</div>
              <div className="grid grid-cols-2 gap-1.5">
                <Input
                  type="date"
                  value={filter.createdAfter ?? ""}
                  onChange={(e) => setFilter({ createdAfter: e.target.value || null })}
                  className="num h-7 px-1.5 text-[11.5px]"
                />
                <Input
                  type="date"
                  value={filter.createdBefore ?? ""}
                  onChange={(e) => setFilter({ createdBefore: e.target.value || null })}
                  className="num h-7 px-1.5 text-[11.5px]"
                />
              </div>
            </div>
          </div>
        </Section>
      </FacetColumn>
    </FacetGrid>
  );
}

function Row({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-7 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[12.5px] cursor-default",
        active
          ? "bg-surface-2 text-text shadow-[inset_2px_0_0_var(--accent)]"
          : "text-dim hover:bg-surface-2 hover:text-text",
      )}
    >
      {children}
      <span className="num ml-auto text-[11px] text-faint">{formatNumber(count)}</span>
    </button>
  );
}

function TriRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TriState;
  onChange: (v: TriState) => void;
}) {
  const { t } = useTranslation(["repos", "common"]);
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12.5px] text-dim">{label}</span>
      <Segmented
        size="sm"
        value={value}
        onChange={onChange}
        options={[
          { value: "any", label: t("tri.any") },
          { value: "only", label: t("tri.only") },
          { value: "exclude", label: t("tri.exclude") },
        ]}
      />
    </div>
  );
}

function RangeRow({ label, value, onChange }: { label: string; value: Range; onChange: (r: Range) => void }) {
  const { t } = useTranslation(["repos", "common"]);
  const parse = (s: string) => (s === "" ? null : Math.max(0, Number(s)));
  return (
    <div>
      <div className="mb-1 text-[12px] text-dim">{label}</div>
      <div className="grid grid-cols-2 gap-1.5">
        <Input
          type="number"
          min={0}
          placeholder={t("filters.min")}
          value={value[0] ?? ""}
          onChange={(e) => onChange([parse(e.target.value), value[1]])}
          className="num h-7 text-[12px]"
        />
        <Input
          type="number"
          min={0}
          placeholder={t("filters.max")}
          value={value[1] ?? ""}
          onChange={(e) => onChange([value[0], parse(e.target.value)])}
          className="num h-7 text-[12px]"
        />
      </div>
    </div>
  );
}

function TagsSection() {
  const { t } = useTranslation(["repos", "common"]);
  const { rows } = useRepoRows();
  const custom = useReposPrefs((s) => s.customTags);
  const addCustom = useReposPrefs((s) => s.addCustomTag);
  const removeCustom = useReposPrefs((s) => s.removeCustomTag);
  const filter = useReposUi((s) => s.filter);
  const setFilter = useReposUi((s) => s.setFilter);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");


  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) for (const tg of r.tags) c[tg] = (c[tg] ?? 0) + 1;
    return c;
  }, [rows]);
  const all = [...BUILTIN_TAGS, ...custom];

  return (
    <Section
      title={t("panel.tags")}
      aside={
        <IconButton
          icon={Tag}
          label={t("tags.new")}
          size={13}
          className="size-6"
          onClick={() => setAdding(true)}
        />
      }
    >
      {adding && (
        <form
          className="mb-2"
          onSubmit={(e) => {
            e.preventDefault();
            addCustom(name);
            setName("");
            setAdding(false);
          }}
        >
          <Input
            autoFocus
            placeholder={t("tags.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => !name && setAdding(false)}
            className="h-7 text-[12px]"
          />
        </form>
      )}
      <div className="flex flex-wrap gap-1">
        {all.map((tg) => {
          const on = filter.tags.includes(tg);
          return (
            <button
              key={tg}
              onClick={() =>
                setFilter({ tags: on ? filter.tags.filter((x) => x !== tg) : [...filter.tags, tg] })
              }
              onContextMenu={(e) => {
                if (custom.includes(tg)) {
                  e.preventDefault();
                  removeCustom(tg);
                }
              }}
              title={custom.includes(tg) ? t("tags.removeHint") : undefined}
              className={cn("cursor-default rounded-[3px]", on && "ring-1 ring-accent")}
            >
              <Badge tone={tagTone(tg)}>
                {(BUILTIN_TAGS as readonly string[]).includes(tg)
                  ? t(`tags.builtin.${tg as (typeof BUILTIN_TAGS)[number]}`)
                  : tg}
                <span className="num opacity-70">{counts[tg] ?? 0}</span>
              </Badge>
            </button>
          );
        })}
      </div>
      {filter.tags.length > 0 && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setFilter({ tags: [] })}>
          {t("tags.clearFilter")}
        </Button>
      )}
    </Section>
  );
}


export function useRepoChips(): FilterChip[] {
  const { t } = useTranslation("repos");
  const f = useReposUi((s) => s.filter);
  const setFilter = useReposUi((s) => s.setFilter);
  const chips: FilterChip[] = [];
  const range = ([a, b]: Range, unit = "") => `${a ?? "0"}–${b ?? "∞"}${unit}`;
  for (const h of f.health)
    chips.push({
      id: `h-${h}`,
      facet: t("panel.health"),
      value: t(`health.${h}`),
      onRemove: () => setFilter({ health: f.health.filter((x) => x !== h) }),
    });
  if (f.visibility !== "all")
    chips.push({
      id: "vis",
      facet: t("panel.visibility"),
      value: t(`visibility.${f.visibility}`),
      onRemove: () => setFilter({ visibility: "all" }),
    });
  if (f.fork !== "any")
    chips.push({
      id: "fork",
      facet: t("filters.forks"),
      value: t(`tri.${f.fork}`),
      onRemove: () => setFilter({ fork: "any" }),
    });
  if (f.template !== "any")
    chips.push({
      id: "tpl",
      facet: t("filters.templates"),
      value: t(`tri.${f.template}`),
      onRemove: () => setFilter({ template: "any" }),
    });
  if (f.hasIssues)
    chips.push({
      id: "iss",
      facet: t("columns.issues"),
      value: "> 0",
      onRemove: () => setFilter({ hasIssues: false }),
    });
  for (const l of f.languages)
    chips.push({
      id: `l-${l}`,
      facet: t("columns.language"),
      value: l === NO_LANGUAGE ? t("filters.noLanguage") : l,
      onRemove: () => setFilter({ languages: f.languages.filter((x) => x !== l) }),
    });
  for (const tg of f.tags)
    chips.push({
      id: `t-${tg}`,
      facet: t("panel.tags"),
      value: tg,
      onRemove: () => setFilter({ tags: f.tags.filter((x) => x !== tg) }),
    });
  if (f.stars[0] != null || f.stars[1] != null)
    chips.push({
      id: "stars",
      facet: "★",
      value: range(f.stars),
      onRemove: () => setFilter({ stars: DEFAULT_FILTER.stars }),
    });
  if (f.sizeKb[0] != null || f.sizeKb[1] != null)
    chips.push({
      id: "size",
      facet: t("columns.size"),
      value: range(f.sizeKb.map((v) => (v == null ? null : Math.round(v / 1024))) as Range, " MB"),
      onRemove: () => setFilter({ sizeKb: DEFAULT_FILTER.sizeKb }),
    });
  if (f.createdAfter || f.createdBefore)
    chips.push({
      id: "created",
      facet: t("detail.created"),
      value: `${f.createdAfter ?? "…"} → ${f.createdBefore ?? "…"}`,
      onRemove: () => setFilter({ createdAfter: null, createdBefore: null }),
    });
  return chips;
}
