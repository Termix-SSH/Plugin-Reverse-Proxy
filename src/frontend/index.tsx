import { Waypoints } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { ProxyTab } from "./ProxyTab";

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
}
