import http from "node:http";
import net from "node:net";
import { fileURLToPath } from "node:url";
import express, { type Router } from "express";
import {
  createMockCtx,
  createTestDb,
  type MockPluginContext,
  type TestDb,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import manifestJson from "../../manifest.json";
import type { RouteInput } from "../../src/shared/types.js";
import { createAuth } from "../../src/backend/auth.js";
import { createCertManager } from "../../src/backend/certs.js";
import { createProxyManager } from "../../src/backend/manager.js";
import { createRepository } from "../../src/backend/repository.js";
import { readSettings } from "../../src/backend/settings.js";
import { certs, routes } from "../../src/backend/tables.js";

export const pluginDir = fileURLToPath(new URL("../..", import.meta.url));
export const manifest = manifestJson as unknown as PluginManifest;

export async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

export function routeInput(overrides: Partial<RouteInput> = {}): RouteInput {
  return {
    name: "test",
    kind: "http",
    domain: "app.test",
    listenPort: null,
    targetHost: "127.0.0.1",
    targetPort: 80,
    tlsMode: "off",
    certId: null,
    authMode: "none",
    options: {},
    enabled: true,
    ...overrides,
  };
}

export interface Rig {
  db: TestDb;
  mock: MockPluginContext;
  repo: ReturnType<typeof createRepository>;
  auth: ReturnType<typeof createAuth>;
  certs: ReturnType<typeof createCertManager>;
  manager: ReturnType<typeof createProxyManager>;
  httpPort: number;
  httpsPort: number;
  router: Router;
  close: () => Promise<void>;
}

export async function createRig(): Promise<Rig> {
  const db = await createTestDb(pluginDir);
  db.sqlite.exec(
    "INSERT INTO users (id, username) VALUES ('user-1', 'user-1')",
  );
  db.sqlite.exec("INSERT INTO ssh_data DEFAULT VALUES");

  const router = express.Router();
  const mock = createMockCtx({
    pluginId: manifest.id,
    manifest,
    capabilities: manifest.capabilities,
    db: db.database,
    router: () => router,
    actor: "user-1",
    permissions: ["reverse-proxy.use", "reverse-proxy.access"],
  });
  const httpPort = await freePort();
  const httpsPort = await freePort();
  await mock.ctx.settings.set("httpPort", httpPort);
  await mock.ctx.settings.set("httpsPort", httpsPort);
  await mock.ctx.settings.set("bindHost", "127.0.0.1");
  await mock.ctx.settings.set("publicBaseUrl", "http://termix.test");
  await mock.ctx.settings.set("acmeEmail", "me@example.com");

  const routesTable = await mock.ctx.db.define(routes);
  const certsTable = await mock.ctx.db.define(certs);
  const repo = createRepository(mock.ctx.db, routesTable, certsTable);
  const getSettings = () => readSettings(mock.ctx);
  const auth = createAuth(mock.ctx);
  await auth.ready();
  const certManager = createCertManager(mock.ctx, repo, getSettings);
  const manager = createProxyManager(mock.ctx, {
    repo,
    certs: certManager,
    auth,
    getSettings,
  });
  return {
    db,
    mock,
    repo,
    auth,
    certs: certManager,
    manager,
    httpPort,
    httpsPort,
    router,
    close: async () => {
      manager.dispose();
      db.close();
    },
  };
}

export interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export function get(
  port: number,
  host: string,
  path = "/",
  headers: Record<string, string> = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, headers: { host, ...headers } },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export async function startTarget(
  handler: http.RequestListener,
): Promise<{ port: number; server: http.Server }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as net.AddressInfo).port, server };
}
