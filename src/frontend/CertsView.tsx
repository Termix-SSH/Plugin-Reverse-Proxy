import { useState } from "react";
import { RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  FormFooter,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  SectionCard,
  TextAreaField,
  TextField,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { CertRecord } from "../shared/types";
import {
  errorMessage,
  makeSelfSigned,
  removeCert,
  renewCert,
  uploadCert,
} from "./api";

type Adding = "selfsigned" | "upload" | null;

export function CertsView({
  certs,
  needsEmail,
  reload,
}: {
  certs: CertRecord[];
  needsEmail: boolean;
  reload: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState<Adding>(null);
  const [domains, setDomains] = useState("");
  const [pem, setPem] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const done = () => {
    setAdding(null);
    setDomains("");
    setPem("");
    setKey("");
    reload();
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (adding === "selfsigned") {
        await makeSelfSigned(
          domains
            .split(/[\n,\s]+/)
            .map((d) => d.trim())
            .filter(Boolean),
        );
      } else {
        await uploadCert(pem, key);
      }
      done();
    } catch (e) {
      toast.error(errorMessage(e, t("certs.saveFailed")));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (cert: CertRecord) => {
    const ok = await confirm({
      title: t("certs.deleteTitle", { name: cert.domains[0] }),
      description: t("certs.deleteDesc"),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await removeCert(cert.id);
      reload();
    } catch (e) {
      toast.error(errorMessage(e, t("certs.deleteFailed")));
    }
  };

  const renew = async (cert: CertRecord) => {
    try {
      await renewCert(cert.id);
      toast.success(t("certs.renewStarted"));
      setTimeout(reload, 3000);
    } catch (e) {
      toast.error(errorMessage(e, t("certs.renewFailed")));
    }
  };

  if (adding) {
    return (
      <SectionCard
        title={
          adding === "selfsigned" ? t("certs.addSelfSigned") : t("certs.addOwn")
        }
        icon={<ShieldCheck className="size-3.5" />}
      >
        <div className="flex flex-col gap-3 py-3">
          {adding === "selfsigned" ? (
            <TextField
              label={t("certs.domains")}
              value={domains}
              onChange={setDomains}
              placeholder="app.example.com"
              hint={t("certs.domainsHint")}
              mono
            />
          ) : (
            <>
              <TextAreaField
                label={t("certs.certPem")}
                value={pem}
                onChange={setPem}
                placeholder="-----BEGIN CERTIFICATE-----"
                rows={5}
                mono
              />
              <TextAreaField
                label={t("certs.keyPem")}
                value={key}
                onChange={setKey}
                placeholder="-----BEGIN PRIVATE KEY-----"
                rows={5}
                mono
              />
            </>
          )}
          <FormFooter
            onCancel={() => setAdding(null)}
            onSave={() => void submit()}
            saving={busy}
            saveLabel={t("common.save")}
            cancelLabel={t("common.cancel")}
          />
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {needsEmail ? t("certs.needsEmail") : t("certs.autoNote")}
        </p>
        <div className="flex gap-2">
          <AddButton
            label={t("certs.addSelfSigned")}
            onClick={() => setAdding("selfsigned")}
          />
          <AddButton
            label={t("certs.addOwn")}
            onClick={() => setAdding("upload")}
          />
        </div>
      </div>
      {certs.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 px-1 py-2">
          {t("certs.empty")}
        </p>
      ) : (
        <PanelList>
          {certs.map((cert, index) => (
            <ListRow
              key={cert.id}
              stripe={index}
              title={cert.domains.join(", ")}
              badges={
                <>
                  <ListBadge>{t(`certs.source.${cert.source}`)}</ListBadge>
                  <ListBadge>{t(`certs.status.${cert.status}`)}</ListBadge>
                </>
              }
              meta={
                cert.error
                  ? cert.error
                  : cert.notAfter
                    ? t("certs.expires", {
                        date: new Date(cert.notAfter).toLocaleDateString(),
                      })
                    : t("certs.waiting")
              }
              tone={cert.status === "error" ? "destructive" : "brand"}
              actions={
                <>
                  {cert.source === "acme" && (
                    <ListRowAction
                      label={t("certs.renew")}
                      onClick={() => void renew(cert)}
                    >
                      <RefreshCw />
                    </ListRowAction>
                  )}
                  <ListRowAction
                    label={t("common.delete")}
                    tone="destructive"
                    onClick={() => void remove(cert)}
                  >
                    <Trash2 />
                  </ListRowAction>
                </>
              }
            />
          ))}
        </PanelList>
      )}
    </div>
  );
}
