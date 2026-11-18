import { describe, expect, it } from "vitest";
import { createMockCtx } from "@termix-ssh/plugin-sdk/testing";
import { startProxyAlerts } from "../../src/backend/alerts.js";
import { manifest } from "./helpers";

const route = {
  id: 1,
  hostId: 4,
  userId: "user-1",
  name: "Wiki",
  domain: "wiki.test",
  enabled: true,
};

describe("proxy alerts", () => {
  it("alerts once for a failing route and a certificate near its end", async () => {
    const mock = createMockCtx({
      pluginId: manifest.id,
      manifest,
      sandbox: true,
      capabilities: manifest.capabilities,
    });
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const alerts = startProxyAlerts(mock.ctx, {
      listRoutes: async () => [route] as never,
      listCerts: async () => [
        { id: 9, domains: ["wiki.test"], notAfter: soon },
        { id: 10, domains: ["fine.test"], notAfter: null },
      ],
      status: () => ({ state: "error", error: "port in use" }),
    });

    await alerts.tick();
    await alerts.tick();

    expect(mock.notifications.map((n) => n.notification.category)).toEqual([
      "reverse-proxy.route_failing",
      "reverse-proxy.cert_expiring",
    ]);
    expect(mock.notifications[0].notification.audience).toEqual({
      userId: "user-1",
    });
    expect(mock.notifications[1].notification.severity).toBe("critical");
  });

  it("stays quiet for a working route", async () => {
    const mock = createMockCtx({
      pluginId: manifest.id,
      manifest,
      sandbox: true,
      capabilities: manifest.capabilities,
    });
    const alerts = startProxyAlerts(mock.ctx, {
      listRoutes: async () => [route] as never,
      listCerts: async () => [],
      status: () => ({ state: "running" }),
    });
    await alerts.tick();
    expect(mock.notifications).toHaveLength(0);
  });
});
