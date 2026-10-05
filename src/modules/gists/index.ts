import { FileCode2, Plus, RefreshCw } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { refreshGists } from "./api";
import { GistSheet } from "./GistSheet";
import { GistsPage } from "./GistsPage";
import { NewGistDialog } from "./NewGistDialog";
import { useGistsUi } from "./store";

export default defineModule({
  id: "gists",
  pillar: "manage",
  order: 80,
  icon: FileCode2,
  titleKey: "gists:title",
  navKey: "gists:nav",
  sheets: {
    root: { component: GistsPage, kind: "list" },
    gist: { component: GistSheet, kind: "detail", title: (p) => String(p.title) },
  },
  globals: [NewGistDialog],
  requiredScopes: ["gist"],
  commands: [
    {
      id: "new",
      titleKey: "gists:new",
      icon: Plus,
      run: (c) => (c.navigate("gists"), useGistsUi.setState({ creating: true })),
    },
    { id: "refresh", titleKey: "gists:refresh", icon: RefreshCw, run: () => void refreshGists() },
  ],
});
