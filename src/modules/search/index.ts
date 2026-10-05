import { Search } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { SearchPage } from "./SearchPage";

export default defineModule({
  id: "search",
  pillar: "manage",
  order: 90,
  icon: Search,
  titleKey: "search:title",
  navKey: "search:nav",
  sheets: { root: { component: SearchPage, kind: "list" } },
  requiredScopes: ["repo"],
});
