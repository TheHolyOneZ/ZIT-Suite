import { RefreshCw, Star } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { refreshStars } from "./api";
import { StarsPage } from "./StarsPage";
import { useStarsUi } from "./store";

export default defineModule({
  id: "stars",
  pillar: "manage",
  order: 85,
  icon: Star,
  titleKey: "stars:title",
  navKey: "stars:nav",
  sheets: { root: { component: StarsPage, kind: "list" } },
  requiredScopes: ["user"],
  commands: [
    { id: "star", titleKey: "stars:starRepo", icon: Star, run: (c) => (c.navigate("stars"), useStarsUi.setState({ adding: true })) },
    { id: "refresh", titleKey: "stars:refresh", icon: RefreshCw, run: () => void refreshStars() },
  ],
});
