import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { motion } from "framer-motion";
import { ArrowLeft, Copy, ExternalLink, Eye, EyeOff, KeyRound, Lock, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { commands } from "@/core/ipc";
import { errorDetail, errorMessage } from "@/core/errors";
import { useSession } from "@/core/store/session";
import { Badge, Button, Input, Label, Panel, Plotter, Segmented } from "@/ui";
import { LanguageThemeControls } from "@/app/LanguageThemeControls";
import { Logo } from "@/app/Logo";
import { NEW_TOKEN_URL, RECOMMENDED_SCOPES, completeDeviceLogin, signInWithToken } from "./api";
import { useDeviceFlow } from "./useDeviceFlow";

type Method = "token" | "device";

export function AuthScreen() {
  const { t } = useTranslation("auth");
  const adding = useSession((s) => s.addingAccount);
  const hasAccounts = useSession((s) => (s.session?.accounts.length ?? 0) > 0);
  const setAdding = useSession((s) => s.setAddingAccount);
  const [method, setMethod] = useState<Method>("token");

  return (
    <div className="grid h-full grid-cols-[minmax(0,1.15fr)_minmax(420px,1fr)]">
      <BrandSheet />
      <div className="relative flex flex-col border-l border-line bg-surface">
        <div className="flex items-center justify-between px-8 pt-6">
          {adding && hasAccounts ? (
            <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => setAdding(false)}>
              {t("back")}
            </Button>
          ) : (
            <span className="annot">{t("sheet")}</span>
          )}
          <LanguageThemeControls />
        </div>

        <div className="flex flex-1 items-center justify-center px-8 py-10">
          <motion.div
            className="w-full max-w-[400px]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="annot mb-2">{adding ? t("addKicker") : t("kicker")}</div>
            <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em]">{t("title")}</h1>
            <p className="mt-2 text-[13px] text-dim">{t("subtitle")}</p>

            <Segmented
              className="mt-6 w-full"
              value={method}
              onChange={setMethod}
              options={[
                { value: "token", label: t("methods.token"), icon: KeyRound },
                { value: "device", label: t("methods.device"), icon: MonitorSmartphone },
              ]}
            />

            <div className="mt-5">{method === "token" ? <TokenForm /> : <DeviceForm />}</div>

            <div className="mt-8 flex items-start gap-2.5 border-t border-line pt-4 text-[12px] text-dim">
              <Lock size={14} className="mt-0.5 shrink-0 text-accent" />
              <span>{t("keychainNote")}</span>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function TokenForm() {
  const { t } = useTranslation("auth");
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithToken(token);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="pat" hint={<button type="button" onClick={() => openUrl(NEW_TOKEN_URL)} className="inline-flex items-center gap-1 text-accent hover:underline cursor-default">{t("token.create")} <ExternalLink size={11} /></button>}>
          {t("token.label")}
        </Label>
        <Input
          id="pat"
          autoFocus
          type={show ? "text" : "password"}
          placeholder="ghp_… / github_pat_…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="num"
          trailing={
            <button type="button" onClick={() => setShow(!show)} className="text-faint hover:text-text cursor-default" aria-label={t("token.toggle")}>
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          }
        />
      </div>
      <div>
        <div className="annot mb-1.5">{t("token.scopes")}</div>
        <div className="flex flex-wrap gap-1">
          {RECOMMENDED_SCOPES.map((s) => (
            <Badge key={s} mono>{s}</Badge>
          ))}
        </div>
      </div>
      {error != null && <ErrorNote error={error} />}
      <Button type="submit" variant="primary" className="w-full" icon={ShieldCheck} loading={busy} disabled={!token.trim()}>
        {busy ? t("token.verifying") : t("token.submit")}
      </Button>
    </form>
  );
}

function DeviceForm() {
  const { t } = useTranslation("auth");
  const [clientId, setClientId] = useState("");
  const [copied, setCopied] = useState(false);
  const { state, start, cancel } = useDeviceFlow(completeDeviceLogin);

  useEffect(() => {
    commands.authDefaultClientId().then((id) => id && setClientId((c) => c || id));
  }, []);

  if (state.phase === "waiting") {
    const { code } = state;
    return (
      <div className="space-y-4">
        <Panel ticks className="flex flex-col items-center gap-3 bg-surface-2 px-4 py-6">
          <div className="annot">{t("device.enterCode")}</div>
          <div className="num text-[30px] font-semibold tracking-[0.18em] text-accent" data-selectable>
            {code.user_code}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              icon={Copy}
              onClick={async () => {
                await navigator.clipboard.writeText(code.user_code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? t("device.copied") : t("device.copy")}
            </Button>
            <Button size="sm" variant="primary" icon={ExternalLink} onClick={() => openUrl(code.verification_uri)}>
              {t("device.open")}
            </Button>
          </div>
        </Panel>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[12px] text-dim">
            <span>{t("device.waiting")}</span>
            <button onClick={cancel} className="text-faint hover:text-text cursor-default">
              {t("device.cancel")}
            </button>
          </div>
          <Plotter />
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(clientId.trim());
      }}
    >
      <div>
        <Label htmlFor="cid" hint={t("device.clientIdHint")}>
          {t("device.clientId")}
        </Label>
        <Input id="cid" className="num" placeholder="Iv1.…" value={clientId} onChange={(e) => setClientId(e.target.value)} />
      </div>
      <p className="text-[12px] text-dim">{t("device.explain")}</p>
      {state.phase === "error" && <ErrorNote error={state.error} />}
      <Button type="submit" variant="primary" className="w-full" icon={MonitorSmartphone} loading={state.phase === "starting"} disabled={!clientId.trim()}>
        {t("device.start")}
      </Button>
    </form>
  );
}

function ErrorNote({ error }: { error: unknown }) {
  const msg = errorMessage(error);
  const detail = errorDetail(error);
  return (
    <div className="rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-[12.5px]">
      <div className="text-danger">{msg}</div>
      {detail && <div className="num mt-0.5 text-[11px] text-dim">{detail}</div>}
    </div>
  );
}


function BrandSheet() {
  const { t } = useTranslation("auth");
  const pillars = [t("pillars.build"), t("pillars.manage"), t("pillars.ship")];
  return (
    <div className="blueprint-grid relative flex flex-col justify-between overflow-hidden p-10">
      <div className="flex items-center gap-3">
        <Logo size={30} />
        <div>
          <div className="text-[15px] font-semibold tracking-[-0.01em]">ZIT-Suite</div>
          <div className="annot">v{__APP_VERSION__}</div>
        </div>
      </div>

      <div className="relative">

        <div className="absolute top-0 bottom-0 -left-4 flex flex-col items-center">
          <span className="h-px w-2 bg-faint" />
          <span className="w-px flex-1 bg-[var(--line-strong)]" />
          <span className="h-px w-2 bg-faint" />
        </div>
        {pillars.map((p, i) => (
          <motion.div
            key={p}
            className="flex items-baseline gap-5"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 * i + 0.1, duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <span className="num w-8 text-[12px] text-faint">0{i + 1}</span>
            <span className="text-[clamp(48px,7vw,92px)] leading-[0.98] font-semibold tracking-[-0.045em]">
              {p}
              <span className="text-accent">.</span>
            </span>
          </motion.div>
        ))}
      </div>

      <div className="flex items-end justify-between gap-6">
        <p className="max-w-md text-[13px] text-dim">{t("tagline")}</p>
        <div className="num shrink-0 border border-line-strong px-3 py-2 text-right text-[10.5px] leading-relaxed text-faint uppercase">
          <div>{t("titleBlock.drawing")} · ZIT-SUITE</div>
          <div>{t("titleBlock.sheet")} · 01 / AUTH</div>
          <div>{t("titleBlock.scale")} · 1:1</div>
        </div>
      </div>
    </div>
  );
}
