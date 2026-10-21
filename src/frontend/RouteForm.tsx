import { useState } from "react";
import { Waypoints } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  FormFooter,
  NumberField,
  SectionCard,
  SelectField,
  SwitchRow,
  TextAreaField,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  AuthMode,
  CertRecord,
  RouteInput,
  RouteKind,
  RouteRecord,
  TlsMode,
} from "../shared/types";
import { errorMessage, saveRoute } from "./api";

interface FormState {
  name: string;
  kind: RouteKind;
  domain: string;
  listenPort: number;
  targetHost: string;
  targetPort: number;
  tlsMode: TlsMode;
  certId: number | null;
  authMode: AuthMode;
  enabled: boolean;
  forceHttps: boolean;
  preserveHost: boolean;
  targetHttps: boolean;
  insecureTarget: boolean;
  httpsPublicPort: number;
  allowIps: string;
  denyIps: string;
  headers: string;
  idleSeconds: number;
}

function initial(route: RouteRecord | null): FormState {
  const o = route?.options ?? {};
  return {
    name: route?.name ?? "",
    kind: route?.kind ?? "http",
    domain: route?.domain ?? "",
    listenPort: route?.listenPort ?? 0,
    targetHost: route?.targetHost ?? "",
    targetPort: route?.targetPort ?? 80,
    tlsMode: route?.tlsMode ?? "acme",
    certId: route?.certId ?? null,
    authMode: route?.authMode ?? "none",
    enabled: route?.enabled ?? true,
    forceHttps: o.forceHttps !== false,
    preserveHost: o.preserveHost === true,
    targetHttps: o.targetScheme === "https",
    insecureTarget: o.insecureTarget === true,
    httpsPublicPort: o.httpsPublicPort ?? 0,
    allowIps: (o.allowIps ?? []).join("\n"),
    denyIps: (o.denyIps ?? []).join("\n"),
    headers: Object.entries(o.headers ?? {})
      .map(([name, value]) => `${name}: ${value}`)
      .join("\n"),
    idleSeconds: o.idleSeconds ?? 0,
  };
}

const lines = (text: string) =>
  text
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean);

function toInput(form: FormState): RouteInput {
  const headers: Record<string, string> = {};
  for (const line of form.headers.split("\n")) {
    const index = line.indexOf(":");
    if (index > 0)
      headers[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return {
    name: form.name.trim(),
    kind: form.kind,
    domain: form.domain.trim(),
    listenPort: form.kind === "http" ? null : form.listenPort || null,
    targetHost: form.targetHost.trim(),
    targetPort: form.targetPort,
    tlsMode: form.kind === "http" ? form.tlsMode : "off",
    certId: form.tlsMode === "custom" ? form.certId : null,
    authMode: form.kind === "http" ? form.authMode : "none",
    enabled: form.enabled,
    options: {
      forceHttps: form.forceHttps,
      preserveHost: form.preserveHost,
      targetScheme: form.targetHttps ? "https" : "http",
      insecureTarget: form.insecureTarget,
      httpsPublicPort: form.httpsPublicPort || undefined,
      allowIps: lines(form.allowIps),
      denyIps: lines(form.denyIps),
      headers,
      idleSeconds: form.idleSeconds || undefined,
    },
  };
}

export function RouteForm({
  hostId,
  defaultAccess,
  route,
  certs,
  onDone,
  onCancel,
  onDelete,
}: {
  hostId: number;
  defaultAccess: AuthMode;
  route: RouteRecord | null;
  certs: CertRecord[];
  onDone: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(() => {
    const start = initial(route);
    if (!route) start.authMode = defaultAccess;
    return start;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<FormState>) =>
    setForm((current) => ({ ...current, ...patch }));
  const web = form.kind === "http";

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await saveRoute(hostId, route?.id ?? null, toInput(form));
      onDone();
    } catch (e) {
      setError(errorMessage(e, t("form.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  const customCerts = certs.filter((c) => c.status === "ready");

  return (
    <SectionCard
      title={route ? t("form.editTitle") : t("form.addTitle")}
      icon={<Waypoints className="size-3.5" />}
    >
      <div className="flex flex-col gap-3 py-3">
        <TextField
          label={t("form.name")}
          value={form.name}
          onChange={(name) => set({ name })}
          placeholder={t("form.namePlaceholder")}
        />
        <SelectField<RouteKind>
          label={t("form.type")}
          value={form.kind}
          onChange={(kind) =>
            set({ kind, targetPort: kind === "http" ? 80 : form.targetPort })
          }
          options={[
            { value: "http", label: t("form.typeHttp") },
            { value: "tcp", label: t("form.typeTcp") },
            { value: "udp", label: t("form.typeUdp") },
          ]}
        />
        {web ? (
          <TextField
            label={t("form.domain")}
            value={form.domain}
            onChange={(domain) => set({ domain })}
            placeholder="app.example.com"
            hint={t("form.domainHint")}
            mono
          />
        ) : (
          <NumberField
            label={t("form.publicPort")}
            value={form.listenPort}
            onChange={(listenPort) => set({ listenPort })}
            min={1}
            max={65535}
            hint={t("form.publicPortHint")}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t("form.targetAddress")}
            value={form.targetHost}
            onChange={(targetHost) => set({ targetHost })}
            placeholder={t("form.targetAddressPlaceholder")}
            hint={t("form.targetAddressHint")}
            mono
          />
          <NumberField
            label={t("form.targetPort")}
            value={form.targetPort}
            onChange={(targetPort) => set({ targetPort })}
            min={1}
            max={65535}
          />
        </div>

        {web && (
          <>
            <SelectField<TlsMode>
              label={t("form.certificate")}
              value={form.tlsMode}
              onChange={(tlsMode) => set({ tlsMode })}
              options={[
                { value: "acme", label: t("form.certAcme") },
                { value: "selfsigned", label: t("form.certSelfSigned") },
                { value: "custom", label: t("form.certCustom") },
                { value: "off", label: t("form.certOff") },
              ]}
              hint={t(`form.certHint.${form.tlsMode}`)}
            />
            {form.tlsMode === "custom" && (
              <SelectField<string>
                label={t("form.pickCertificate")}
                value={form.certId ? String(form.certId) : ""}
                onChange={(value) =>
                  set({ certId: value ? Number(value) : null })
                }
                options={customCerts.map((c) => ({
                  value: String(c.id),
                  label: c.domains.join(", "),
                }))}
                placeholder={t("form.pickCertificatePlaceholder")}
              />
            )}
            {form.tlsMode !== "off" && (
              <SwitchRow
                label={t("form.forceHttps")}
                description={t("form.forceHttpsDesc")}
                checked={form.forceHttps}
                onChange={(forceHttps) => set({ forceHttps })}
              />
            )}
            <SelectField<AuthMode>
              label={t("form.access")}
              value={form.authMode}
              onChange={(authMode) => set({ authMode })}
              options={[
                { value: "none", label: t("form.accessNone") },
                { value: "user", label: t("form.accessUser") },
                { value: "host", label: t("form.accessHost") },
              ]}
              hint={t(`form.accessHint.${form.authMode}`)}
            />
            <SwitchRow
              label={t("form.targetHttps")}
              description={t("form.targetHttpsDesc")}
              checked={form.targetHttps}
              onChange={(targetHttps) => set({ targetHttps })}
            />
            {form.targetHttps && (
              <SwitchRow
                label={t("form.insecureTarget")}
                description={t("form.insecureTargetDesc")}
                checked={form.insecureTarget}
                onChange={(insecureTarget) => set({ insecureTarget })}
              />
            )}
            <SwitchRow
              label={t("form.preserveHost")}
              description={t("form.preserveHostDesc")}
              checked={form.preserveHost}
              onChange={(preserveHost) => set({ preserveHost })}
            />
            {form.tlsMode !== "off" && (
              <NumberField
                label={t("form.httpsPublicPort")}
                value={form.httpsPublicPort}
                onChange={(httpsPublicPort) => set({ httpsPublicPort })}
                min={0}
                max={65535}
                hint={t("form.httpsPublicPortHint")}
              />
            )}
            <TextAreaField
              label={t("form.headers")}
              value={form.headers}
              onChange={(headers) => set({ headers })}
              placeholder="X-Custom: value"
              hint={t("form.headersHint")}
              mono
            />
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <TextAreaField
            label={t("form.allowIps")}
            value={form.allowIps}
            onChange={(allowIps) => set({ allowIps })}
            placeholder="192.168.0.0/16"
            hint={t("form.allowIpsHint")}
            rows={2}
            mono
          />
          <TextAreaField
            label={t("form.denyIps")}
            value={form.denyIps}
            onChange={(denyIps) => set({ denyIps })}
            placeholder="203.0.113.7"
            rows={2}
            mono
          />
        </div>
        {!web && (
          <NumberField
            label={t("form.idleSeconds")}
            value={form.idleSeconds}
            onChange={(idleSeconds) => set({ idleSeconds })}
            min={0}
            hint={t("form.idleSecondsHint")}
          />
        )}
        <SwitchRow
          label={t("form.enabled")}
          checked={form.enabled}
          onChange={(enabled) => set({ enabled })}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <FormFooter
          onCancel={onCancel}
          onSave={save}
          saving={saving}
          saveLabel={t("common.save")}
          cancelLabel={t("common.cancel")}
          onDelete={onDelete}
          deleteLabel={t("common.delete")}
        />
      </div>
    </SectionCard>
  );
}
