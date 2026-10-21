import dgram from "node:dgram";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { COOKIE_NAME } from "../../src/backend/auth.js";
import {
  createRig,
  freePort,
  get,
  routeInput,
  startTarget,
  type Rig,
} from "./helpers";

let rig: Rig | null = null;
const closers: Array<() => void> = [];

afterEach(async () => {
  for (const close of closers.splice(0)) close();
  await rig?.close();
  rig = null;
});

async function boot() {
  rig = await createRig();
  return rig;
}

describe("http routes", () => {
  it("forwards by Host header with forwarded headers and custom headers", async () => {
    const r = await boot();
    const seen: http.IncomingHttpHeaders[] = [];
    const target = await startTarget((req, res) => {
      seen.push(req.headers);
      res.setHeader("x-from-target", "yes");
      res.end(`hello ${req.url}`);
    });
    closers.push(() => target.server.close());
    await r.repo.createRoute(
      1,
      "user-1",
      routeInput({
        targetPort: target.port,
        options: { headers: { "X-Extra": "1" } },
      }),
    );
    await r.manager.reload();

    const reply = await get(r.httpPort, "app.test", "/a?b=1");
    expect(reply.status).toBe(200);
    expect(reply.body).toBe("hello /a?b=1");
    expect(reply.headers["x-from-target"]).toBe("yes");
    expect(seen[0]["x-forwarded-host"]).toBe("app.test");
    expect(seen[0]["x-forwarded-proto"]).toBe("http");
    expect(seen[0]["x-extra"]).toBe("1");
    expect(r.manager.status(1).state).toBe("running");
  });

  it("answers 404 for an unknown host and 502 for a dead target", async () => {
    const r = await boot();
    await r.repo.createRoute(
      1,
      "user-1",
      routeInput({ targetPort: await freePort() }),
    );
    await r.manager.reload();
    expect((await get(r.httpPort, "nope.test")).status).toBe(404);
    expect((await get(r.httpPort, "app.test")).status).toBe(502);
  });

  it("blocks addresses outside the allow list", async () => {
    const r = await boot();
    await r.repo.createRoute(
      1,
      "user-1",
      routeInput({ options: { allowIps: ["10.9.9.9"] } }),
    );
    await r.manager.reload();
    expect((await get(r.httpPort, "app.test")).status).toBe(403);
  });

  it("stops serving a route that is disabled or deleted", async () => {
    const r = await boot();
    const route = await r.repo.createRoute(1, "user-1", routeInput());
    await r.manager.reload();
    expect((await get(r.httpPort, "app.test")).status).toBe(502);
    await r.repo.updateRoute(route.id, routeInput({ enabled: false }));
    await r.manager.reload();
    await expect(get(r.httpPort, "app.test")).rejects.toThrow();
  });

  it("serves a pending ACME challenge on the http port", async () => {
    const r = await boot();
    await r.repo.createRoute(1, "user-1", routeInput());
    await r.manager.reload();
    const reply = await get(
      r.httpPort,
      "app.test",
      "/.well-known/acme-challenge/missing",
    );
    expect(reply.status).toBe(502);
  });
});

describe("login in front of a route", () => {
  it("sends a visitor to the gate, then lets the token set a cookie", async () => {
    const r = await boot();
    const target = await startTarget((req, res) => {
      res.end(`cookie:${req.headers.cookie ?? "none"}`);
    });
    closers.push(() => target.server.close());
    const route = await r.repo.createRoute(
      1,
      "user-1",
      routeInput({ targetPort: target.port, authMode: "user" }),
    );
    await r.manager.reload();

    const first = await get(r.httpPort, "app.test", "/page");
    expect(first.status).toBe(302);
    const location = new URL(first.headers.location as string);
    expect(location.origin).toBe("http://termix.test");
    expect(location.pathname).toBe("/plugin-api/reverse-proxy/gate");
    expect(location.searchParams.get("route")).toBe(String(route.id));
    expect(new URL(location.searchParams.get("to")!).pathname).toBe("/page");

    const token = r.auth.mint("token", route, 12);
    const handoff = await get(
      r.httpPort,
      "app.test",
      `/__rp/auth?t=${encodeURIComponent(token)}&to=%2Fpage`,
    );
    expect(handoff.status).toBe(302);
    expect(handoff.headers.location).toBe("/page");
    const setCookie = String(handoff.headers["set-cookie"]);
    expect(setCookie).toContain("HttpOnly");
    const cookie = setCookie.split(";")[0];

    const ok = await get(r.httpPort, "app.test", "/page", {
      cookie: `${cookie}; a=1`,
    });
    expect(ok.status).toBe(200);
    // The login cookie never reaches the service.
    expect(ok.body).toBe("cookie:a=1");
  });

  it("refuses a bad token and a cookie for another route", async () => {
    const r = await boot();
    const route = await r.repo.createRoute(
      1,
      "user-1",
      routeInput({ authMode: "user" }),
    );
    await r.manager.reload();
    const bad = await get(r.httpPort, "app.test", "/__rp/auth?t=junk&to=/");
    expect(bad.status).toBe(403);

    const other = r.auth.mint(
      "cookie",
      { id: route.id + 1, domain: "app.test" },
      1,
    );
    const reply = await get(r.httpPort, "app.test", "/", {
      cookie: `${COOKIE_NAME}=${other}`,
    });
    expect(reply.status).toBe(302);
  });

  it("explains when the Termix address is not set", async () => {
    const r = await boot();
    await r.mock.ctx.settings.set("publicBaseUrl", "");
    await r.repo.createRoute(1, "user-1", routeInput({ authMode: "user" }));
    await r.manager.reload();
    expect((await get(r.httpPort, "app.test")).status).toBe(503);
  });
});

describe("websocket upgrade", () => {
  it("passes an upgraded connection through", async () => {
    const r = await boot();
    const target = http.createServer();
    target.on("upgrade", (_req, socket) => {
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: echo\r\nConnection: Upgrade\r\n\r\n",
      );
      socket.on("data", (chunk) => socket.write(chunk));
    });
    await new Promise<void>((resolve) =>
      target.listen(0, "127.0.0.1", resolve),
    );
    closers.push(() => target.close());
    const port = (target.address() as net.AddressInfo).port;
    await r.repo.createRoute(1, "user-1", routeInput({ targetPort: port }));
    await r.manager.reload();

    const echoed = await new Promise<string>((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1",
        port: r.httpPort,
        headers: { host: "app.test", connection: "Upgrade", upgrade: "echo" },
      });
      req.on("upgrade", (_res, socket) => {
        socket.write("ping");
        socket.once("data", (data) => {
          socket.destroy();
          resolve(data.toString());
        });
      });
      req.on("error", reject);
      req.end();
    });
    expect(echoed).toBe("ping");
  });
});

describe("tcp and udp routes", () => {
  it("relays tcp to the target", async () => {
    const r = await boot();
    const target = net.createServer((socket) => socket.pipe(socket));
    await new Promise<void>((resolve) =>
      target.listen(0, "127.0.0.1", resolve),
    );
    closers.push(() => target.close());
    const listenPort = await freePort();
    await r.repo.createRoute(
      1,
      "user-1",
      routeInput({
        kind: "tcp",
        domain: "",
        listenPort,
        targetPort: (target.address() as net.AddressInfo).port,
      }),
    );
    await r.manager.reload();
    expect(r.manager.status(1).state).toBe("running");

    const echoed = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(listenPort, "127.0.0.1", () =>
        socket.write("hello"),
      );
      socket.once("data", (data) => {
        socket.destroy();
        resolve(data.toString());
      });
      socket.on("error", reject);
    });
    expect(echoed).toBe("hello");
  });

  it("relays udp both ways", async () => {
    const r = await boot();
    const target = dgram.createSocket("udp4");
    target.on("message", (message, remote) =>
      target.send(
        Buffer.concat([Buffer.from("re:"), message]),
        remote.port,
        remote.address,
      ),
    );
    await new Promise<void>((resolve) => target.bind(0, "127.0.0.1", resolve));
    closers.push(() => target.close());
    const listenPort = await freePort();
    await r.repo.createRoute(
      1,
      "user-1",
      routeInput({
        kind: "udp",
        domain: "",
        listenPort,
        targetPort: target.address().port,
      }),
    );
    await r.manager.reload();

    const client = dgram.createSocket("udp4");
    closers.push(() => client.close());
    const reply = await new Promise<string>((resolve) => {
      client.once("message", (message) => resolve(message.toString()));
      client.send("ping", listenPort, "127.0.0.1");
    });
    expect(reply).toBe("re:ping");
  });

  it("reports a port that is already taken", async () => {
    const r = await boot();
    const blocker = net.createServer();
    await new Promise<void>((resolve) =>
      blocker.listen(0, "127.0.0.1", resolve),
    );
    closers.push(() => blocker.close());
    await r.repo.createRoute(
      1,
      "user-1",
      routeInput({
        kind: "tcp",
        domain: "",
        listenPort: (blocker.address() as net.AddressInfo).port,
      }),
    );
    await r.manager.reload();
    expect(r.manager.status(1).state).toBe("error");
  });
});

describe("https routes", () => {
  it("serves a self-signed certificate by name and redirects plain http", async () => {
    const r = await boot();
    const target = await startTarget((_req, res) => res.end("secure ok"));
    closers.push(() => target.server.close());
    const certId = await r.certs.ensureFor("user-1", "app.test", "selfsigned");
    await r.repo.createRoute(
      1,
      "user-1",
      routeInput({
        targetPort: target.port,
        tlsMode: "selfsigned",
        certId,
        options: { httpsPublicPort: r.httpsPort },
      }),
    );
    await r.manager.reload();
    expect(r.manager.status(1).state).toBe("running");

    const redirect = await get(r.httpPort, "app.test", "/x");
    expect(redirect.status).toBe(301);
    expect(redirect.headers.location).toBe(`https://app.test:${r.httpsPort}/x`);

    const body = await new Promise<string>((resolve, reject) => {
      const req = https.request(
        {
          host: "127.0.0.1",
          port: r.httpsPort,
          servername: "app.test",
          rejectUnauthorized: false,
          headers: { host: "app.test" },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve(data));
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(body).toBe("secure ok");
  });

  it("rejects an uploaded certificate whose key does not match", async () => {
    const r = await boot();
    const first = await r.certs.createSelfSigned("user-1", ["a.test"]);
    const second = await r.certs.createSelfSigned("user-1", ["b.test"]);
    const cert = (await r.repo.getCert(first.id))!;
    const other = (await r.repo.getCert(second.id))!;
    const wrongKey = await r.mock.ctx.secrets.unseal(other.keySealed!);
    await expect(
      r.certs.createCustom("user-1", cert.certPem!, wrongKey!),
    ).rejects.toThrow(/do not match/);
    const rightKey = await r.mock.ctx.secrets.unseal(cert.keySealed!);
    const custom = await r.certs.createCustom(
      "user-1",
      cert.certPem!,
      rightKey!,
    );
    expect(custom.domains).toEqual(["a.test"]);
  });
});
