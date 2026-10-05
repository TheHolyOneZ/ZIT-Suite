import { useTranslation } from "react-i18next";
import type { Role } from "@/core/ipc";
import { Select } from "@/ui";
import { ROLES } from "./model";

export function RoleSelect({ value, onChange, className }: { value: Role; onChange: (r: Role) => void; className?: string }) {
  const { t } = useTranslation("collaborators");
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as Role)} className={className ?? "h-7 w-[120px] text-[12px]"}>
      {[...ROLES].reverse().map((r) => (
        <option key={r} value={r}>
          {t(`roles.${r}`)}
        </option>
      ))}
    </Select>
  );
}
