import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import type { RouteRecord, RouteRuntime } from "../shared/types.js";

interface Deps {
  listRoutes: () => Promise<RouteRecord[]>;
  getRoute: (id: number) => Promise<RouteRecord | null>;
  updateRoute: (
    id: number,
    input: Omit<RouteRecord, "id" | "hostId" | "userId" | "createdAt">,
  ) => Promise<unknown>;
  status: (id: number) => RouteRuntime | undefined;
  reload: () => Promise<void>;
}

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

/** The address people open, for a web route with a domain. */
export function routeUrl(route: RouteRecord): string {
  if (route.kind !== "http" || !route.domain) return "";
  return `${route.tlsMode === "off" ? "http" : "https"}://${route.domain}`;
}

/** Everything Reverse Proxy offers to the rest of Termix. */
export function registerOperations(ctx: PluginContext, deps: Deps): void {
  if (typeof ctx.operations?.register !== "function") return;

  const routesOf = async (hostId: number) =>
    (await deps.listRoutes()).filter((route) => route.hostId === hostId);

  ctx.operations.register("reverse-proxy.list-routes", {
    run: async (_input, context) => {
      const rows = (await routesOf(requireHost(context))).map((route) => {
        const runtime = deps.status(route.id);
        return {
          id: String(route.id),
          name:
            route.name || route.domain || `${route.kind} ${route.listenPort}`,
          state: route.enabled ? (runtime?.state ?? "stopped") : "off",
          kind: route.kind,
          domain: route.domain,
          target: `${route.targetHost}:${route.targetPort}`,
          url: routeUrl(route),
        };
      });
      return { summary: `${rows.length} routes`, data: { rows } };
    },
  });

  ctx.operations.register("reverse-proxy.failing", {
    run: async (_input, context) => {
      const routes = (await routesOf(requireHost(context))).filter(
        (route) => route.enabled,
      );
      const failing = routes.filter(
        (route) => deps.status(route.id)?.state === "error",
      ).length;
      return {
        summary: `${failing} failing`,
        data: {
          value: failing,
          status: failing > 0 ? "fail" : "ok",
          label: `${routes.length - failing} of ${routes.length} working`,
        },
      };
    },
  });

  for (const [id, enabled] of [
    ["reverse-proxy.enable-route", true],
    ["reverse-proxy.disable-route", false],
  ] as const) {
    ctx.operations.register(id, {
      describe: (_input, context) =>
        `Would turn route ${context.resourceKey} ${enabled ? "on" : "off"}`,
      run: async (_input, context) => {
        const hostId = requireHost(context);
        const route = await deps.getRoute(Number(context.resourceKey));
        if (!route || route.hostId !== hostId)
          throw new Error("Route not found");
        const {
          id: _id,
          hostId: _h,
          userId: _u,
          createdAt: _c,
          ...input
        } = route;
        void _id;
        void _h;
        void _u;
        void _c;
        await deps.updateRoute(route.id, { ...input, enabled });
        await deps.reload();
        return {
          summary: `${route.name || route.domain} is ${enabled ? "on" : "off"}`,
          changed: route.enabled !== enabled,
        };
      },
    });
  }
}
