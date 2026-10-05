import { Rocket } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { ReleasesPage } from "./ReleasesPage";

export default defineModule({
  id: "releases",
  pillar: "ship",
  order: 20,
  icon: Rocket,
  titleKey: "releases:title",
  sheets: { root: { component: ReleasesPage, kind: "list" } },
  requiredScopes: ["repo"],
});
