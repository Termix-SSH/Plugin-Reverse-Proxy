import { describe, expect, it } from "vitest";
import { ipAllowed } from "../../src/backend/http-proxy.js";
import { InputError, parseInput } from "../../src/backend/routes.js";
import type { ProxySettings } from "../../src/backend/settings.js";
import type { RouteRecord } from "../../src/shared/types.js";

const settings: ProxySettings = {
  httpPort: 8081,
  httpsPort: 8444,
  bindHost: "0.0.0.0",
  publicBaseUrl: "",
  acmeEmail: "",
  acmeStaging: false,
  acmeDirectoryUrl: "",
  cookieHours: 12,
};

describe("parseInput", () => {
  it("accepts a web route and lowercases the domain", () => {
    const input = parseInput(
      {
        name: "Wiki",
        kind: "http",
        domain: "Wiki.Example.com",
        targetPort: 3000,
        tlsMode: "acme",
      },
      settings,
    );
    expect(input.domain).toBe("wiki.example.com");
    expect(input.tlsMode).toBe("acme");
    expect(input.listenPort).toBeNull();
  });

  it("rejects a bad domain, port and header", () => {
    const base = {
      name: "x",
      kind: "http",
      domain: "a.example.com",
      targetPort: 80,
      tlsMode: "off",
    };
    expect(() =>
      parseInput({ ...base, domain: "not a domain" }, settings),
    ).toThrow(InputError);
    expect(() => parseInput({ ...base, targetPort: 70000 }, settings)).toThrow(
      InputError,
    );
    expect(() =>
      parseInput(
        { ...base, options: { headers: { "bad name": "x" } } },
        settings,
      ),
    ).toThrow(InputError);
    expect(() =>
      parseInput(
        { ...base, options: { headers: { "X-A": "a\r\nb" } } },
        settings,
      ),
    ).toThrow(InputError);
  });

  it("refuses reserved and plugin ports for stream routes", () => {
    const base = { name: "x", kind: "tcp", targetPort: 22 };
    expect(() => parseInput({ ...base, listenPort: 30001 }, settings)).toThrow(
      InputError,
    );
    expect(() => parseInput({ ...base, listenPort: 8081 }, settings)).toThrow(
      InputError,
    );
    expect(parseInput({ ...base, listenPort: 2222 }, settings).listenPort).toBe(
      2222,
    );
  });

  it("validates ip lists", () => {
    const base = { name: "x", kind: "tcp", targetPort: 22, listenPort: 2222 };
    expect(() =>
      parseInput({ ...base, options: { allowIps: ["nope"] } }, settings),
    ).toThrow(InputError);
    const ok = parseInput(
      { ...base, options: { allowIps: ["10.0.0.0/8"] } },
      settings,
    );
    expect(ok.options.allowIps).toEqual(["10.0.0.0/8"]);
  });
});

describe("ipAllowed", () => {
  const route = (allowIps?: string[], denyIps?: string[]) =>
    ({ options: { allowIps, denyIps } }) as unknown as RouteRecord;

  it("allows everyone without lists", () => {
    expect(ipAllowed(route(), "8.8.8.8")).toBe(true);
  });

  it("limits to the allow list", () => {
    expect(ipAllowed(route(["10.0.0.0/8"]), "10.1.2.3")).toBe(true);
    expect(ipAllowed(route(["10.0.0.0/8"]), "11.0.0.1")).toBe(false);
  });

  it("deny wins over allow", () => {
    expect(ipAllowed(route(["10.0.0.0/8"], ["10.1.2.3"]), "10.1.2.3")).toBe(
      false,
    );
  });
});
