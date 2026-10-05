import { GitBranch } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { BranchesPage } from "./BranchesPage";
import { BranchesQueueSync } from "./BranchesQueueSync";

export default defineModule({
  id: "branches",
  pillar: "build",
  order: 30,
  icon: GitBranch,
  titleKey: "branches:title",
  sheets: { root: { component: BranchesPage, kind: "list" } },
  globals: [BranchesQueueSync],
  requiredScopes: ["repo"],
  settings: [
    {
      key: "staleDays",
      type: "number",
      labelKey: "branches:settings.staleDays",
      hintKey: "branches:settings.staleDaysHint",
      default: 90,
      min: 7,
      max: 730,
      step: 1,
    },
  ],
});
