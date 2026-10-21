import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PluginDatabase } from "@termix-ssh/plugin-sdk/backend";
import type {
  CertRecord,
  CertSource,
  RouteInput,
  RouteOptions,
  RouteRecord,
} from "../shared/types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Table = any;

export interface CertRow extends CertRecord {
  userId: string;
  certPem: string | null;
  keySealed: string | null;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  // Stored as "YYYY-MM-DD HH:MM:SS" in UTC.
  if (typeof value === "string" && /^d{4}-dd-dd dd:dd:dd$/.test(value)) {
    return `${value.replace(" ", "T")}Z`;
  }
  return String(value ?? "");
}

function parseOptions(raw: unknown): RouteOptions {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toRoute(row: any): RouteRecord {
  return {
    id: row.id,
    hostId: row.hostId,
    userId: row.userId,
    name: row.name,
    kind: row.kind,
    domain: row.domain ?? "",
    listenPort: row.listenPort ?? null,
    targetHost: row.targetHost ?? "",
    targetPort: row.targetPort,
    tlsMode: row.tlsMode,
    certId: row.certId ?? null,
    authMode: row.authMode,
    options: parseOptions(row.options),
    enabled: Boolean(row.enabled),
    createdAt: iso(row.createdAt),
  };
}

function toCert(row: any): CertRow {
  let domains: string[] = [];
  try {
    domains = JSON.parse(row.domains);
  } catch {
    domains = [];
  }
  return {
    id: row.id,
    userId: row.userId,
    domains,
    source: row.source,
    status: row.status,
    error: row.error ?? null,
    certPem: row.certPem ?? null,
    keySealed: row.keySealed ?? null,
    notAfter: row.notAfter ? iso(row.notAfter) : null,
    createdAt: iso(row.createdAt),
  };
}

function routeValues(input: RouteInput) {
  return {
    name: input.name,
    kind: input.kind,
    domain: input.domain,
    listenPort: input.listenPort,
    targetHost: input.targetHost,
    targetPort: input.targetPort,
    tlsMode: input.tlsMode,
    certId: input.certId,
    authMode: input.authMode,
    options: JSON.stringify(input.options ?? {}),
    enabled: input.enabled,
  };
}

export function createRepository(
  db: PluginDatabase,
  routes: Table,
  certs: Table,
) {
  const client = () => db.client<any>();

  return {
    async listRoutes(): Promise<RouteRecord[]> {
      const rows = await (await client()).select().from(routes);
      return rows.map(toRoute);
    },

    async routesForHost(hostId: number): Promise<RouteRecord[]> {
      const rows = await (
        await client()
      )
        .select()
        .from(routes)
        .where(eq(routes.hostId, hostId));
      return rows.map(toRoute);
    },

    async getRoute(id: number): Promise<RouteRecord | null> {
      const rows = await (
        await client()
      )
        .select()
        .from(routes)
        .where(eq(routes.id, id))
        .limit(1);
      return rows[0] ? toRoute(rows[0]) : null;
    },

    async createRoute(
      hostId: number,
      userId: string,
      input: RouteInput,
    ): Promise<RouteRecord> {
      const uid = randomUUID();
      const drizzle = await client();
      await drizzle
        .insert(routes)
        .values({ uid, hostId, userId, ...routeValues(input) });
      await db.persist();
      const rows = await drizzle
        .select()
        .from(routes)
        .where(eq(routes.uid, uid))
        .limit(1);
      return toRoute(rows[0]);
    },

    async updateRoute(id: number, input: RouteInput): Promise<void> {
      await (
        await client()
      )
        .update(routes)
        .set(routeValues(input))
        .where(eq(routes.id, id));
      await db.persist();
    },

    async deleteRoute(id: number): Promise<void> {
      await (await client()).delete(routes).where(eq(routes.id, id));
      await db.persist();
    },

    async listCerts(): Promise<CertRow[]> {
      const rows = await (await client()).select().from(certs);
      return rows.map(toCert);
    },

    async getCert(id: number): Promise<CertRow | null> {
      const rows = await (
        await client()
      )
        .select()
        .from(certs)
        .where(eq(certs.id, id))
        .limit(1);
      return rows[0] ? toCert(rows[0]) : null;
    },

    async createCert(
      userId: string,
      domains: string[],
      source: CertSource,
    ): Promise<CertRow> {
      const uid = randomUUID();
      const drizzle = await client();
      await drizzle.insert(certs).values({
        uid,
        userId,
        domains: JSON.stringify(domains),
        source,
        status: "pending",
      });
      await db.persist();
      const rows = await drizzle
        .select()
        .from(certs)
        .where(eq(certs.uid, uid))
        .limit(1);
      return toCert(rows[0]);
    },

    async saveCertMaterial(
      id: number,
      values: {
        status: "pending" | "ready" | "error";
        error?: string | null;
        certPem?: string;
        keySealed?: string;
        notAfter?: Date | null;
        domains?: string[];
      },
    ): Promise<void> {
      const set: Record<string, unknown> = {
        status: values.status,
        error: values.error ?? null,
      };
      if (values.certPem !== undefined) set.certPem = values.certPem;
      if (values.keySealed !== undefined) set.keySealed = values.keySealed;
      if (values.notAfter !== undefined) {
        set.notAfter = values.notAfter
          ? values.notAfter.toISOString().slice(0, 19).replace("T", " ")
          : null;
      }
      if (values.domains) set.domains = JSON.stringify(values.domains);
      await (await client()).update(certs).set(set).where(eq(certs.id, id));
      await db.persist();
    },

    async deleteCert(id: number): Promise<void> {
      await (await client()).delete(certs).where(eq(certs.id, id));
      await db.persist();
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
