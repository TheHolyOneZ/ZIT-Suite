import { CalendarClock } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { SchedulerRunner } from "./Runner";
import { SchedulerPage } from "./SchedulerPage";

export default defineModule({
  id: "scheduler",
  pillar: "ship",
  order: 30,
  icon: CalendarClock,
  titleKey: "scheduler:title",
  sheets: { root: { component: SchedulerPage, kind: "list" } },
  globals: [SchedulerRunner],
  requiredScopes: ["repo"],
});
