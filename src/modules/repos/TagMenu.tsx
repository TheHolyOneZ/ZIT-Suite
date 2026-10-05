import { useTranslation } from "react-i18next";
import { Check, Tag } from "lucide-react";
import { Badge, Button, MenuItem, Popover } from "@/ui";
import { BUILTIN_TAGS, tagTone, useReposPrefs } from "./store";

export function useTagLabel() {
  const { t } = useTranslation("repos");
  return (tag: string) =>
    (BUILTIN_TAGS as readonly string[]).includes(tag)
      ? t(`tags.builtin.${tag as (typeof BUILTIN_TAGS)[number]}`)
      : tag;
}


export function TagMenu({ repos, size = "sm" }: { repos: string[]; size?: "sm" | "md" }) {
  const { t } = useTranslation("repos");
  const tags = useReposPrefs((s) => s.tags);
  const custom = useReposPrefs((s) => s.customTags);
  const toggle = useReposPrefs((s) => s.toggleTag);
  const label = useTagLabel();

  return (
    <Popover
      placement="top-start"
      trigger={(p) => (
        <Button {...p} size={size} icon={Tag}>
          {t("actions.tag")}
        </Button>
      )}
    >
      {[...BUILTIN_TAGS, ...custom].map((tg) => {
        const n = repos.filter((r) => tags[r]?.includes(tg)).length;
        return (
          <MenuItem
            key={tg}
            onClick={() => toggle(repos, tg)}
            trailing={
              n === repos.length ? (
                <Check size={13} className="text-accent" />
              ) : n > 0 ? (
                <span className="num text-[10.5px] text-faint">{n}</span>
              ) : null
            }
          >
            <Badge tone={tagTone(tg)}>{label(tg)}</Badge>
          </MenuItem>
        );
      })}
    </Popover>
  );
}
