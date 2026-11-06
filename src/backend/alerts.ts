import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { CertRecord, RouteRecord, RouteRuntime } from "../shared/types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_MS = 5 * 60 * 1000;
const EXPIRY_WARN_DAYS = 14;

interface Deps {
  listRoutes: () => Promise<RouteRecord[]>;
  listCerts: () => Promise<
    Array<Pick<CertRecord, "id" | "domains" | "notAfter">>
  >;
  status: (id: number) => RouteRuntime | undefined;
}

/** Alerts for routes that stop working and certificates close to their end. */
export function startProxyAlerts(ctx: PluginContext, deps: Deps) {
  const failing = new Set<number>();
  const expiring = new Set<number>();

  const send = (notification: Parameters<PluginContext["notify"]["send"]>[0]) =>
    ctx.notify.send(notification).catch(() => undefined);

  const tick = async () => {
    const routes = await deps.listRoutes();
    for (const route of routes) {
      const broken = route.enabled && deps.status(route.id)?.state === "error";
      if (!broken) {
        failing.delete(route.id);
        continue;
      }
      if (failing.has(route.id)) continue;
      failing.add(route.id);
      const name = route.name || route.domain || `port ${route.listenPort}`;
      await send({
        title: `Route ${name} is failing`,
        body: deps.status(route.id)?.error,
        severity: "warning",
        category: "reverse-proxy.route_failing",
        audience: { userId: route.userId },
        link: { tab: "reverse-proxy" },
        dedupeKey: `reverse-proxy.route_failing:${route.id}`,
        context: { hostId: route.hostId },
      });
    }

    for (const cert of await deps.listCerts()) {
      if (!cert.notAfter) continue;
      const days = Math.floor(
        (new Date(cert.notAfter).getTime() - Date.now()) / DAY_MS,
      );
      if (days > EXPIRY_WARN_DAYS) {
        expiring.delete(cert.id);
        continue;
      }
      if (expiring.has(cert.id)) continue;
      expiring.add(cert.id);
      await send({
        title: `Certificate for ${cert.domains[0]} ends soon`,
        body: days < 0 ? "It has ended." : `${days} days left.`,
        severity: days <= 3 ? "critical" : "warning",
        category: "reverse-proxy.cert_expiring",
        audience: "admins",
        link: { tab: "reverse-proxy" },
        dedupeKey: `reverse-proxy.cert_expiring:${cert.id}`,
      });
    }
  };

  ctx.disposables.add(
    ctx.schedule.every(
      CHECK_MS,
      () =>
        tick().catch((error) =>
          ctx.log.debug(`Alert check failed: ${String(error)}`),
        ),
      { jitterMs: 10_000 },
    ),
  );
  return { tick };
}
