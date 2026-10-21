import http, { type IncomingMessage, type ServerResponse } from "node:http";
import https from "node:https";
import { BlockList, isIP, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import type { RouteRecord } from "../shared/types.js";
import {
  AUTH_PATH,
  COOKIE_NAME,
  readCookie,
  stripCookie,
  type ProxyAuth,
} from "./auth.js";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export interface HttpProxyDeps {
  routeForHost: (host: string) => RouteRecord | undefined;
  target: (route: RouteRecord) => Promise<{ host: string; port: number }>;
  challenge: (token: string) => string | undefined;
  auth: ProxyAuth;
  publicBaseUrl: () => string;
  cookieHours: () => number;
  count: (routeId: number, key: "in" | "out" | "conn", amount: number) => void;
}

function hostnameOf(header: string | undefined): string {
  if (!header) return "";
  const value = header.toLowerCase();
  if (value.startsWith("[")) return value.slice(0, value.indexOf("]") + 1);
  return value.split(":")[0];
}

function clientIp(socket: Socket): string {
  const address = socket.remoteAddress ?? "";
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

function listFor(entries: string[] | undefined): BlockList | null {
  if (!entries?.length) return null;
  const list = new BlockList();
  for (const entry of entries) {
    const [address, prefix] = entry.trim().split("/");
    const family = isIP(address);
    if (!family) continue;
    const type = family === 6 ? "ipv6" : "ipv4";
    if (prefix === undefined) list.addAddress(address, type);
    else list.addSubnet(address, Number(prefix), type);
  }
  return list;
}

/** True when the route's allow and deny lists let this address in. */
export function ipAllowed(route: RouteRecord, address: string): boolean {
  const family = isIP(address);
  if (!family) return false;
  const type = family === 6 ? "ipv6" : "ipv4";
  const deny = listFor(route.options.denyIps);
  if (deny?.check(address, type)) return false;
  const allow = listFor(route.options.allowIps);
  return !allow || allow.check(address, type);
}

function plain(res: ServerResponse, status: number, message: string) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(message);
}

function forwardedHeaders(
  req: IncomingMessage,
  route: RouteRecord,
  target: { host: string; port: number },
  secure: boolean,
  upgrade: boolean,
) {
  const headers: http.OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (!upgrade && HOP_BY_HOP.has(name)) continue;
    if (name === "cookie") continue;
    headers[name] = value;
  }
  const cookie = stripCookie(req.headers.cookie, COOKIE_NAME);
  if (cookie) headers.cookie = cookie;
  const original = req.headers.host ?? "";
  if (!route.options.preserveHost) {
    headers.host = `${target.host}:${target.port}`;
  }
  const ip = clientIp(req.socket);
  const prior = req.headers["x-forwarded-for"];
  headers["x-forwarded-for"] = prior ? `${prior}, ${ip}` : ip;
  headers["x-forwarded-proto"] = secure ? "https" : "http";
  headers["x-forwarded-host"] = original;
  for (const [name, value] of Object.entries(route.options.headers ?? {})) {
    headers[name.toLowerCase()] = value;
  }
  return headers;
}

export function createHttpHandlers(deps: HttpProxyDeps) {
  function gateUrl(route: RouteRecord, req: IncomingMessage, secure: boolean) {
    const base = deps.publicBaseUrl();
    if (!base) return null;
    const origin = `${secure ? "https" : "http"}://${req.headers.host}`;
    const back = `${origin}${req.url ?? "/"}`;
    return `${base}/plugin-api/reverse-proxy/gate?route=${route.id}&to=${encodeURIComponent(back)}`;
  }

  /** Returns true when the request was answered here and must not be proxied. */
  function guard(
    req: IncomingMessage,
    res: ServerResponse | null,
    socket: Duplex,
    route: RouteRecord,
    secure: boolean,
  ): boolean {
    const answer = (status: number, message: string) => {
      if (res) plain(res, status, message);
      else {
        socket.write(
          `HTTP/1.1 ${status} ${message}\r\nconnection: close\r\ncontent-length: 0\r\n\r\n`,
        );
        socket.destroy();
      }
      return true;
    };

    if (!ipAllowed(route, clientIp(req.socket))) {
      return answer(403, "Forbidden");
    }
    if (route.authMode === "none") return false;

    const url = new URL(req.url ?? "/", "http://placeholder");
    if (res && url.pathname === AUTH_PATH) {
      const token = url.searchParams.get("t") ?? undefined;
      if (!deps.auth.verify(token, "token", route)) {
        return answer(403, "This sign in link has expired. Try again.");
      }
      const cookie = deps.auth.mint("cookie", route, deps.cookieHours());
      const to = url.searchParams.get("to") ?? "/";
      const safe = to.startsWith("/") && !to.startsWith("//") ? to : "/";
      res.writeHead(302, {
        location: safe,
        "set-cookie": `${COOKIE_NAME}=${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${deps.cookieHours() * 3600}${secure ? "; Secure" : ""}`,
        "cache-control": "no-store",
      });
      res.end();
      return true;
    }

    const cookie = readCookie(req.headers.cookie, COOKIE_NAME);
    if (deps.auth.verify(cookie, "cookie", route)) return false;

    if (!res) return answer(401, "Unauthorized");
    const gate = gateUrl(route, req, secure);
    if (!gate) {
      return answer(
        503,
        "Sign in is on for this route but no Termix address is set in the Reverse Proxy settings.",
      );
    }
    res.writeHead(302, { location: gate, "cache-control": "no-store" });
    res.end();
    return true;
  }

  function onRequest(
    req: IncomingMessage,
    res: ServerResponse,
    secure: boolean,
  ) {
    const host = hostnameOf(req.headers.host);
    const path = req.url ?? "/";

    if (!secure && path.startsWith("/.well-known/acme-challenge/")) {
      const answer = deps.challenge(path.split("/").pop() ?? "");
      if (answer) {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end(answer);
        return;
      }
    }

    const route = deps.routeForHost(host);
    if (!route) return plain(res, 404, "No route for this host");

    if (
      !secure &&
      route.tlsMode !== "off" &&
      route.options.forceHttps !== false
    ) {
      const port = route.options.httpsPublicPort;
      const authority = port && port !== 443 ? `${host}:${port}` : host;
      res.writeHead(301, { location: `https://${authority}${path}` });
      res.end();
      return;
    }

    if (guard(req, res, req.socket, route, secure)) return;

    void deps
      .target(route)
      .then((target) => {
        const lib = route.options.targetScheme === "https" ? https : http;
        const proxyReq = lib.request(
          {
            host: target.host,
            port: target.port,
            method: req.method,
            path,
            headers: forwardedHeaders(req, route, target, secure, false),
            ...(route.options.targetScheme === "https"
              ? {
                  rejectUnauthorized: !route.options.insecureTarget,
                  servername: isIP(target.host) ? undefined : target.host,
                }
              : {}),
          },
          (proxyRes) => {
            const out: http.OutgoingHttpHeaders = {};
            for (const [name, value] of Object.entries(proxyRes.headers)) {
              if (HOP_BY_HOP.has(name)) continue;
              out[name] = value;
            }
            res.writeHead(proxyRes.statusCode ?? 502, out);
            proxyRes.on("data", (chunk: Buffer) =>
              deps.count(route.id, "out", chunk.length),
            );
            proxyRes.pipe(res);
          },
        );
        deps.count(route.id, "conn", 1);
        proxyReq.setTimeout((route.options.idleSeconds ?? 120) * 1000, () =>
          proxyReq.destroy(new Error("Target timed out")),
        );
        proxyReq.on("error", () => plain(res, 502, "Bad gateway"));
        req.on("data", (chunk: Buffer) =>
          deps.count(route.id, "in", chunk.length),
        );
        req.on("aborted", () => proxyReq.destroy());
        res.on("close", () => proxyReq.destroy());
        req.pipe(proxyReq);
      })
      .catch(() => plain(res, 502, "Could not find the target host"));
  }

  function onUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    secure: boolean,
  ) {
    socket.on("error", () => socket.destroy());
    const route = deps.routeForHost(hostnameOf(req.headers.host));
    if (!route) {
      socket.destroy();
      return;
    }
    if (guard(req, null, socket, route, secure)) return;

    void deps
      .target(route)
      .then((target) => {
        const lib = route.options.targetScheme === "https" ? https : http;
        const proxyReq = lib.request({
          host: target.host,
          port: target.port,
          method: req.method,
          path: req.url,
          headers: forwardedHeaders(req, route, target, secure, true),
          ...(route.options.targetScheme === "https"
            ? { rejectUnauthorized: !route.options.insecureTarget }
            : {}),
        });
        deps.count(route.id, "conn", 1);
        proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
          proxySocket.on("error", () => socket.destroy());
          socket.on("close", () => proxySocket.destroy());
          let raw = `HTTP/1.1 101 Switching Protocols\r\n`;
          for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
            raw += `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`;
          }
          socket.write(`${raw}\r\n`);
          if (proxyHead.length) socket.write(proxyHead);
          if (head.length) proxySocket.write(head);
          proxySocket.on("data", (chunk: Buffer) =>
            deps.count(route.id, "out", chunk.length),
          );
          socket.on("data", (chunk: Buffer) =>
            deps.count(route.id, "in", chunk.length),
          );
          proxySocket.pipe(socket);
          socket.pipe(proxySocket);
        });
        proxyReq.on("response", (proxyRes) => {
          let raw = `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`;
          for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
            raw += `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`;
          }
          socket.write(`${raw}\r\n`);
          proxyRes.pipe(socket);
        });
        proxyReq.on("error", () => socket.destroy());
        proxyReq.end();
      })
      .catch(() => socket.destroy());
  }

  return { onRequest, onUpgrade };
}
