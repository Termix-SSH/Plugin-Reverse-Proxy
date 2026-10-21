import {
  boolean,
  defineTable,
  id,
  integer,
  refHost,
  refUser,
  text,
  timestamp,
  varchar,
} from "@termix-ssh/plugin-sdk/db";

// Stored as p_reverse_proxy_routes.
export const routes = defineTable(
  "routes",
  {
    id: id(),
    uid: varchar(36).notNull().unique(),
    hostId: refHost(),
    userId: refUser(),
    name: varchar(120).notNull(),
    kind: varchar(8).notNull(),
    domain: varchar(255).notNull().default(""),
    listenPort: integer(),
    targetHost: varchar(255).notNull().default(""),
    targetPort: integer().notNull(),
    tlsMode: varchar(16).notNull().default("off"),
    certId: integer(),
    authMode: varchar(8).notNull().default("none"),
    options: text(),
    enabled: boolean().notNull().default(true),
    createdAt: timestamp().notNull().defaultNow(),
  },
  {
    indexes: [
      { name: "idx_p_reverse_proxy_routes_host_id", columns: ["hostId"] },
      { name: "idx_p_reverse_proxy_routes_domain", columns: ["domain"] },
    ],
  },
);

export const certs = defineTable("certs", {
  id: id(),
  uid: varchar(36).notNull().unique(),
  userId: refUser(),
  domains: text().notNull(),
  source: varchar(12).notNull(),
  status: varchar(10).notNull().default("pending"),
  error: text(),
  certPem: text(),
  keySealed: text(),
  notAfter: timestamp(),
  createdAt: timestamp().notNull().defaultNow(),
});

// termix-plugin migrations reads this list.
export const tables = [routes, certs];
