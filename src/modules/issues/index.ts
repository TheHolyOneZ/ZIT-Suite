import { Ticket, CirclePlus, Flag, RefreshCw, Search, Tags } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { MOD } from "@/core/platform";
import { queryClient } from "@/core/query";
import { IssuesPage } from "./IssuesPage";
import { IssueSheet } from "./IssueSheet";
import { IssuesQueueSync } from "./IssuesQueueSync";
import { useIssuesUi } from "./store";

export default defineModule({
  id: "issues",
  pillar: "manage",
  order: 20,
  icon: Ticket,
  titleKey: "issues:title",
  sheets: {
    root: { component: IssuesPage, kind: "list" },
    issue: { component: IssueSheet, kind: "detail", title: (p) => `#${p.number}` },
  },
  globals: [IssuesQueueSync],
  requiredScopes: ["repo"],
  commands: [
    {
      id: "new",
      titleKey: "issues:create.button",
      icon: CirclePlus,
      shortcut: "N",
      run: (c) => (c.navigate("issues"), useIssuesUi.setState({ createOpen: true })),
    },
    {
      id: "search",
      titleKey: "issues:commands.search",
      icon: Search,
      shortcut: "/",
      run: (c) => (
        c.navigate("issues"),
        useIssuesUi.setState((s) => ({ tab: "issues", focusQuery: s.focusQuery + 1 }))
      ),
    },
    {
      id: "labels",
      titleKey: "issues:commands.labels",
      icon: Tags,
      run: (c) => (c.navigate("issues"), useIssuesUi.setState({ tab: "labels" })),
    },
    {
      id: "milestones",
      titleKey: "issues:commands.milestones",
      icon: Flag,
      run: (c) => (c.navigate("issues"), useIssuesUi.setState({ tab: "milestones" })),
    },
    {
      id: "refresh",
      titleKey: "issues:query.refresh",
      icon: RefreshCw,
      run: () => void queryClient.invalidateQueries({ queryKey: ["issues", "search"] }),
    },
  ],
  shortcuts: [
    { keys: ["J", "K"], labelKey: "issues:shortcuts.move" },
    { keys: ["X"], labelKey: "issues:shortcuts.select" },
    { keys: ["Enter"], labelKey: "issues:shortcuts.open" },
    { keys: ["C"], labelKey: "issues:shortcuts.comment" },
    { keys: ["E"], labelKey: "issues:shortcuts.close" },
    { keys: ["O"], labelKey: "issues:shortcuts.reopen" },
    { keys: ["L"], labelKey: "issues:shortcuts.labels" },
    { keys: ["A"], labelKey: "issues:shortcuts.assignees" },
    { keys: ["M"], labelKey: "issues:shortcuts.milestone" },
    { keys: ["/"], labelKey: "issues:shortcuts.query" },
    { keys: ["N"], labelKey: "issues:shortcuts.new" },
    { keys: [MOD, "A"], labelKey: "issues:shortcuts.selectAll" },
  ],
});
