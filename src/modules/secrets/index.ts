import { Braces, KeyRound, Layers, RefreshCw } from "lucide-react";
import { defineModule } from "@/core/modules/types";
import { rescanSecrets } from "./api";
import { EnvDialog } from "./EnvDialog";
import { EnvSheet } from "./EnvSheet";
import { RepoSecretsSheet } from "./RepoSecretsSheet";
import { SecretSheet } from "./SecretSheet";
import { SecretsPage } from "./SecretsPage";
import { SecretsSync } from "./SecretsSync";
import { useSecretsUi } from "./store";
import { ValueDialog } from "./ValueDialog";
import { VariableSheet } from "./VariableSheet";

export default defineModule({
  id: "secrets",
  pillar: "manage",
  order: 60,
  icon: KeyRound,
  titleKey: "secrets:title",
  navKey: "secrets:nav",
  sheets: {
    root: { component: SecretsPage, kind: "list" },
    secret: { component: SecretSheet, kind: "detail", title: (p) => String(p.title) },
    variable: { component: VariableSheet, kind: "detail", title: (p) => String(p.title) },
    env: { component: EnvSheet, kind: "detail", title: (p) => String(p.title) },
    repo: { component: RepoSecretsSheet, kind: "detail", title: (p) => String(p.title) },
  },
  globals: [SecretsSync, ValueDialog, EnvDialog],
  requiredScopes: ["repo"],
  commands: [
    {
      id: "secret",
      titleKey: "secrets:cmd.secret",
      icon: KeyRound,
      run: (c) => (c.navigate("secrets"), useSecretsUi.setState({ value: { kind: "secret" } })),
    },
    {
      id: "variable",
      titleKey: "secrets:cmd.variable",
      icon: Braces,
      run: (c) => (c.navigate("secrets"), useSecretsUi.setState({ value: { kind: "variable" } })),
    },
    {
      id: "env",
      titleKey: "secrets:cmd.env",
      icon: Layers,
      run: (c) => (c.navigate("secrets"), useSecretsUi.setState({ env: {} })),
    },
    { id: "rescan", titleKey: "secrets:rescan", icon: RefreshCw, run: () => void rescanSecrets() },
  ],
});
