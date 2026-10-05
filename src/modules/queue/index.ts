import { ListChecks, Play } from "lucide-react";
import { commands } from "@/core/ipc";
import { defineModule } from "@/core/modules/types";
import { useSettings } from "@/core/store/settings";
import { ConfirmDialog } from "./ConfirmDialog";
import { QueueBridge } from "./QueueBridge";
import { QueuePage } from "./QueuePage";
import { QueueStatusItem } from "./QueueStatusItem";

export default defineModule({
  id: "queue",
  pillar: "system",
  order: 10,
  icon: ListChecks,
  titleKey: "queue:title",
  sheets: { root: { component: QueuePage } },
  globals: [QueueBridge, ConfirmDialog],
  statusItems: [QueueStatusItem],
  required: true,
  commands: [
    {
      id: "start",
      titleKey: "queue:controls.start",
      icon: Play,
      run: () => void commands.queueStart(useSettings.getState().graceSeconds),
    },
  ],
});
