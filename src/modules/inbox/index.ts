import { CheckCheck, Inbox, RefreshCw } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { readAll, refreshInbox } from "./api";
import { InboxPage } from "./InboxPage";
import { InboxStatusItem } from "./InboxStatusItem";
import { InboxSync } from "./InboxSync";
import { WatchingSheet } from "./WatchingSheet";

export default defineModule({
  id: "inbox",
  pillar: "manage",
  order: 15,
  icon: Inbox,
  titleKey: "inbox:title",
  navKey: "inbox:nav",
  sheets: {
    root: { component: InboxPage, kind: "list" },
    watching: { component: WatchingSheet, kind: "detail", title: (p) => String(p.title) },
  },
  globals: [InboxSync],
  statusItems: [InboxStatusItem],
  requiredScopes: ["notifications"],
  shortcuts: [
    { keys: ["J", "K"], labelKey: "inbox:keys.move" },
    { keys: ["Enter"], labelKey: "inbox:keys.open" },
    { keys: ["E"], labelKey: "inbox:keys.done" },
    { keys: ["R"], labelKey: "inbox:keys.read" },
    { keys: ["M"], labelKey: "inbox:keys.mute" },
    { keys: ["X"], labelKey: "inbox:keys.select" },
  ],
  commands: [
    { id: "readAll", titleKey: "inbox:readAll", icon: CheckCheck, run: () => void readAll(null) },
    { id: "refresh", titleKey: "inbox:refresh", icon: RefreshCw, run: () => void refreshInbox() },
  ],
});
