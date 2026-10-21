import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { certs as certsTable, routes as routesTable } from "./tables.js";
import { createRepository } from "./repository.js";
import { readSettings } from "./settings.js";
import { createAuth } from "./auth.js";
import { createCertManager } from "./certs.js";
import { createProxyManager } from "./manager.js";
import { registerRoutes } from "./routes.js";

const RENEW_CHECK_MS = 12 * 60 * 60 * 1000;

export async function activate(ctx: PluginContext) {
  const routes = await ctx.db.define(routesTable);
  const certTable = await ctx.db.define(certsTable);
  const repo = createRepository(ctx.db, routes, certTable);
  const getSettings = () => readSettings(ctx);

  const auth = createAuth(ctx);
  await auth.ready();
  const certs = createCertManager(ctx, repo, getSettings);
  const manager = createProxyManager(ctx, { repo, certs, auth, getSettings });
  certs.setOnIssued(() => void manager.reload());
  ctx.disposables.add(() => manager.dispose());

  registerRoutes(ctx.http.router<Router>({ public: ["/gate"] }), ctx, {
    repo,
    certs,
    auth,
    manager,
    getSettings,
  });

  for (const key of ["httpPort", "httpsPort", "bindHost", "publicBaseUrl"]) {
    ctx.settings.onChange(key, () => void manager.reload());
  }

  // Deferred so activation is not held up by binding ports.
  const start = ctx.schedule.after(2000, async () => {
    await manager.reload();
    await certs.renewDue();
  });
  ctx.disposables.add(start);
  ctx.disposables.add(
    ctx.schedule.every(
      RENEW_CHECK_MS,
      async () => {
        await certs.renewDue();
        await manager.reload();
      },
      { jitterMs: 60_000 },
    ),
  );

  ctx.log.info("Reverse proxy routes mounted at /plugin-api/reverse-proxy");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
