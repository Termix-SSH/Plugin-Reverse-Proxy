import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  PluginContext,
  PluginHostAccess,
} from "@termix-ssh/plugin-sdk/backend";
import { registerRoutes } from "../../src/backend/routes.js";
import { readSettings } from "../../src/backend/settings.js";
import { createRig, routeInput, type Rig } from "./helpers";

let rig: Rig;
let server: http.Server;
let port: number;
let editable = true;
let connectable = true;

beforeEach(async () => {
  editable = true;
  connectable = true;
  rig = await createRig();
  const hosts = rig.mock.ctx.hosts as PluginContext["hosts"] & {
    [key: string]: unknown;
  };
  Object.assign(hosts, {
    list: async () => [{ id: 1, name: "web", ip: "10.0.0.5" }],
    checkAccess: async (
      _id: number,
      level: string,
    ): Promise<PluginHostAccess> => ({
      hasAccess: level === "connect" ? connectable : editable,
      isOwner: true,
      isShared: false,
    }),
  });
  registerRoutes(rig.router, rig.mock.ctx, {
    repo: rig.repo,
    certs: rig.certs,
    auth: rig.auth,
    manager: rig.manager,
    getSettings: () => readSettings(rig.mock.ctx),
  });
  const app = express();
  app.use(express.json());
  app.use(rig.router);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rig.close();
});

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // The gate page is HTML.
  }
  return { status: response.status, body: json, text };
}

const web = {
  name: "Wiki",
  kind: "http",
  domain: "wiki.test",
  targetPort: 8080,
  targetHost: "127.0.0.1",
  tlsMode: "off",
  authMode: "none",
};

describe("route management", () => {
  it("adds, lists, updates and deletes a route", async () => {
    const created = await call("POST", "/routes", { ...web, hostId: 1 });
    expect(created.status).toBe(201);
    const id = created.body.route.id;

    const list = await call("GET", "/state");
    expect(list.body.routes).toHaveLength(1);
    expect(list.body.routes[0].runtime.state).toBe("running");
    expect(list.body.hosts[0]).toMatchObject({
      id: 1,
      name: "web",
      enabled: true,
    });

    const state = await call("GET", "/state");
    expect(state.body.routes[0].hostName).toBe("web");
    expect(state.body.ports.running.http).toBeTypeOf("number");

    const updated = await call("PUT", `/routes/${id}`, {
      ...web,
      name: "Wiki 2",
      targetPort: 9000,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.route.targetPort).toBe(9000);

    expect((await call("DELETE", `/routes/${id}`)).status).toBe(200);
    expect((await call("GET", "/state")).body.routes).toHaveLength(0);
  });

  it("refuses duplicate domains and ports", async () => {
    await call("POST", "/routes", { ...web, hostId: 1 });
    const dup = await call("POST", "/routes", { ...web, hostId: 1 });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toMatch(/already used/);

    const tcp = { name: "ssh", kind: "tcp", listenPort: 2299, targetPort: 22 };
    expect((await call("POST", "/routes", { ...tcp, hostId: 1 })).status).toBe(
      201,
    );
    expect((await call("POST", "/routes", { ...tcp, hostId: 1 })).status).toBe(
      400,
    );
  });

  it("turns a route off and on without losing it", async () => {
    const created = await call("POST", "/routes", { ...web, hostId: 1 });
    const id = created.body.route.id;
    const off = await call("PATCH", `/routes/${id}/enabled`, {
      enabled: false,
    });
    expect(off.body.route.enabled).toBe(false);
    expect(off.body.route.runtime.state).toBe("stopped");
    const on = await call("PATCH", `/routes/${id}/enabled`, { enabled: true });
    expect(on.body.route.enabled).toBe(true);
    expect(on.body.route.runtime.state).toBe("running");
  });

  it("refuses routes on a host that turned the proxy off", async () => {
    await rig.mock.ctx.settings.setHost(1, "enableReverseProxy", false);
    const res = await call("POST", "/routes", { ...web, hostId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/turned off/);
  });

  it("needs edit access to the host", async () => {
    editable = false;
    const denied = await call("POST", "/routes", { ...web, hostId: 1 });
    expect(denied.status).toBe(403);
  });

  it("creates a self-signed certificate for a tls route", async () => {
    const created = await call("POST", "/routes", {
      ...web,
      hostId: 1,
      tlsMode: "selfsigned",
    });
    expect(created.status).toBe(201);
    expect(created.body.route.certId).toBeTypeOf("number");
    const state = await call("GET", "/state");
    expect(state.body.certs[0]).toMatchObject({
      source: "selfsigned",
      status: "ready",
      domains: ["wiki.test"],
    });
    // The certificate is in use, so it cannot be deleted yet.
    const id = state.body.certs[0].id;
    expect((await call("DELETE", `/certs/${id}`)).status).toBe(409);
  });
});

describe("gate", () => {
  it("serves the sign in page", async () => {
    const page = await call("GET", "/gate");
    expect(page.status).toBe(200);
    expect(page.text).toContain("gate/token");
  });

  it("hands a signed-in user a link for their route domain only", async () => {
    const route = await rig.repo.createRoute(
      1,
      "user-1",
      routeInput({ authMode: "user" }),
    );
    const ok = await call(
      "GET",
      `/gate/token?route=${route.id}&to=${encodeURIComponent("https://app.test/x?y=1")}`,
    );
    expect(ok.status).toBe(200);
    const link = new URL(ok.body.url);
    expect(link.origin).toBe("https://app.test");
    expect(link.pathname).toBe("/__rp/auth");
    expect(link.searchParams.get("to")).toBe("/x?y=1");
    expect(rig.auth.verify(link.searchParams.get("t")!, "token", route)).toBe(
      true,
    );

    const elsewhere = await call(
      "GET",
      `/gate/token?route=${route.id}&to=${encodeURIComponent("https://evil.test/")}`,
    );
    expect(elsewhere.status).toBe(400);
  });

  it("checks host access for host protected routes", async () => {
    const route = await rig.repo.createRoute(
      1,
      "user-1",
      routeInput({ authMode: "host" }),
    );
    const url = `/gate/token?route=${route.id}&to=${encodeURIComponent("http://app.test/")}`;
    expect((await call("GET", url)).status).toBe(200);
    connectable = false;
    expect((await call("GET", url)).status).toBe(403);
  });

  it("does not hand out a link for a route without login", async () => {
    const route = await rig.repo.createRoute(1, "user-1", routeInput());
    const res = await call(
      "GET",
      `/gate/token?route=${route.id}&to=${encodeURIComponent("http://app.test/")}`,
    );
    expect(res.status).toBe(403);
  });
});
