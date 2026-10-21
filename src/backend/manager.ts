import http from "node:http";
import https from "node:https";
import type { SecureContext } from "node:tls";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { RouteRecord, RouteRuntime } from "../shared/types.js";
import type { ProxyAuth } from "./auth.js";
import { domainCovers, type CertManager } from "./certs.js";
import { createHttpHandlers } from "./http-proxy.js";
import type { Repository } from "./repository.js";
import type { ProxySettings } from "./settings.js";
import { startTcp, startUdp, type Listener } from "./stream-proxy.js";

const TARGET_CACHE_MS = 60_000;

interface Counters {
  in: number;
  out: number;
  conn: number;
}

interface WebServer {
  server: http.Server | https.Server;
  key: string;
}

export interface ManagerDeps {
  repo: Repository;
  certs: CertManager;
  auth: ProxyAuth;
  getSettings: () => Promise<ProxySettings>;
}

function listen(
  server: http.Server | https.Server,
  host: string,
  port: number,
) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host, port }, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

function closeServer(web: WebServer | null) {
  if (!web) return;
  web.server.closeAllConnections?.();
  web.server.close();
}

export function createProxyManager(ctx: PluginContext, deps: ManagerDeps) {
  let settings: ProxySettings | null = null;
  let routes: RouteRecord[] = [];
  let byDomain = new Map<string, RouteRecord>();
  let sni = new Map<string, SecureContext>();
  const runtime = new Map<number, RouteRuntime>();
  const counters = new Map<number, Counters>();
  const streams = new Map<number, { key: string; listener: Listener }>();
  const targets = new Map<number, { host: string; at: number }>();
  let httpServer: WebServer | null = null;
  let httpsServer: WebServer | null = null;
  let disposed = false;
  let chain: Promise<void> = Promise.resolve();

  const count = (routeId: number, key: keyof Counters, amount: number) => {
    let entry = counters.get(routeId);
    if (!entry) {
      entry = { in: 0, out: 0, conn: 0 };
      counters.set(routeId, entry);
    }
    entry[key] += amount;
  };

  async function target(route: RouteRecord) {
    if (route.targetHost) {
      return { host: route.targetHost, port: route.targetPort };
    }
    if (
      (await ctx.settings.getHost<boolean>(
        route.hostId,
        "enableReverseProxy",
      )) === false
    ) {
      throw new Error("Reverse proxy is off for this host");
    }
    const custom = (
      (await ctx.settings.getHost<string>(route.hostId, "targetAddress")) ?? ""
    ).trim();
    if (custom) return { host: custom, port: route.targetPort };
    const cached = targets.get(route.hostId);
    if (cached && Date.now() - cached.at < TARGET_CACHE_MS) {
      return { host: cached.host, port: route.targetPort };
    }
    const found = await ctx.asUser(route.userId, () =>
      ctx.hosts.probeTargets({ hostIds: [route.hostId] }),
    );
    const ip = found[0]?.ip;
    if (!ip) throw new Error("Host not found");
    targets.set(route.hostId, { host: ip, at: Date.now() });
    return { host: ip, port: route.targetPort };
  }

  const handlers = createHttpHandlers({
    routeForHost: (host) => {
      const exact = byDomain.get(host);
      if (exact) return exact;
      for (const route of routes) {
        if (route.domain.startsWith("*.") && domainCovers(route.domain, host)) {
          return route;
        }
      }
      return undefined;
    },
    target,
    challenge: (token) => deps.certs.challenge(token),
    auth: deps.auth,
    publicBaseUrl: () => settings?.publicBaseUrl ?? "",
    cookieHours: () => settings?.cookieHours ?? 12,
    count,
  });

  async function syncWeb(next: ProxySettings) {
    const httpRoutes = routes.filter((r) => r.kind === "http");
    const tlsRoutes = httpRoutes.filter((r) => r.tlsMode !== "off");
    const wantHttp = httpRoutes.length > 0;
    const wantHttps = tlsRoutes.length > 0;
    const errors: string[] = [];

    const httpKey = `${next.bindHost}:${next.httpPort}`;
    if (httpServer && (!wantHttp || httpServer.key !== httpKey)) {
      closeServer(httpServer);
      httpServer = null;
    }
    if (wantHttp && !httpServer) {
      const server = http.createServer((req, res) =>
        handlers.onRequest(req, res, false),
      );
      server.on("upgrade", (req, socket, head) =>
        handlers.onUpgrade(req, socket, head, false),
      );
      server.on("clientError", (_e, socket) => socket.destroy());
      try {
        await listen(server, next.bindHost, next.httpPort);
        httpServer = { server, key: httpKey };
        server.on("error", () => {});
      } catch (error) {
        errors.push(`HTTP port ${next.httpPort}: ${(error as Error).message}`);
      }
    }

    const httpsKey = `${next.bindHost}:${next.httpsPort}`;
    if (httpsServer && (!wantHttps || httpsServer.key !== httpsKey)) {
      closeServer(httpsServer);
      httpsServer = null;
    }
    if (wantHttps && !httpsServer) {
      const server = https.createServer({
        SNICallback: (name, done) => {
          const host = name.toLowerCase();
          let secure = sni.get(host);
          if (!secure) {
            for (const [pattern, value] of sni) {
              if (domainCovers(pattern, host)) secure = value;
            }
          }
          done(null, secure);
        },
      });
      server.on("request", (req, res) => handlers.onRequest(req, res, true));
      server.on("upgrade", (req, socket, head) =>
        handlers.onUpgrade(req, socket, head, true),
      );
      server.on("tlsClientError", () => {});
      server.on("clientError", (_e, socket) => socket.destroy());
      try {
        await listen(server, next.bindHost, next.httpsPort);
        httpsServer = { server, key: httpsKey };
        server.on("error", () => {});
      } catch (error) {
        errors.push(
          `HTTPS port ${next.httpsPort}: ${(error as Error).message}`,
        );
      }
    }
    return errors;
  }

  async function buildSni() {
    const next = new Map<string, SecureContext>();
    for (const route of routes) {
      if (route.kind !== "http" || route.tlsMode === "off" || !route.certId) {
        continue;
      }
      const secure = await deps.certs.secureContext(route.certId);
      if (secure) next.set(route.domain.toLowerCase(), secure);
    }
    sni = next;
  }

  async function syncStreams(next: ProxySettings) {
    const wanted = new Set<number>();
    for (const route of routes) {
      if (route.kind === "http" || !route.listenPort) continue;
      wanted.add(route.id);
      const key = JSON.stringify([
        route.kind,
        route.listenPort,
        next.bindHost,
        route.options.allowIps,
        route.options.denyIps,
        route.options.idleSeconds,
        route.targetHost,
        route.targetPort,
      ]);
      const running = streams.get(route.id);
      if (running?.key === key) continue;
      running?.listener.close();
      streams.delete(route.id);
      try {
        const start = route.kind === "tcp" ? startTcp : startUdp;
        const listener = await start(route, {
          bindHost: next.bindHost,
          target,
          count,
        });
        streams.set(route.id, { key, listener });
        runtime.set(route.id, {
          state: "running",
          listening: listener.address,
        });
      } catch (error) {
        runtime.set(route.id, {
          state: "error",
          error: (error as Error).message,
        });
      }
    }
    for (const [id, running] of streams) {
      if (wanted.has(id)) continue;
      running.listener.close();
      streams.delete(id);
    }
  }

  async function run() {
    if (disposed) return;
    const next = await deps.getSettings();
    settings = next;
    routes = (await deps.repo.listRoutes()).filter((r) => r.enabled);
    byDomain = new Map(
      routes
        .filter((r) => r.kind === "http")
        .map((r) => [r.domain.toLowerCase(), r]),
    );
    const live = new Set(routes.map((r) => r.id));
    for (const id of [...runtime.keys()]) if (!live.has(id)) runtime.delete(id);

    await buildSni();
    const webErrors = await syncWeb(next);
    await syncStreams(next);

    for (const route of routes) {
      if (route.kind !== "http") continue;
      const plain = httpServer ? `${next.bindHost}:${next.httpPort}` : null;
      const secure = httpsServer ? `${next.bindHost}:${next.httpsPort}` : null;
      const needsCert =
        route.tlsMode !== "off" && !sni.has(route.domain.toLowerCase());
      if (webErrors.length && !(plain || secure)) {
        runtime.set(route.id, { state: "error", error: webErrors.join("; ") });
      } else if (needsCert) {
        runtime.set(route.id, {
          state: "error",
          error: "Waiting for the certificate",
          listening: plain ?? undefined,
        });
      } else {
        runtime.set(route.id, {
          state: "running",
          listening: [plain, secure].filter(Boolean).join(", "),
        });
      }
    }
  }

  // Reloads never overlap, and the last one always sees the newest data.
  function reload(): Promise<void> {
    chain = chain.then(run).catch((error) => {
      ctx.log.error("Reverse proxy reload failed", error as Error);
    });
    return chain;
  }

  function status(routeId: number): RouteRuntime {
    const base = runtime.get(routeId) ?? { state: "stopped" as const };
    const stats = counters.get(routeId);
    return {
      ...base,
      connections: stats?.conn ?? 0,
      bytesIn: stats?.in ?? 0,
      bytesOut: stats?.out ?? 0,
    };
  }

  function dispose() {
    disposed = true;
    closeServer(httpServer);
    closeServer(httpsServer);
    httpServer = null;
    httpsServer = null;
    for (const running of streams.values()) running.listener.close();
    streams.clear();
  }

  return {
    reload,
    status,
    dispose,
    forgetTarget: (hostId: number) => targets.delete(hostId),
    ports: () => ({
      http: httpServer ? settings?.httpPort : undefined,
      https: httpsServer ? settings?.httpsPort : undefined,
    }),
  };
}

export type ProxyManager = ReturnType<typeof createProxyManager>;
