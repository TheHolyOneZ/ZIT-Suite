import { Plus, RefreshCw, Webhook } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { rescanHooks } from "./api";
import { CreateHookDialog } from "./CreateHookDialog";
import { DeliverySheet } from "./DeliverySheet";
import { EditEndpointDialog } from "./EditEndpointDialog";
import { EndpointSheet } from "./EndpointSheet";
import { HookSheet } from "./HookSheet";
import { HooksSync } from "./HooksSync";
import { RepoHooksSheet } from "./RepoHooksSheet";
import { useHooksUi } from "./store";
import { WebhooksPage } from "./WebhooksPage";

export default defineModule({
  id: "webhooks",
  pillar: "manage",
  order: 50,
  icon: Webhook,
  titleKey: "webhooks:title",
  sheets: {
    root: { component: WebhooksPage, kind: "list" },
    endpoint: { component: EndpointSheet, kind: "detail", title: (p) => String(p.title) },
    repo: { component: RepoHooksSheet, kind: "detail", title: (p) => String(p.title) },
    hook: { component: HookSheet, kind: "detail", title: (p) => String(p.title) },
    delivery: { component: DeliverySheet, kind: "detail", title: (p) => String(p.title) },
  },
  globals: [HooksSync, CreateHookDialog, EditEndpointDialog],

  requiredScopes: ["repo"],
  commands: [
    {
      id: "new",
      titleKey: "webhooks:new",
      icon: Plus,
      run: (c) => (c.navigate("webhooks"), useHooksUi.setState({ create: { repos: [] } })),
    },
    { id: "rescan", titleKey: "webhooks:rescan", icon: RefreshCw, run: () => void rescanHooks() },
  ],
});
