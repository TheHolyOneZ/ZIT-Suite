import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/jetbrains-mono";
import "./core/theme/tokens.css";
import { detectLanguage, initI18n } from "./core/i18n";
import { useSettings } from "./core/store/settings";
import { useSheets } from "./core/sheets/store";
import { App } from "./app/App";

async function bootstrap() {
  await useSettings.persist.rehydrate();
  const settings = useSettings.getState();
  await initI18n(settings.language ?? detectLanguage());
  useSheets.setState({ active: settings.lastModule });

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
