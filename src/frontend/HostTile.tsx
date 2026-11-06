import { useCallback, useEffect, useState } from "react";
import { Waypoints } from "lucide-react";
import { usePermission, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { ListRow, PanelList } from "@termix-ssh/plugin-sdk/ui";
import { getState, type ProxyState } from "./api";

const POLL_MS = 60_000;

/** The routes of one host with their state, on the host page. */
export function ProxyHostTile({
  hostId,
  isVisible = true,
}: {
  hostId: number;
  isVisible?: boolean;
}) {
  const { t } = useTranslation();
  const allowed = usePermission("use");
  const [state, setState] = useState<ProxyState | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await getState());
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    if (!isVisible || !allowed) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, allowed, load]);

  if (!allowed) return null;
  const routes = (state?.routes ?? []).filter(
    (route) => route.hostId === Number(hostId),
  );
  if (routes.length === 0) {
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("tile.empty")}</p>
    );
  }
  return (
    <PanelList>
      {routes.map((route, index) => (
        <ListRow
          key={route.id}
          stripe={index}
          tone={
            !route.enabled
              ? "muted"
              : route.runtime.state === "error"
                ? "destructive"
                : "success"
          }
          icon={<Waypoints className="size-3.5" />}
          title={route.name || route.domain || `:${route.listenPort}`}
          meta={
            route.enabled
              ? (route.runtime.error ?? route.runtime.state)
              : t("tile.off")
          }
        />
      ))}
    </PanelList>
  );
}
