import { RefreshCw, UserPlus, Users } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { AccessSync } from "./AccessSync";
import { CollaboratorsPage } from "./CollaboratorsPage";
import { PersonSheet } from "./PersonSheet";
import { RepoAccessSheet } from "./RepoAccessSheet";
import { useAccessUi } from "./store";
import { rescanAccess } from "./api";

export default defineModule({
  id: "collaborators",
  pillar: "manage",
  order: 40,
  icon: Users,
  titleKey: "collaborators:title",
  sheets: {
    root: { component: CollaboratorsPage, kind: "list" },
    person: { component: PersonSheet, kind: "detail", title: (p) => `@${p.login}` },
    repo: { component: RepoAccessSheet, kind: "detail", title: (p) => String(p.title) },
  },
  globals: [AccessSync],
  requiredScopes: ["repo"],
  commands: [
    { id: "grant", titleKey: "collaborators:grant.button", icon: UserPlus, run: (c) => (c.navigate("collaborators"), useAccessUi.setState({ grant: { users: [], repos: [], mode: "add" } })) },
    { id: "rescan", titleKey: "collaborators:rescan", icon: RefreshCw, run: () => void rescanAccess() },
  ],
});
