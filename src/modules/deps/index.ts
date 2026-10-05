import { Boxes } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { DepsPage } from "./DepsPage";

export default defineModule({
  id: "deps",
  pillar: "build",
  order: 40,
  icon: Boxes,
  titleKey: "deps:title",
  navKey: "deps:nav",
  sheets: { root: { component: DepsPage, kind: "list" } },
  requiredScopes: ["repo"],
});
