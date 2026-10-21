import { Globe, Network, Radio } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  ListBadge,
  ListRow,
  PanelList,
  Switch,
} from "@termix-ssh/plugin-sdk/ui";
import { errorMessage, setRouteEnabled, type RouteView } from "./api";

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

export function routeFrom(route: RouteView): string {
  return route.kind === "http"
    ? `${route.tlsMode === "off" ? "http" : "https"}://${route.domain}`
    : `${route.kind.toUpperCase()} :${route.listenPort}`;
}

export function RoutesView({
  routes,
  onOpen,
  reload,
}: {
  routes: RouteView[];
  onOpen: (route: RouteView) => void;
  reload: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();

  const toggle = async (route: RouteView, enabled: boolean) => {
    try {
      await setRouteEnabled(route.id, enabled);
      reload();
    } catch (e) {
      toast.error(errorMessage(e, t("list.toggleFailed")));
    }
  };

  if (routes.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-xs text-muted-foreground/60">
        {t("list.empty")}
      </p>
    );
  }

  return (
    <PanelList>
      {routes.map((route, index) => {
        const runtime = route.runtime;
        const tone = !route.enabled
          ? undefined
          : runtime.state === "error"
            ? "destructive"
            : "brand";
        const Icon =
          route.kind === "http"
            ? Globe
            : route.kind === "tcp"
              ? Network
              : Radio;
        return (
          <ListRow
            key={route.id}
            stripe={index}
            icon={<Icon className="size-4" />}
            title={route.name}
            tone={tone}
            onClick={() => onOpen(route)}
            badges={
              <>
                <ListBadge>{route.kind.toUpperCase()}</ListBadge>
                <ListBadge>
                  {!route.enabled
                    ? t("list.disabled")
                    : t(`list.state.${runtime.state}`)}
                </ListBadge>
                {route.authMode !== "none" && (
                  <ListBadge>{t("list.protected")}</ListBadge>
                )}
              </>
            }
            meta={
              <>
                <span className="font-mono">
                  {routeFrom(route)} |{" "}
                  {route.targetHost || t("list.hostAddress")}:{route.targetPort}
                </span>
                {route.enabled && runtime.error ? ` | ${runtime.error}` : ""}
                {route.enabled && runtime.connections
                  ? ` | ${t("list.traffic", {
                      count: runtime.connections,
                      inbound: formatBytes(runtime.bytesIn ?? 0),
                      outbound: formatBytes(runtime.bytesOut ?? 0),
                    })}`
                  : ""}
              </>
            }
            trailing={
              <span onClick={(event) => event.stopPropagation()}>
                <Switch
                  checked={route.enabled}
                  onCheckedChange={(value: boolean) =>
                    void toggle(route, value)
                  }
                  aria-label={t("form.enabled")}
                />
              </span>
            }
          />
        );
      })}
    </PanelList>
  );
}
