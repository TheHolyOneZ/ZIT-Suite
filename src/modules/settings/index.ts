import { Settings } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { SettingsPage } from "./SettingsPage";
import { TrayBridge } from "./TrayBridge";

export default defineModule({
  id: "settings",
  pillar: "system",
  order: 100,
  icon: Settings,
  titleKey: "settings:title",
  sheets: { root: { component: SettingsPage } },
  globals: [TrayBridge],
  required: true,
});
