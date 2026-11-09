import http from "node:http";
import type { Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { COOKIE_NAME } from "../../src/backend/auth.js";
import { createEndpointService } from "../../src/backend/endpoint-service.js";
import { createRig, get, startTarget, type Rig } from "./helpers";

let rig: Rig | null = null;
const closers: Array<() => void> = [];

afterEach(async () => {
  for (const close of closers.splice(0)) close();
  await rig?.close();
  rig = null;
});

async function boot() {
  const r = await createRig();
  rig = r;
  await r.mock.ctx.settings.set("endpointDomain", "*.apps.test");
  await r.manager.reload();
  r.mock.ctx.hosts.checkAccess = (async () => ({ hasAccess: true })) as never;
  const service = createEndpointService(r.mock.ctx, {
    manager: r.manager,
    auth: r.auth,
    getSettings: () =>
      import("../../src/backend/settings.js").then((m) =>
        m.readSettings(r.mock.ctx),
      ),
  });
  return { r, service };
}

/** Follows the sign in link the way a browser would and returns the session. */
async function signIn(port: number, url: string) {
  const link = new URL(url);
  const reply = await get(port, link.hostname, link.pathname + link.search);
  expect(reply.status).toBe(302);
  const cookie = String(reply.headers["set-cookie"]).split(";")[0];
  expect(cookie.startsWith(`${COOKIE_NAME}=`)).toBe(true);
  return { host: link.hostname, cookie, to: reply.headers.location! };
}

function upgrade(
  port: number,
  host: string,
  cookie?: string,
): Promise<{ status: number; socket?: Socket }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      port,
      host: "127.0.0.1",
      path: "/ws",
      headers: {
        host,
        connection: "upgrade",
        upgrade: "websocket",
        ...(cookie ? { cookie } : {}),
      },
    });
    req.on("upgrade", (res, socket) =>
      resolve({ status: res.statusCode ?? 0, socket: socket as Socket }),
    );
    req.on("response", (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0 });
    });
    req.on("error", reject);
    req.end();
  });
}

describe("opening a page through Termix", () => {
  it("serves a root relative app at the root of its own name", async () => {
    const { r, service } = await boot();
    const target = await startTarget((req, res) => {
      res.setHeader("set-cookie", "app=1; Path=/");
      res.end(`app ${req.url} cookie=${req.headers.cookie ?? ""}`);
    });
    closers.push(() => target.server.close());

    const { url } = await r.mock.ctx.asUser("user-1", () =>
      service.open({
        hostId: 1,
        path: "/ui",
        target: { host: "127.0.0.1", port: target.port, scheme: "http" },
      }),
    );
    expect(new URL(url).hostname).toMatch(/^[0-9a-f]{24}\.apps\.test$/);

    const { host, cookie, to } = await signIn(r.httpPort, url);
    expect(to).toBe("/ui");

    // A page asking for /assets/app.js gets it from the app, not from Termix.
    const asset = await get(r.httpPort, host, "/assets/app.js", {
      cookie: `${cookie}; app=1`,
    });
    expect(asset.status).toBe(200);
    expect(asset.body).toBe("app /assets/app.js cookie=app=1");
  });

  it("refuses anyone without the sign in cookie", async () => {
    const { r, service } = await boot();
    const target = await startTarget((_req, res) => res.end("secret"));
    closers.push(() => target.server.close());

    const { url } = await r.mock.ctx.asUser("user-1", () =>
      service.open({
        hostId: 1,
        target: { host: "127.0.0.1", port: target.port, scheme: "http" },
      }),
    );
    const reply = await get(r.httpPort, new URL(url).hostname, "/");
    expect(reply.status).toBe(403);
    expect(reply.body).not.toContain("secret");

    const other = await get(r.httpPort, new URL(url).hostname, "/", {
      cookie: `${COOKIE_NAME}=forged`,
    });
    expect(other.status).toBe(403);
  });

  it("carries WebSockets, and only for a signed in visitor", async () => {
    const { r, service } = await boot();
    const target = await startTarget((_req, res) => res.end("ok"));
    closers.push(() => target.server.close());
    target.server.on("upgrade", (_req, socket) => {
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\nConnection: upgrade\r\nUpgrade: websocket\r\n\r\n",
      );
      socket.on("data", (data) => socket.write(data));
    });

    const { url } = await r.mock.ctx.asUser("user-1", () =>
      service.open({
        hostId: 1,
        target: { host: "127.0.0.1", port: target.port, scheme: "http" },
      }),
    );
    const { host, cookie } = await signIn(r.httpPort, url);

    expect((await upgrade(r.httpPort, host)).status).not.toBe(101);

    const open = await upgrade(r.httpPort, host, cookie);
    expect(open.status).toBe(101);
    const echoed = await new Promise<string>((resolve) => {
      open.socket!.once("data", (data) => resolve(String(data)));
      open.socket!.write("ping");
    });
    expect(echoed).toBe("ping");
    open.socket!.destroy();
  });

  it("needs connect access to the host", async () => {
    const { r, service } = await boot();
    r.mock.ctx.hosts.checkAccess = (async () => ({
      hasAccess: false,
    })) as never;
    await expect(
      r.mock.ctx.asUser("user-1", () =>
        service.open({
          hostId: 1,
          target: { host: "127.0.0.1", port: 1, scheme: "http" },
        }),
      ),
    ).rejects.toThrow("access denied");
  });

  it("says when it is not set up", async () => {
    const { r, service } = await boot();
    expect(await service.available()).toBe(true);
    await r.mock.ctx.settings.set("endpointDomain", "");
    expect(await service.available()).toBe(false);
    await expect(
      r.mock.ctx.asUser("user-1", () =>
        service.open({
          hostId: 1,
          target: { host: "127.0.0.1", port: 1, scheme: "http" },
        }),
      ),
    ).rejects.toThrow("Web endpoint domain");
  });
});
