import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { AUTH_PATH, type ProxyAuth } from "./auth.js";
import { parseEndpointDomain, type EndpointTarget } from "./endpoints.js";
import type { ProxyManager } from "./manager.js";
import type { ProxySettings } from "./settings.js";

/** What ctx.services.get("reverse-proxy.endpoints") hands other plugins. */
export function createEndpointService(
  ctx: PluginContext,
  deps: {
    manager: Pick<ProxyManager, "openEndpoint">;
    auth: ProxyAuth;
    getSettings: () => Promise<ProxySettings>;
  },
) {
  return {
    available: async (): Promise<boolean> => {
      const settings = await deps.getSettings();
      return (
        !!settings.publicBaseUrl &&
        !!parseEndpointDomain(settings.endpointDomain)
      );
    },

    /** A one time address that signs the acting user in to a new route. */
    open: async (input: {
      hostId: number;
      target: EndpointTarget;
      path?: string;
    }): Promise<{ url: string }> => {
      const userId = ctx.currentActor();
      if (!userId) throw new Error("reverse-proxy.endpoints needs an actor");
      const settings = await deps.getSettings();
      const domain = parseEndpointDomain(settings.endpointDomain);
      if (!domain || !settings.publicBaseUrl) {
        throw new Error(
          "Set the Web endpoint domain and Termix address in the Reverse Proxy settings",
        );
      }
      const access = await ctx.hosts.checkAccess(input.hostId, "connect");
      if (!access.hasAccess) throw new Error("Host not found or access denied");

      const route = deps.manager.openEndpoint({
        userId,
        hostId: input.hostId,
        target: input.target,
        domain: domain.domain,
      });
      const token = deps.auth.mint("token", route, settings.cookieHours);
      const { protocol } = new URL(settings.publicBaseUrl);
      const authority = domain.port
        ? `${route.domain}:${domain.port}`
        : route.domain;
      const to = encodeURIComponent(input.path || "/");
      return {
        url: `${protocol}//${authority}${AUTH_PATH}?t=${encodeURIComponent(token)}&to=${to}`,
      };
    },
  };
}
