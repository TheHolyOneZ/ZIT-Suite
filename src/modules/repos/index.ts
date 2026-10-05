import { FolderGit2, RefreshCw, Search, Sparkles, SquareCheck, SquareDashed } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { MOD } from "@/core/platform";
import { refreshRepos } from "./api";
import { ReposPage } from "./ReposPage";
import { RepoSheet } from "./RepoSheet";
import { ReposQueueSync } from "./ReposQueueSync";
import { useReposUi } from "./store";

export default defineModule({
  id: "repos",
  pillar: "manage",
  order: 10,
  icon: FolderGit2,
  titleKey: "repos:title",
  sheets: {
    root: { component: ReposPage, kind: "list" },
    repo: { component: RepoSheet, kind: "detail", title: (p) => String(p.name) },
  },
  globals: [ReposQueueSync],
  requiredScopes: ["repo", "delete_repo"],
  settings: [
    {
      key: "activeDays",
      type: "number",
      labelKey: "repos:settings.activeDays",
      hintKey: "repos:settings.activeDaysHint",
      default: 30,
      min: 1,
      max: 365,
    },
    {
      key: "dormantDays",
      type: "number",
      labelKey: "repos:settings.dormantDays",
      hintKey: "repos:settings.dormantDaysHint",
      default: 180,
      min: 7,
      max: 1825,
    },
  ],
  commands: [
    {
      id: "refresh",
      titleKey: "repos:actions.refresh",
      icon: RefreshCw,
      shortcut: "R",
      run: () => void refreshRepos(),
    },
    {
      id: "search",
      titleKey: "repos:commands.search",
      icon: Search,
      shortcut: "F",
      run: (c) => (c.navigate("repos"), useReposUi.setState((s) => ({ searchFocus: s.searchFocus + 1 }))),
    },
    {
      id: "cleanup",
      titleKey: "repos:actions.cleanup",
      icon: Sparkles,
      run: (c) => (c.navigate("repos"), useReposUi.setState({ cleanupOpen: true })),
    },
    {
      id: "clearSelection",
      titleKey: "repos:selection.clear",
      icon: SquareDashed,
      run: () => useReposUi.setState({ selected: new Set() }),
    },
    {
      id: "resetFilters",
      titleKey: "repos:commands.resetFilters",
      icon: SquareCheck,
      run: () => useReposUi.getState().resetFilter(),
    },
  ],
  shortcuts: [
    { keys: ["J", "K"], labelKey: "repos:shortcuts.move" },
    { keys: ["Space"], labelKey: "repos:shortcuts.select" },
    { keys: ["Enter"], labelKey: "repos:shortcuts.open" },
    { keys: [MOD, "A"], labelKey: "repos:shortcuts.selectAll" },
    { keys: ["A"], labelKey: "repos:shortcuts.archive" },
    { keys: ["D"], labelKey: "repos:shortcuts.delete" },
    { keys: ["R"], labelKey: "repos:shortcuts.refresh" },
    { keys: ["F"], labelKey: "repos:shortcuts.search" },
    { keys: ["Esc"], labelKey: "repos:shortcuts.escape" },
  ],
});
