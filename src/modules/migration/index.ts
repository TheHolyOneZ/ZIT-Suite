import { ArrowRightLeft } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { MigrationPage } from "./MigrationPage";

export default defineModule({
  id: "migration",
  pillar: "ship",
  order: 40,
  icon: ArrowRightLeft,
  titleKey: "migration:title",
  sheets: { root: { component: MigrationPage, kind: "list" } },
  requiredScopes: ["repo"],
});
