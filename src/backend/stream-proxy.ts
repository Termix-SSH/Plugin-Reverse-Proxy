import dgram from "node:dgram";
import net, { isIP, type Socket } from "node:net";
import type { RouteRecord } from "../shared/types.js";
import { ipAllowed } from "./http-proxy.js";

export interface Listener {
  address: string;
  close: () => void;
}

interface StreamDeps {
  bindHost: string;
  target: (route: RouteRecord) => Promise<{ host: string; port: number }>;
  count: (routeId: number, key: "in" | "out" | "conn", amount: number) => void;
}

const DEFAULT_IDLE_SECONDS = 300;

function peer(socket: Socket): string {
  const address = socket.remoteAddress ?? "";
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

export function startTcp(
  route: RouteRecord,
  deps: StreamDeps,
): Promise<Listener> {
  const sockets = new Set<Socket>();
  const idleMs = (route.options.idleSeconds ?? DEFAULT_IDLE_SECONDS) * 1000;

  const server = net.createServer((inbound) => {
    sockets.add(inbound);
    inbound.on("close", () => sockets.delete(inbound));
    inbound.on("error", () => inbound.destroy());
    if (!ipAllowed(route, peer(inbound))) {
      inbound.destroy();
      return;
    }
    deps.count(route.id, "conn", 1);
    // Hold the client's bytes until the target answers.
    inbound.pause();
    deps
      .target(route)
      .then((target) => {
        const outbound = net.connect(target.port, target.host);
        sockets.add(outbound);
        outbound.on("close", () => {
          sockets.delete(outbound);
          inbound.destroy();
        });
        inbound.on("close", () => outbound.destroy());
        outbound.on("error", () => outbound.destroy());
        outbound.setTimeout(idleMs, () => outbound.destroy());
        inbound.setTimeout(idleMs, () => inbound.destroy());
        inbound.on("data", (chunk) => deps.count(route.id, "in", chunk.length));
        outbound.on("data", (chunk) =>
          deps.count(route.id, "out", chunk.length),
        );
        outbound.on("connect", () => {
          inbound.pipe(outbound);
          outbound.pipe(inbound);
          inbound.resume();
        });
      })
      .catch(() => inbound.destroy());
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: deps.bindHost, port: route.listenPort! }, () => {
      server.removeListener("error", reject);
      server.on("error", () => {});
      const { port } = server.address() as net.AddressInfo;
      resolve({
        address: `${deps.bindHost}:${port}/tcp`,
        close: () => {
          for (const socket of sockets) socket.destroy();
          sockets.clear();
          server.close();
        },
      });
    });
  });
}

interface UdpSession {
  socket: dgram.Socket;
  lastSeen: number;
}

export function startUdp(
  route: RouteRecord,
  deps: StreamDeps,
): Promise<Listener> {
  const family = isIP(deps.bindHost) === 6 ? "udp6" : "udp4";
  const server = dgram.createSocket(family);
  const sessions = new Map<string, UdpSession>();
  const idleMs = (route.options.idleSeconds ?? 60) * 1000;

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, session] of sessions) {
      if (now - session.lastSeen > idleMs) {
        session.socket.close();
        sessions.delete(key);
      }
    }
  }, 10_000);
  sweep.unref();

  server.on("error", () => {});
  server.on("message", (message, remote) => {
    const address = remote.address.startsWith("::ffff:")
      ? remote.address.slice(7)
      : remote.address;
    if (!ipAllowed(route, address)) return;
    deps.count(route.id, "in", message.length);
    const key = `${remote.address}:${remote.port}`;

    const send = (
      session: UdpSession,
      target: { host: string; port: number },
    ) => {
      session.lastSeen = Date.now();
      session.socket.send(message, target.port, target.host);
    };

    const existing = sessions.get(key);
    void deps
      .target(route)
      .then((target) => {
        let session = existing;
        if (!session) {
          const socket = dgram.createSocket(
            isIP(target.host) === 6 ? "udp6" : "udp4",
          );
          session = { socket, lastSeen: Date.now() };
          sessions.set(key, session);
          deps.count(route.id, "conn", 1);
          socket.on("error", () => {
            socket.close();
            sessions.delete(key);
          });
          socket.on("message", (reply) => {
            session!.lastSeen = Date.now();
            deps.count(route.id, "out", reply.length);
            server.send(reply, remote.port, remote.address);
          });
        }
        send(session, target);
      })
      .catch(() => {});
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.bind({ address: deps.bindHost, port: route.listenPort! }, () => {
      server.removeListener("error", reject);
      const { port } = server.address();
      resolve({
        address: `${deps.bindHost}:${port}/udp`,
        close: () => {
          clearInterval(sweep);
          for (const session of sessions.values()) session.socket.close();
          sessions.clear();
          server.close();
        },
      });
    });
  });
}
