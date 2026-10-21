import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import {
  createMockCtx,
  createTestDb,
  type MockPluginContext,
  type TestDb,
} from "@termix-ssh/plugin-sdk/testing";
import { activate } from "../../src/backend/index.js";
import { manifest, pluginDir } from "./helpers";

let db: TestDb | null = null;
let mock: MockPluginContext | null = null;

afterEach(async () => {
  for (const dispose of [...(mock?.disposals ?? [])].reverse()) await dispose();
  mock = null;
  db?.close();
  db = null;
});

describe("reverse proxy activate", () => {
  it("mounts its routes and frees everything on disable", async () => {
    db = await createTestDb(pluginDir);
    mock = createMockCtx({
      pluginId: manifest.id,
      manifest,
      capabilities: manifest.capabilities,
      db: db.database,
      router: () => express.Router(),
    });
    await activate(mock.ctx);
    expect(mock.disposals.length).toBeGreaterThan(0);
  });

  it("fails closed without the serve capability", async () => {
    db = await createTestDb(pluginDir);
    mock = createMockCtx({
      pluginId: manifest.id,
      manifest,
      capabilities: manifest.capabilities.filter((c) => c !== "network:serve"),
      db: db.database,
      router: () => express.Router(),
    });
    await expect(activate(mock.ctx)).rejects.toThrow();
  });
});
