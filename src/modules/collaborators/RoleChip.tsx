import { useTranslation } from "react-i18next";
import type { Role } from "@/core/ipc";
import { cn } from "@/core/cn";
import { toneVar } from "@/ui/Status";
import { ROLE_LETTER, ROLE_TONE } from "./model";


export function RoleCell({ role, invited, size = 20, className }: { role: Role; invited?: boolean; size?: number; className?: string }) {
  const { t } = useTranslation("collaborators");
  const c = toneVar[ROLE_TONE[role]];
  return (
    <span
      title={`${t(`roles.${role}`)}${invited ? ` · ${t("invited")}` : ""}`}
      className={cn("num inline-flex shrink-0 items-center justify-center rounded-[2px] text-[10px] font-semibold", className)}
      style={{
        width: size,
        height: size,
        color: c,
        border: `1px ${invited ? "dashed" : "solid"} color-mix(in srgb, ${c} 60%, transparent)`,
        background: invited ? "transparent" : `color-mix(in srgb, ${c} 14%, transparent)`,
      }}
    >
      {ROLE_LETTER[role]}
    </span>
  );
}

export function RoleLabel({ role }: { role: Role }) {
  const { t } = useTranslation("collaborators");
  return (
    <span className="flex items-center gap-1.5">
      <RoleCell role={role} size={16} />
      <span>{t(`roles.${role}`)}</span>
    </span>
  );
}
