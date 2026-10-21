import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import * as plugin from "../../src/frontend/index";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const manifest = manifestJson as unknown as PluginManifest;

let rendered: RenderedPluginApp | null = null;

afterEach(async () => {
  await rendered?.deactivate();
  rendered = null;
});

const state = {
  routes: [
    {
      id: 1,
      hostId: 1,
      hostName: "web",
      userId: "u",
      name: "Wiki",
      kind: "http",
      domain: "wiki.test",
      listenPort: null,
      targetHost: "",
      targetPort: 80,
      tlsMode: "acme",
      certId: 1,
      authMode: "user",
      options: {},
      enabled: true,
      createdAt: "",
      runtime: { state: "running", listening: "0.0.0.0:8081" },
    },
  ],
  hosts: [
    {
      id: 1,
      name: "web",
      address: "10.0.0.5",
      enabled: true,
      defaultAccess: "none",
      targetAddress: "",
    },
  ],
  certs: [
    {
      id: 1,
      domains: ["wiki.test"],
      source: "acme",
      status: "ready",
      error: null,
      notAfter: "2030-01-01T00:00:00.000Z",
      createdAt: "",
    },
  ],
  ports: {
    http: 8081,
    https: 8444,
    bindHost: "0.0.0.0",
    running: { http: 8081, https: 8444 },
  },
  needsBaseUrl: false,
  needsEmail: false,
};

describe(`${manifest.id} activate`, () => {
  it("registers the host tab", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales });
    expect(rendered.registered.tabs()).toEqual(["reverse-proxy"]);
  });

  it("lists routes with their host and status", async () => {
    rendered = await renderWithApp(plugin, {
      manifest,
      locales,
      api: { get: vi.fn(async () => ({ data: state })) } as never,
    });
    rendered.renderTab("reverse-proxy", {
      isVisible: true,
      host: { id: 1, name: "web" },
    });
    expect(await screen.findByText("Wiki")).toBeTruthy();
    expect(screen.getByText(/wiki\.test/)).toBeTruthy();
    expect(
      screen.getAllByText(locales.list.state.running).length,
    ).toBeGreaterThan(1);
    expect(
      screen.getByText(
        locales.tab.status
          .replace("{{running}}", "1")
          .replace("{{total}}", "1"),
      ),
    ).toBeTruthy();
    expect(screen.getByText(locales.list.protected)).toBeTruthy();
  });

  it("opens a route in the editor and goes back", async () => {
    rendered = await renderWithApp(plugin, {
      manifest,
      locales,
      api: { get: vi.fn(async () => ({ data: state })) } as never,
    });
    rendered.renderTab("reverse-proxy", {
      isVisible: true,
      host: { id: 1, name: "web" },
    });
    fireEvent.click(await screen.findByText("Wiki"));
    expect(await screen.findByText(locales.form.editTitle)).toBeTruthy();
    fireEvent.click(screen.getByText(locales.common.cancel));
    expect(await screen.findByText(locales.list.protected)).toBeTruthy();
  });

  it("shows an error when the state cannot load", async () => {
    rendered = await renderWithApp(plugin, {
      manifest,
      locales,
      api: {
        get: vi.fn(async () => {
          throw new Error("offline");
        }),
      } as never,
    });
    rendered.renderTab("reverse-proxy", {
      isVisible: true,
      host: { id: 1, name: "web" },
    });
    expect(await screen.findByText(locales.tab.error)).toBeTruthy();
  });
});
