/**
 * Short lived routes on a wildcard domain, so a Termix user can open a web UI
 * only the server can reach. Each open gets its own name under the domain, so
 * apps that expect to sit at the root work and stay apart from Termix and from
 * each other. They live in memory and end when idle.
 */

import { randomBytes } from "node:crypto";
import type { RouteRecord } from "../shared/types.js";

const IDLE_MS = 10 * 60 * 1000;
const MAX_LIFE_MS = 12 * 60 * 60 * 1000;
const MAX_OPEN = 200;
const DOMAIN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export interface EndpointTarget {
  host: string;
  port: number;
  scheme: "http" | "https";
  /** Accept a self-signed certificate on the target. */
  ignoreCert?: boolean;
}

export interface EndpointDomain {
  domain: string;
  /** The port visitors use, when it is not the scheme's own. */
  port: number | null;
}

/** "*.apps.example.com" or "apps.example.com:8443". Null when it is not one. */
export function parseEndpointDomain(raw: string): EndpointDomain | null {
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/^\*\./, "")
    .replace(/\.$/, "");
  const [domain, port, extra] = value.split(":");
  if (extra !== undefined || !DOMAIN.test(domain)) return null;
  if (port === undefined) return { domain, port: null };
  const number = Number(port);
  return Number.isInteger(number) && number > 0 && number < 65536
    ? { domain, port: number }
    : null;
}

export function createEndpointRoutes() {
  const open = new Map<
    string,
    { route: RouteRecord; opened: number; used: number }
  >();
  let nextId = -1;

  function sweep(now: number) {
    for (const [host, entry] of open) {
      if (now - entry.used >= IDLE_MS || now - entry.opened >= MAX_LIFE_MS) {
        open.delete(host);
      }
    }
  }

  return {
    create(
      input: {
        userId: string;
        hostId: number;
        target: EndpointTarget;
        domain: string;
      },
      now = Date.now(),
    ): RouteRecord {
      sweep(now);
      if (open.size >= MAX_OPEN) {
        const oldest = open.keys().next().value;
        if (oldest) open.delete(oldest);
      }
      const name = `${randomBytes(12).toString("hex")}.${input.domain}`;
      const route: RouteRecord = {
        id: nextId--,
        hostId: input.hostId,
        userId: input.userId,
        name,
        kind: "http",
        domain: name,
        listenPort: null,
        targetHost: input.target.host,
        targetPort: input.target.port,
        tlsMode: "off",
        certId: null,
        authMode: "host",
        options: {
          targetScheme: input.target.scheme,
          insecureTarget: input.target.ignoreCert === true,
          idleSeconds: 3600,
        },
        enabled: true,
        createdAt: new Date(now).toISOString(),
      };
      open.set(name, { route, opened: now, used: now });
      return route;
    },

    /** The live route for a name, counting the visit as use. */
    find(host: string, now = Date.now()): RouteRecord | undefined {
      const entry = open.get(host);
      if (!entry) return undefined;
      if (now - entry.used >= IDLE_MS || now - entry.opened >= MAX_LIFE_MS) {
        open.delete(host);
        return undefined;
      }
      entry.used = now;
      return entry.route;
    },
  };
}

export type EndpointRoutes = ReturnType<typeof createEndpointRoutes>;

/** A short lived route's id: never a stored one. */
export function isEndpointRoute(route: Pick<RouteRecord, "id">): boolean {
  return route.id < 0;
}
