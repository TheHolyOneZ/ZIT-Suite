import { FolderPlus, House } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { AddWorkspaceDialog } from "./AddWorkspaceDialog";
import { CloneHost } from "./CloneDialog";
import { ConflictHost } from "./WorkTools";
import { HomePage } from "./HomePage";
import { HomeSync } from "./HomeSync";
import { useHomeUi } from "./store";
import { WorkspaceSheet } from "./WorkspaceSheet";

export default defineModule({
  id: "home",
  pillar: "build",
  order: 10,
  icon: House,
  titleKey: "home:title",
  navKey: "home:nav",
  sheets: {
    root: { component: HomePage, kind: "list" },
    workspace: { component: WorkspaceSheet, kind: "detail", title: (p) => String(p.title) },
  },
  globals: [HomeSync, AddWorkspaceDialog, CloneHost, ConflictHost],
  requiredScopes: ["repo"],
  commands: [
    {
      id: "add",
      titleKey: "home:add",
      icon: FolderPlus,
      run: (c) => (c.navigate("home"), useHomeUi.setState({ add: "" })),
    },
  ],
});
