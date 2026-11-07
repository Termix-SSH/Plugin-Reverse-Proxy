import { describe, expect, it } from "vitest";
import {
  createEndpointRoutes,
  isEndpointRoute,
  parseEndpointDomain,
} from "../../src/backend/endpoints.js";

const input = {
  userId: "u1",
  hostId: 7,
  domain: "apps.example.com",
  target: { host: "127.0.0.1", port: 5000, scheme: "http" as const },
};

describe("parseEndpointDomain", () => {
  it("takes a wildcard or a plain domain, with an optional port", () => {
    expect(parseEndpointDomain("*.Apps.Example.com")).toEqual({
      domain: "apps.example.com",
      port: null,
    });
    expect(parseEndpointDomain("apps.example.com:8443")).toEqual({
      domain: "apps.example.com",
      port: 8443,
    });
  });

  it("refuses anything that is not a domain", () => {
    for (const value of [
      "",
      "localhost",
      "https://apps.example.com",
      "apps.example.com:0",
      "apps.example.com:1:2",
      "a b.example.com",
    ]) {
      expect(parseEndpointDomain(value)).toBeNull();
    }
  });
});

describe("endpoint routes", () => {
  it("makes a protected route with its own name and no stored id", () => {
    const routes = createEndpointRoutes();
    const first = routes.create(input);
    const second = routes.create(input);

    expect(first.domain).toMatch(/^[0-9a-f]{24}\.apps\.example\.com$/);
    expect(first.domain).not.toBe(second.domain);
    expect(first.id).not.toBe(second.id);
    expect(isEndpointRoute(first)).toBe(true);
    expect(first.authMode).toBe("host");
    expect(first.options.targetScheme).toBe("http");
    expect(routes.find(first.domain)).toBe(first);
    expect(routes.find("other.apps.example.com")).toBeUndefined();
  });

  it("carries the certificate choice to the target", () => {
    const route = createEndpointRoutes().create({
      ...input,
      target: { ...input.target, scheme: "https", ignoreCert: true },
    });
    expect(route.options).toMatchObject({
      targetScheme: "https",
      insecureTarget: true,
    });
  });

  it("ends a route after ten idle minutes, and use keeps it alive", () => {
    const routes = createEndpointRoutes();
    const route = routes.create(input, 0);
    expect(routes.find(route.domain, 9 * 60_000)).toBe(route);
    expect(routes.find(route.domain, 18 * 60_000)).toBe(route);
    expect(routes.find(route.domain, 29 * 60_000)).toBeUndefined();
  });

  it("ends a route after twelve hours even in use", () => {
    const routes = createEndpointRoutes();
    const route = routes.create(input, 0);
    for (let minute = 5; minute < 720; minute += 5) {
      expect(routes.find(route.domain, minute * 60_000)).toBe(route);
    }
    expect(routes.find(route.domain, 720 * 60_000)).toBeUndefined();
  });

  it("drops the oldest when too many are open", () => {
    const routes = createEndpointRoutes();
    const first = routes.create(input, 0);
    for (let i = 0; i < 200; i += 1) routes.create(input, 1);
    expect(routes.find(first.domain, 2)).toBeUndefined();
  });
});
