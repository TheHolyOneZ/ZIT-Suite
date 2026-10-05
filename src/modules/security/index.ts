import { RefreshCw, ShieldCheck, ToggleRight } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { rescanSecurity } from "./api";
import { DismissDialog } from "./DismissDialog";
import { FeaturesDialog } from "./FeaturesDialog";
import { FixSheet } from "./FixSheet";
import { GroupSheet } from "./GroupSheet";
import { RepoSecuritySheet } from "./RepoSecuritySheet";
import { SecurityPage } from "./SecurityPage";
import { SecuritySync } from "./SecuritySync";
import { useSecurityUi } from "./store";

export default defineModule({
  id: "security",
  pillar: "manage",
  order: 70,
  icon: ShieldCheck,
  titleKey: "security:title",
  navKey: "security:nav",
  sheets: {
    root: { component: SecurityPage, kind: "list" },
    group: { component: GroupSheet, kind: "detail", title: (p) => String(p.title) },
    fix: { component: FixSheet, kind: "detail", title: (p) => String(p.title) },
    repo: { component: RepoSecuritySheet, kind: "detail", title: (p) => String(p.title) },
  },
  globals: [SecuritySync, DismissDialog, FeaturesDialog],
  requiredScopes: ["repo"],
  commands: [
    {
      id: "features",
      titleKey: "security:switchFeatures",
      icon: ToggleRight,
      run: (c) => (c.navigate("security"), useSecurityUi.setState({ features: {} })),
    },
    { id: "rescan", titleKey: "security:rescan", icon: RefreshCw, run: () => void rescanSecurity() },
  ],
});
