import { GitPullRequest, GitPullRequestCreate, RefreshCw, Search } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { MOD } from "@/core/platform";
import { queryClient } from "@/core/query";
import { FileDiffSheet } from "./FileDiffSheet";
import { PullSheet } from "./PullSheet";
import { PullsPage } from "./PullsPage";
import { PullsQueueSync } from "./PullsQueueSync";
import { usePullsUi } from "./store";

export default defineModule({
  id: "pulls",
  pillar: "manage",
  order: 30,
  icon: GitPullRequest,
  titleKey: "pulls:title",
  sheets: {
    root: { component: PullsPage, kind: "list" },
    pull: { component: PullSheet, kind: "detail", title: (p) => `#${p.number}` },
    file: { component: FileDiffSheet, kind: "detail", title: (p) => String(p.title) },
  },
  globals: [PullsQueueSync],
  requiredScopes: ["repo"],
  commands: [
    {
      id: "new",
      titleKey: "pulls:create.button",
      icon: GitPullRequestCreate,
      run: (c) => (c.navigate("pulls"), usePullsUi.setState({ createOpen: true })),
    },
    {
      id: "search",
      titleKey: "pulls:commands.search",
      icon: Search,
      run: (c) => (c.navigate("pulls"), usePullsUi.setState((s) => ({ focusQuery: s.focusQuery + 1 }))),
    },
    {
      id: "refresh",
      titleKey: "pulls:query.refresh",
      icon: RefreshCw,
      run: () => void queryClient.invalidateQueries({ queryKey: ["pulls"] }),
    },
  ],
  shortcuts: [
    { keys: ["J", "K"], labelKey: "pulls:shortcuts.move" },
    { keys: ["X"], labelKey: "pulls:shortcuts.select" },
    { keys: ["Enter"], labelKey: "pulls:shortcuts.open" },
    { keys: ["Shift", "M"], labelKey: "pulls:shortcuts.merge" },
    { keys: ["[", "]"], labelKey: "pulls:shortcuts.files" },
    { keys: ["/"], labelKey: "pulls:shortcuts.query" },
    { keys: ["N"], labelKey: "pulls:shortcuts.new" },
    { keys: [MOD, "A"], labelKey: "pulls:shortcuts.selectAll" },
  ],
});
