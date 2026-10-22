import { useCallback, useEffect, useState } from "react";
import { Lock, Waypoints } from "lucide-react";
import {
  useHosts,
  usePermission,
  useTabs,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { ListBadge, ListRow, PanelList } from "@termix-ssh/plugin-sdk/ui";
import { errorMessage, getState, type ProxyState } from "./api";

const DAY_MS = 24 * 60 * 60 * 1000;
const POLL_MS = 60_000;

/** Days until a certificate ends, or null when it has no date. */
export function certDaysLeft(notAfter: string | null, now = Date.now()) {
  if (!notAfter) return null;
  return Math.floor((new Date(notAfter).getTime() - now) / DAY_MS);
}

/** Dashboard card: routes that are not running, then certificates by expiry. */
export function ProxyCard({ isVisible }: DashboardCardProps) {
  const { t } = useTranslation();
  const allowed = usePermission("use");
  const tabs = useTabs();
  const { hosts } = useHosts();
  const [state, setState] = useState<ProxyState | null>(null);
  const [failed, setFailed] = useState("");

  const load = useCallback(async () => {
    try {
      setState(await getState());
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("card.failed")));
    }
  }, [t]);

  useEffect(() => {
    if (!isVisible || !allowed) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, allowed, load]);

  if (!allowed) return null;
  if (failed) return <p className="p-3 text-xs text-destructive">{failed}</p>;
  if (!state) {
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("card.loading")}</p>
    );
  }

  const enabled = state.routes.filter((route) => route.enabled);
  const running = enabled.filter((r) => r.runtime.state === "running").length;
  const broken = enabled.filter((r) => r.runtime.state !== "running");
  const certs = [...state.certs].sort(
    (a, b) =>
      (certDaysLeft(a.notAfter) ?? Infinity) -
      (certDaysLeft(b.notAfter) ?? Infinity),
  );

  const openHost = (hostId: number) => {
    const host = hosts.find((h) => Number(h.id) === hostId);
    if (host) tabs.openTab(host, "reverse-proxy");
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <span className="px-3 pt-2 text-xs text-muted-foreground">
        {t("card.summary", { running, total: enabled.length })}
      </span>
      <PanelList>
        {broken.map((route, index) => (
          <ListRow
            key={route.id}
            stripe={index}
            tone={route.runtime.state === "error" ? "destructive" : "muted"}
            icon={<Waypoints className="size-3.5" />}
            title={route.name || route.domain}
            meta={[route.hostName, route.runtime.error ?? route.runtime.state]
              .filter(Boolean)
              .join(" | ")}
            onClick={() => openHost(route.hostId)}
          />
        ))}
        {certs.map((cert, index) => {
          const days = certDaysLeft(cert.notAfter);
          const tone =
            cert.status === "error" || (days !== null && days < 3)
              ? "destructive"
              : days !== null && days < 14
                ? "warning"
                : "success";
          return (
            <ListRow
              key={`cert-${cert.id}`}
              stripe={broken.length + index}
              tone={tone}
              icon={<Lock className="size-3.5" />}
              title={cert.domains.join(", ")}
              badges={<ListBadge tone="muted">{cert.source}</ListBadge>}
              meta={
                cert.error ??
                (days === null
                  ? cert.status
                  : t("card.daysLeft", { count: Math.max(0, days) }))
              }
            />
          );
        })}
      </PanelList>
    </div>
  );
}
