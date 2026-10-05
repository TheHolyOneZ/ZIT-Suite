import { FilePen } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { FilesPage } from "./FilesPage";

export default defineModule({
  id: "files",
  pillar: "build",
  order: 20,
  icon: FilePen,
  titleKey: "files:title",
  navKey: "files:nav",
  sheets: { root: { component: FilesPage, kind: "list" } },
  requiredScopes: ["repo"],
  shortcuts: [
    { keys: ["Ctrl", "S"], labelKey: "files:keys.stage" },
    { keys: ["Ctrl", "F"], labelKey: "files:keys.find" },
  ],
});
