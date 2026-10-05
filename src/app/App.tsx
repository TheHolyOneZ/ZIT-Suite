import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { queryClient } from "@/core/query";
import { useEnabledModules } from "@/core/modules/registry";
import { useSession } from "@/core/store/session";
import { useSettings } from "@/core/store/settings";
import { useSheets } from "@/core/sheets/store";
import { useApplyTheme } from "@/core/theme/useTheme";
import { errorMessage } from "@/core/errors";
import { Plotter } from "@/ui";
import { AuthScreen } from "@/modules/auth/AuthScreen";
import { loadSession } from "@/modules/auth/api";
import { AppShell } from "./AppShell";
import { Logo } from "./Logo";
import { Toaster } from "./Toaster";
import { BareTitleBar, ResizeEdges } from "./WindowControls";

function Globals() {
  const modules = useEnabledModules();
  return <>{modules.flatMap((m) => (m.globals ?? []).map((G, i) => <G key={`${m.id}-${i}`} />))}</>;
}

function Gate() {
  const { t } = useTranslation();
  const session = useSession((s) => s.session);
  const adding = useSession((s) => s.addingAccount);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    loadSession().catch(setError);
  }, []);


  useEffect(
    () =>
      useSheets.subscribe((s, prev) => {
        if (s.active !== prev.active) useSettings.getState().set({ lastModule: s.active });
      }),
    [],
  );

  if (!session) {
    return (
      <div className="flex h-full flex-col">
        <BareTitleBar />
        <div className="blueprint-grid flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
          <Logo size={40} />
          <div className="w-40">{error ? <span className="text-danger">{errorMessage(error)}</span> : <Plotter />}</div>
          <span className="annot">{t("shell.booting")}</span>
        </div>
      </div>
    );
  }

  const signedIn = !!session.active;
  return (
    <>
      {signedIn && !adding ? (
        <>
          <AppShell />
          <Globals />
        </>
      ) : (
        <div className="flex h-full flex-col">
          <BareTitleBar />
          <div className="min-h-0 flex-1 overflow-auto">
            <AuthScreen />
          </div>
        </div>
      )}
      <Toaster />
    </>
  );
}

export function App() {
  useApplyTheme();
  return (
    <QueryClientProvider client={queryClient}>
      <Gate />
      <ResizeEdges />
    </QueryClientProvider>
  );
}
