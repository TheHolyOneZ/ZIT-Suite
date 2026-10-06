import { CloudUpload } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { UploadPage } from "./UploadPage";

export default defineModule({
  id: "upload",
  pillar: "build",
  order: 15,
  icon: CloudUpload,
  titleKey: "upload:title",
  navKey: "upload:nav",
  sheets: { root: { component: UploadPage, kind: "list" } },
  requiredScopes: ["repo"],
});
