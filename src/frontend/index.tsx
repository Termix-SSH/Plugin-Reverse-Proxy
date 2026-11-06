import type { ComponentType } from "react";
import { Waypoints } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { ProxyTab } from "./ProxyTab";
import { ProxyCard } from "./ProxyCard";
import { ProxyHostTile } from "./HostTile";
import { proxyWidget } from "./HomepageWidget";

const TAB_ID = "reverse-proxy";

function proxyEnabled(host: object | null | undefined): boolean {
  const all = (host as { pluginSettings?: unknown } | null | undefined)
    ?.pluginSettings as
    Record<string, Record<string, unknown> | undefined> | undefined;
  return all?.[TAB_ID]?.enableReverseProxy === true;
}

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab(TAB_ID, ProxyTab, {
    icon: Waypoints,
    titleKey: "tab.title",
    requiresHost: true,
    noHostMessageKey: "tab.noHost",
    persistent: true,
  });
  app.registerHostAction({
    id: TAB_ID,
    titleKey: "tab.title",
    icon: Waypoints,
    kind: "open",
    order: 45,
    tabType: TAB_ID,
    when: (host) => canUse && proxyEnabled(host),
  });

  app.registerDashboardCard({
    id: "reverse-proxy",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 220,
    frame: "framed",
    component: ProxyCard,
  });

  app.registerSlotContribution("host-page.tiles", {
    actionId: "reverse-proxy.hostTile",
    titleKey: "tile.title",
    icon: Waypoints,
    kind: "component",
    component: ProxyHostTile as unknown as ComponentType<
      Record<string, unknown>
    >,
    when: (context?: { host?: unknown }) =>
      canUse && (!context?.host || proxyEnabled(context.host as object)),
  });

  app.registerExtension("homepage.widgets", proxyWidget(app.t));
}
