import { LayoutGrid, Workflow } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { ActionsPage } from "./ActionsPage";
import { RunSheet } from "./RunSheet";
import { useActionsUi } from "./store";

export default defineModule({
  id: "actions",
  pillar: "ship",
  order: 10,
  icon: Workflow,
  titleKey: "actions:title",
  sheets: {
    root: { component: ActionsPage, kind: "list" },
    run: { component: RunSheet, kind: "detail", title: (p) => String(p.title) },
  },
  requiredScopes: ["repo", "workflow"],
  commands: [
    {
      id: "board",
      titleKey: "actions:views.board",
      icon: LayoutGrid,
      run: (c) => (c.navigate("actions"), useActionsUi.setState({ view: "board" })),
    },
  ],
});
