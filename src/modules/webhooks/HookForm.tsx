import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Eye, EyeOff, KeyRound, Link2, ShieldAlert, Sparkles } from "lucide-react";
import { IconButton, Input, Label, Segmented, Toggle, Checkbox } from "@/ui";
import { draftErrors, generateSecret, type HookDraft, type SecretMode } from "./draft";
import { EventPicker } from "./EventPicker";


export function HookForm({
  value,
  onChange,
  hasSecret,
  showErrors,
}: {
  value: HookDraft;
  onChange: (d: HookDraft) => void;
  hasSecret?: boolean;
  showErrors?: boolean;
}) {
  const { t } = useTranslation("webhooks");
  const [reveal, setReveal] = useState(false);
  const errors = showErrors ? draftErrors(value) : [];
  const set = (p: Partial<HookDraft>) => onChange({ ...value, ...p });

  return (
    <div className="space-y-4">
      <div>
        <Label
          hint={
            errors.includes("url") ? <span className="text-danger">{t("form.urlInvalid")}</span> : undefined
          }
        >
          {t("form.url")}
        </Label>
        <Input
          autoFocus
          icon={Link2}
          value={value.url}
          onChange={(e) => set({ url: e.target.value })}
          placeholder="https://ci.example.com/github"
          className={errors.includes("url") ? "num !border-danger" : "num"}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("form.contentType")}</Label>
          <Segmented
            size="sm"
            className="w-full"
            value={value.content_type}
            onChange={(content_type) => set({ content_type })}
            options={[
              { value: "json", label: "JSON", title: "application/json" },
              { value: "form", label: t("form.formEncoded"), title: "application/x-www-form-urlencoded" },
            ]}
          />
        </div>
        <div>
          <Label>{t("form.delivery")}</Label>
          <div className="flex h-7 items-center gap-2">
            <Toggle checked={value.active} onChange={(active) => set({ active })} label={t("form.active")} />
            <span className="text-[12px] text-dim">{value.active ? t("form.active") : t("form.paused")}</span>
          </div>
        </div>
      </div>

      <div>
        <Label
          hint={
            errors.includes("secret") ? (
              <span className="text-danger">{t("form.secretShort")}</span>
            ) : (
              t("form.secretHint")
            )
          }
        >
          {t("form.secret")}
        </Label>
        {hasSecret && (
          <Segmented<SecretMode>
            size="sm"
            className="mb-2 w-full"
            value={value.secretMode}
            onChange={(secretMode) => set({ secretMode, secret: secretMode === "set" ? value.secret : "" })}
            options={(["keep", "set", "remove"] as const).map((m) => ({
              value: m,
              label: t(`form.secretMode.${m}`),
            }))}
          />
        )}
        {value.secretMode === "set" && (
          <Input
            icon={KeyRound}
            type={reveal ? "text" : "password"}
            value={value.secret}
            onChange={(e) => set({ secret: e.target.value })}
            placeholder={t("form.secretPlaceholder")}
            className="num pr-[84px]"
            autoComplete="off"
            trailing={
              <span className="flex items-center">
                <IconButton
                  icon={reveal ? EyeOff : Eye}
                  label={t("form.reveal")}
                  size={13}
                  className="size-6"
                  onClick={() => setReveal(!reveal)}
                />
                <IconButton
                  icon={Sparkles}
                  label={t("form.generate")}
                  size={13}
                  className="size-6"
                  onClick={() => (set({ secret: generateSecret() }), setReveal(true))}
                />
                <IconButton
                  icon={Copy}
                  label={t("form.copy")}
                  size={13}
                  className="size-6"
                  disabled={!value.secret}
                  onClick={() => navigator.clipboard.writeText(value.secret)}
                />
              </span>
            }
          />
        )}
        {value.secretMode === "remove" && (
          <p className="text-[11.5px] text-warn">{t("form.secretRemoveNote")}</p>
        )}
      </div>

      <div>
        <Checkbox
          checked={value.verifySsl}
          onChange={(verifySsl) => set({ verifySsl })}
          label={t("form.verifySsl")}
        />
        {!value.verifySsl && (
          <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-warn">
            <ShieldAlert size={12} /> {t("form.sslWarning")}
          </p>
        )}
      </div>

      <div>
        <Label
          hint={
            errors.includes("events") ? (
              <span className="text-danger">{t("form.eventsRequired")}</span>
            ) : undefined
          }
        >
          {t("form.events")}
        </Label>
        <EventPicker
          value={value.events}
          onChange={(events) => set({ events })}
          invalid={errors.includes("events")}
        />
      </div>
    </div>
  );
}
