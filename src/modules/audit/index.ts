import { ScanLine } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { AuditPage } from "./AuditPage";

export default defineModule({
  id: "audit",
  pillar: "manage",
  order: 95,
  icon: ScanLine,
  titleKey: "audit:title",
  navKey: "audit:nav",
  sheets: { root: { component: AuditPage, kind: "list" } },
  requiredScopes: ["repo"],
});
