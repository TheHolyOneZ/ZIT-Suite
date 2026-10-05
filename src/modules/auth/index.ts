import { KeyRound } from "lucide-react";
import { defineModule } from "@/core/modules/types";


export default defineModule({
  id: "auth",
  pillar: "system",
  order: 0,
  icon: KeyRound,
  titleKey: "auth:title",
  hidden: true,
  required: true,
});
