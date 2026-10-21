import { Waypoints } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  Facts,
  PanelShell,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { AuthMode, CertRecord } from "../shared/types";
import { errorMessage, removeRoute, type RouteView } from "./api";
import { RouteForm } from "./RouteForm";
import { formatBytes, routeFrom } from "./RoutesView";

/** One route in full: live status on top, then every setting. */
export function RouteEditor({
  route,
  hostId,
  defaultAccess,
  certs,
  onClose,
  reload,
}: {
  route: RouteView | null;
  hostId: number;
  defaultAccess: AuthMode;
  certs: CertRecord[];
  onClose: () => void;
  reload: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();

  const remove = async () => {
    if (!route) return;
    const ok = await confirm({
      title: t("list.deleteTitle", { name: route.name }),
      description: t("list.deleteDesc"),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await removeRoute(route.id);
      reload();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, t("list.deleteFailed")));
    }
  };

  const runtime = route?.runtime;
  const cert = route?.certId ? certs.find((c) => c.id === route.certId) : null;

  return (
    <PanelShell
      icon={<Waypoints className="size-4" />}
      leading={<BackButton onClick={onClose} />}
      title={route ? route.name : t("form.addTitle")}
      status={route ? routeFrom(route) : undefined}
      className="gap-2 p-2.5"
    >
      <div className="flex shrink-0 flex-col gap-3">
        {route && runtime && (
          <div className="mb-3 flex flex-col gap-1 border border-border p-3 text-xs">
            <Facts>
              <span>
                {route.enabled
                  ? t(`list.state.${runtime.state}`)
                  : t("list.disabled")}
              </span>
              {runtime.listening && <span>{runtime.listening}</span>}
              <span>
                {t("editor.connections", { count: runtime.connections ?? 0 })}
              </span>
              <span>
                {t("editor.traffic", {
                  inbound: formatBytes(runtime.bytesIn ?? 0),
                  outbound: formatBytes(runtime.bytesOut ?? 0),
                })}
              </span>
              {cert && (
                <span>
                  {t(`certs.status.${cert.status}`)}
                  {cert.notAfter
                    ? ` | ${t("certs.expires", {
                        date: new Date(cert.notAfter).toLocaleDateString(),
                      })}`
                    : ""}
                </span>
              )}
            </Facts>
            {route.enabled && runtime.error && (
              <p className="text-destructive">{runtime.error}</p>
            )}
            {cert?.error && <p className="text-destructive">{cert.error}</p>}
          </div>
        )}
        <RouteForm
          hostId={hostId}
          defaultAccess={defaultAccess}
          route={route}
          certs={certs}
          onCancel={onClose}
          onDone={() => {
            reload();
            onClose();
          }}
          onDelete={route ? () => void remove() : undefined}
        />
      </div>
    </PanelShell>
  );
}
