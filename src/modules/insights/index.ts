import { BarChart3 } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { InsightsPage } from "./InsightsPage";

export default defineModule({
  id: "insights",
  pillar: "manage",
  order: 92,
  icon: BarChart3,
  titleKey: "insights:title",
  navKey: "insights:nav",
  sheets: { root: { component: InsightsPage, kind: "list" } },
  requiredScopes: ["repo"],
});
