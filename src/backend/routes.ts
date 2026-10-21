import { isIP } from "node:net";
import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type {
  AuthMode,
  RouteInput,
  RouteKind,
  RouteOptions,
  TlsMode,
} from "../shared/types.js";
import { AUTH_PATH, type ProxyAuth } from "./auth.js";
import { domainCovers, type CertManager } from "./certs.js";
import type { ProxyManager } from "./manager.js";
import type { Repository } from "./repository.js";
import type { ProxySettings } from "./settings.js";

const RESERVED_PORTS = new Set([30001, 8080]);
const HOSTNAME = /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const TARGET_HOST = /^[a-zA-Z0-9.:_-]{1,255}$/;
const HEADER_NAME = /^[a-zA-Z0-9-]{1,64}$/;
const BLOCKED_HEADERS = new Set([
  "host",
  "connection",
  "upgrade",
  "content-length",
  "transfer-encoding",
]);

export class InputError extends Error {}

function intIn(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function cleanIps(value: unknown, label: string): string[] | undefined {
  if (!Array.isArray(value) || !value.length) return undefined;
  const out: string[] = [];
  for (const raw of value.slice(0, 100)) {
    const entry = String(raw).trim();
    if (!entry) continue;
    const [address, prefix] = entry.split("/");
    const family = isIP(address);
    const max = family === 6 ? 128 : 32;
    if (!family || (prefix !== undefined && intIn(prefix, 0, max) === null)) {
      throw new InputError(`${label}: ${entry} is not an IP or range`);
    }
    out.push(entry);
  }
  return out.length ? out : undefined;
}

function cleanOptions(raw: unknown): RouteOptions {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const options: RouteOptions = {};
  if (typeof src.forceHttps === "boolean") options.forceHttps = src.forceHttps;
  if (typeof src.preserveHost === "boolean") {
    options.preserveHost = src.preserveHost;
  }
  if (typeof src.insecureTarget === "boolean") {
    options.insecureTarget = src.insecureTarget;
  }
  if (src.targetScheme === "https") options.targetScheme = "https";
  const publicPort = intIn(src.httpsPublicPort, 1, 65535);
  if (publicPort) options.httpsPublicPort = publicPort;
  const idle = intIn(src.idleSeconds, 5, 86400);
  if (idle) options.idleSeconds = idle;
  options.allowIps = cleanIps(src.allowIps, "Allow list");
  options.denyIps = cleanIps(src.denyIps, "Deny list");
  if (src.headers && typeof src.headers === "object") {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(src.headers).slice(0, 30)) {
      if (!HEADER_NAME.test(name) || BLOCKED_HEADERS.has(name.toLowerCase())) {
        throw new InputError(`Header ${name} is not allowed`);
      }
      const text = String(value);
      if (/[\r\n]/.test(text) || text.length > 1000) {
        throw new InputError(`Header ${name} has a bad value`);
      }
      headers[name] = text;
    }
    if (Object.keys(headers).length) options.headers = headers;
  }
  return options;
}

export function parseInput(
  body: Record<string, unknown>,
  settings: ProxySettings,
): RouteInput {
  const name = String(body.name ?? "").trim();
  if (!name || name.length > 120) throw new InputError("Enter a name");

  const kind = body.kind as RouteKind;
  if (!["http", "tcp", "udp"].includes(kind)) {
    throw new InputError("Pick HTTP, TCP or UDP");
  }
  const targetPort = intIn(body.targetPort, 1, 65535);
  if (!targetPort) throw new InputError("Enter a target port from 1 to 65535");
  const targetHost = String(body.targetHost ?? "").trim();
  if (targetHost && !TARGET_HOST.test(targetHost)) {
    throw new InputError("The target address is not valid");
  }

  const input: RouteInput = {
    name,
    kind,
    domain: "",
    listenPort: null,
    targetHost,
    targetPort,
    tlsMode: "off",
    certId: null,
    authMode: "none",
    options: cleanOptions(body.options),
    enabled: body.enabled !== false,
  };

  if (kind === "http") {
    const domain = String(body.domain ?? "")
      .trim()
      .toLowerCase();
    if (!HOSTNAME.test(domain)) throw new InputError("Enter a valid domain");
    input.domain = domain;
    const tls = body.tlsMode as TlsMode;
    if (!["off", "acme", "selfsigned", "custom"].includes(tls)) {
      throw new InputError("Pick a certificate option");
    }
    input.tlsMode = tls;
    if (tls === "custom") {
      input.certId = intIn(body.certId, 1, Number.MAX_SAFE_INTEGER);
      if (!input.certId) throw new InputError("Pick a certificate");
    }
    const auth = (body.authMode ?? "none") as AuthMode;
    if (!["none", "user", "host"].includes(auth)) {
      throw new InputError("Pick who can open this route");
    }
    input.authMode = auth;
  } else {
    const port = intIn(body.listenPort, 1, 65535);
    if (!port) throw new InputError("Enter a public port from 1 to 65535");
    if (
      RESERVED_PORTS.has(port) ||
      port === settings.httpPort ||
      port === settings.httpsPort
    ) {
      throw new InputError(`Port ${port} is used by Termix or this plugin`);
    }
    input.listenPort = port;
    // Stream routes have no web only options.
    input.options = {
      allowIps: input.options.allowIps,
      denyIps: input.options.denyIps,
      idleSeconds: input.options.idleSeconds,
    };
  }
  return input;
}

const GATE_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in</title>
<style>
:root{color-scheme:light dark}
body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#18181b;color:#e4e4e7}
main{max-width:360px;padding:24px;text-align:center}
a{color:#e4e4e7;border:1px solid #52525b;padding:8px 14px;text-decoration:none;display:inline-block;margin-top:12px}
p{color:#a1a1aa}
</style></head><body><main>
<h2 id="t">Checking your Termix login</h2><p id="m"></p><div id="a"></div>
<script>
(function(){
var q=new URLSearchParams(location.search);
var title=document.getElementById("t"),msg=document.getElementById("m"),act=document.getElementById("a");
var url=new URL("gate/token",location.href);
url.searchParams.set("route",q.get("route")||"");
url.searchParams.set("to",q.get("to")||"");
var timer=null;
function check(){
fetch(url,{credentials:"include"}).then(function(r){
if(r.status===401){
title.textContent="Sign in to Termix";
msg.textContent="This page is protected. Sign in to Termix in a new tab and this page continues by itself.";
if(!act.firstChild){var a=document.createElement("a");a.href="./";a.target="_blank";a.rel="noopener";a.textContent="Open Termix";act.appendChild(a);}
if(!timer)timer=setInterval(check,2500);
return null;}
return r.json().then(function(d){return {status:r.status,data:d};});
}).then(function(res){
if(!res)return;
if(timer)clearInterval(timer);
if(res.status===200&&res.data.url){location.replace(res.data.url);return;}
title.textContent="No access";
msg.textContent=res.data.error||"You cannot open this page.";
act.textContent="";
}).catch(function(){msg.textContent="Could not reach Termix.";});
}
check();
})();
</script></main></body></html>`;

export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  deps: {
    repo: Repository;
    certs: CertManager;
    auth: ProxyAuth;
    manager: ProxyManager;
    getSettings: () => Promise<ProxySettings>;
  },
): void {
  const { repo, certs, auth, manager } = deps;
  const manage = ctx.rbac.require("use") as never;
  const actor = () => ctx.currentActor() as string;

  const fail = (res: Response, error: unknown) => {
    if (error instanceof InputError) {
      return res.status(400).json({ error: error.message });
    }
    ctx.log.error("Reverse proxy request failed", error as Error);
    return res.status(500).json({ error: "Something went wrong" });
  };

  async function canEdit(hostId: number): Promise<boolean> {
    return (await ctx.hosts.checkAccess(hostId, "edit")).hasAccess;
  }

  async function settleCert(input: RouteInput): Promise<void> {
    if (input.kind !== "http") return;
    if (input.tlsMode === "acme" || input.tlsMode === "selfsigned") {
      input.certId = await certs.ensureFor(
        actor(),
        input.domain,
        input.tlsMode,
      );
      const cert = await repo.getCert(input.certId);
      if (cert?.source === "acme" && cert.status === "pending") {
        void certs.queueIssue(cert.id).then(() => manager.reload());
      }
    } else if (input.tlsMode === "custom") {
      const cert = input.certId ? await repo.getCert(input.certId) : null;
      if (!cert || !cert.domains.some((d) => domainCovers(d, input.domain))) {
        throw new InputError("That certificate does not cover this domain");
      }
    } else {
      input.certId = null;
    }
  }

  async function checkConflicts(input: RouteInput, selfId?: number) {
    const others = (await repo.listRoutes()).filter((r) => r.id !== selfId);
    if (
      input.kind === "http" &&
      others.some((r) => r.kind === "http" && r.domain === input.domain)
    ) {
      throw new InputError(`${input.domain} is already used by another route`);
    }
    if (
      input.kind !== "http" &&
      others.some(
        (r) => r.kind === input.kind && r.listenPort === input.listenPort,
      )
    ) {
      throw new InputError(
        `Port ${input.listenPort} is already used by another ${input.kind} route`,
      );
    }
  }

  const withRuntime = (route: Awaited<ReturnType<typeof repo.getRoute>>) =>
    route && { ...route, runtime: manager.status(route.id) };

  /**
   * @openapi
   * /plugin-api/reverse-proxy/state:
   *   get:
   *     summary: List the routes the user can see, certificates and listener ports
   *     tags:
   *       - Reverse Proxy
   *     responses:
   *       200:
   *         description: Routes with live status, certificates and ports
   */
  router.get("/state", manage, async (_req: Request, res: Response) => {
    try {
      const hostList = await ctx.hosts.list();
      const visible = new Set(hostList.map((h) => h.id));
      const names = new Map(hostList.map((h) => [h.id, h.name || h.ip]));
      const hosts = [];
      for (const h of hostList) {
        hosts.push({
          id: h.id,
          name: h.name || h.ip,
          address: h.ip,
          enabled:
            (await ctx.settings.getHost<boolean>(
              h.id,
              "enableReverseProxy",
            )) !== false,
          defaultAccess:
            (await ctx.settings.getHost<string>(h.id, "defaultAccess")) ||
            "none",
          targetAddress:
            (await ctx.settings.getHost<string>(h.id, "targetAddress")) || "",
        });
      }
      const routes = (await repo.listRoutes())
        .filter((r) => visible.has(r.hostId))
        .map((r) => ({
          ...r,
          hostName: names.get(r.hostId) ?? String(r.hostId),
          runtime: manager.status(r.id),
        }));
      const certList = (await repo.listCerts()).map((c) => ({
        id: c.id,
        domains: c.domains,
        source: c.source,
        status: c.status,
        error: c.error,
        notAfter: c.notAfter,
        createdAt: c.createdAt,
      }));
      const settings = await deps.getSettings();
      res.json({
        routes,
        hosts,
        certs: certList,
        ports: {
          http: settings.httpPort,
          https: settings.httpsPort,
          bindHost: settings.bindHost,
          running: manager.ports(),
        },
        needsBaseUrl: !settings.publicBaseUrl,
        needsEmail: !settings.acmeEmail,
      });
    } catch (error) {
      fail(res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/reverse-proxy/routes:
   *   post:
   *     summary: Add a route to a host
   *     tags:
   *       - Reverse Proxy
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               hostId:
   *                 type: integer
   *     responses:
   *       201:
   *         description: Route added
   *       400:
   *         description: Invalid route
   *       403:
   *         description: No edit access to the host
   */
  router.post("/routes", manage, async (req: Request, res: Response) => {
    try {
      const hostId = Number(req.body?.hostId);
      if (!Number.isInteger(hostId) || !(await canEdit(hostId))) {
        return res.status(403).json({ error: "No edit access to this host" });
      }
      if (
        (await ctx.settings.getHost<boolean>(hostId, "enableReverseProxy")) ===
        false
      ) {
        throw new InputError("Reverse proxy is turned off for this host");
      }
      const input = parseInput(req.body ?? {}, await deps.getSettings());
      await checkConflicts(input);
      await settleCert(input);
      const route = await repo.createRoute(hostId, actor(), input);
      await manager.reload();
      res.status(201).json({ route: withRuntime(route) });
    } catch (error) {
      fail(res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/reverse-proxy/routes/{id}/enabled:
   *   patch:
   *     summary: Turn a route on or off
   *     tags:
   *       - Reverse Proxy
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               enabled:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Route updated
   *       404:
   *         description: Route not found
   */
  router.patch(
    "/routes/:id/enabled",
    manage,
    async (req: Request, res: Response) => {
      try {
        const existing = await repo.getRoute(Number(req.params.id));
        if (!existing || !(await canEdit(existing.hostId))) {
          return res.status(404).json({ error: "Route not found" });
        }
        const {
          id: _id,
          hostId: _h,
          userId: _u,
          createdAt: _c,
          ...input
        } = existing;
        await repo.updateRoute(existing.id, {
          ...input,
          enabled: req.body?.enabled === true,
        });
        await manager.reload();
        res.json({ route: withRuntime(await repo.getRoute(existing.id)) });
      } catch (error) {
        fail(res, error);
      }
    },
  );

  /**
   * @openapi
   * /plugin-api/reverse-proxy/routes/{id}:
   *   put:
   *     summary: Change a route
   *     tags:
   *       - Reverse Proxy
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Route saved
   *       400:
   *         description: Invalid route
   *       404:
   *         description: Route not found
   */
  router.put("/routes/:id", manage, async (req: Request, res: Response) => {
    try {
      const existing = await repo.getRoute(Number(req.params.id));
      if (!existing || !(await canEdit(existing.hostId))) {
        return res.status(404).json({ error: "Route not found" });
      }
      const input = parseInput(req.body ?? {}, await deps.getSettings());
      await checkConflicts(input, existing.id);
      await settleCert(input);
      await repo.updateRoute(existing.id, input);
      manager.forgetTarget(existing.hostId);
      await manager.reload();
      res.json({ route: withRuntime(await repo.getRoute(existing.id)) });
    } catch (error) {
      fail(res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/reverse-proxy/routes/{id}:
   *   delete:
   *     summary: Remove a route
   *     tags:
   *       - Reverse Proxy
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Route removed
   *       404:
   *         description: Route not found
   */
  router.delete("/routes/:id", manage, async (req: Request, res: Response) => {
    try {
      const existing = await repo.getRoute(Number(req.params.id));
      if (!existing || !(await canEdit(existing.hostId))) {
        return res.status(404).json({ error: "Route not found" });
      }
      await repo.deleteRoute(existing.id);
      await manager.reload();
      res.json({ success: true });
    } catch (error) {
      fail(res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/reverse-proxy/certs/selfsigned:
   *   post:
   *     summary: Make a self-signed certificate
   *     tags:
   *       - Reverse Proxy
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               domains:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       201:
   *         description: Certificate made
   */
  router.post(
    "/certs/selfsigned",
    manage,
    async (req: Request, res: Response) => {
      try {
        const domains = (
          Array.isArray(req.body?.domains) ? req.body.domains : []
        )
          .map((d: unknown) => String(d).trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 20);
        if (
          !domains.length ||
          !domains.every((d: string) => HOSTNAME.test(d))
        ) {
          throw new InputError("Enter valid domains");
        }
        const cert = await certs.createSelfSigned(actor(), domains);
        res.status(201).json({ id: cert.id });
      } catch (error) {
        fail(res, error);
      }
    },
  );

  /**
   * @openapi
   * /plugin-api/reverse-proxy/certs/upload:
   *   post:
   *     summary: Add your own certificate and private key
   *     tags:
   *       - Reverse Proxy
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               cert:
   *                 type: string
   *               key:
   *                 type: string
   *     responses:
   *       201:
   *         description: Certificate added
   *       400:
   *         description: Certificate and key do not match
   */
  router.post("/certs/upload", manage, async (req: Request, res: Response) => {
    try {
      const cert = String(req.body?.cert ?? "");
      const key = String(req.body?.key ?? "");
      if (!cert.includes("BEGIN CERTIFICATE") || !key.includes("PRIVATE KEY")) {
        throw new InputError("Paste a PEM certificate and private key");
      }
      const created = await certs.createCustom(actor(), cert, key);
      res.status(201).json({ id: created.id });
    } catch (error) {
      if (error instanceof Error && !(error instanceof InputError)) {
        return res.status(400).json({ error: error.message });
      }
      fail(res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/reverse-proxy/certs/{id}/renew:
   *   post:
   *     summary: Request a Let's Encrypt certificate again
   *     tags:
   *       - Reverse Proxy
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       202:
   *         description: Started
   *       404:
   *         description: Certificate not found
   */
  router.post(
    "/certs/:id/renew",
    manage,
    async (req: Request, res: Response) => {
      try {
        const cert = await repo.getCert(Number(req.params.id));
        if (!cert || cert.source !== "acme") {
          return res.status(404).json({ error: "Certificate not found" });
        }
        void certs.queueIssue(cert.id, true).then(() => manager.reload());
        res.status(202).json({ success: true });
      } catch (error) {
        fail(res, error);
      }
    },
  );

  /**
   * @openapi
   * /plugin-api/reverse-proxy/certs/{id}:
   *   delete:
   *     summary: Delete a certificate that no route uses
   *     tags:
   *       - Reverse Proxy
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Deleted
   *       409:
   *         description: A route still uses it
   */
  router.delete("/certs/:id", manage, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if ((await repo.listRoutes()).some((r) => r.certId === id)) {
        return res
          .status(409)
          .json({ error: "A route still uses this certificate" });
      }
      await repo.deleteCert(id);
      certs.forget(id);
      res.json({ success: true });
    } catch (error) {
      fail(res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/reverse-proxy/gate:
   *   get:
   *     summary: Sign in page for a protected route, hands off to the Termix login
   *     tags:
   *       - Reverse Proxy
   *     responses:
   *       200:
   *         description: HTML page
   */
  router.get("/gate", (_req: Request, res: Response) => {
    res
      .set({
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
        "x-frame-options": "DENY",
      })
      .send(GATE_PAGE);
  });

  /**
   * @openapi
   * /plugin-api/reverse-proxy/gate/token:
   *   get:
   *     summary: Check the signed-in user can open a route and return its sign in link
   *     tags:
   *       - Reverse Proxy
   *     parameters:
   *       - in: query
   *         name: route
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: to
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The link that sets the cookie on the route's domain
   *       403:
   *         description: The user may not open this route
   *       404:
   *         description: Route not found
   */
  router.get("/gate/token", async (req: Request, res: Response) => {
    try {
      const route = await repo.getRoute(Number(req.query.route));
      if (!route || route.kind !== "http" || !route.enabled) {
        return res.status(404).json({ error: "Route not found" });
      }
      let back: URL;
      try {
        back = new URL(String(req.query.to));
      } catch {
        return res.status(400).json({ error: "Bad address" });
      }
      if (
        !["http:", "https:"].includes(back.protocol) ||
        !domainCovers(route.domain, back.hostname)
      ) {
        return res.status(400).json({ error: "Bad address" });
      }
      let allowed = false;
      if (route.authMode === "user") {
        allowed = await ctx.rbac.has("access");
      } else if (route.authMode === "host") {
        allowed = (await ctx.hosts.checkAccess(route.hostId, "connect"))
          .hasAccess;
      }
      if (!allowed) {
        return res
          .status(403)
          .json({ error: "Your Termix account cannot open this page." });
      }
      const settings = await deps.getSettings();
      const token = auth.mint("token", route, settings.cookieHours);
      const path = back.pathname + back.search;
      res.set("cache-control", "no-store").json({
        url: `${back.protocol}//${back.host}${AUTH_PATH}?t=${encodeURIComponent(token)}&to=${encodeURIComponent(path)}`,
      });
    } catch (error) {
      fail(res, error);
    }
  });
}
