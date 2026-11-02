import { describe, expect, it } from "vitest";
import { rewriteLocation } from "../../src/backend/http-proxy.js";

const target = { host: "100.81.240.42", port: 2320 };
const pub = "https://radarr.example.com";

describe("rewriteLocation", () => {
  it("points a redirect at the target back at the public address", () => {
    expect(
      rewriteLocation(
        "http://100.81.240.42:2320/login?returnUrl=%2F#top",
        target,
        pub,
      ),
    ).toBe("https://radarr.example.com/login?returnUrl=%2F#top");
  });

  it("moves a plain http redirect to the public name onto https", () => {
    expect(
      rewriteLocation("http://radarr.example.com/login", target, pub),
    ).toBe("https://radarr.example.com/login");
  });

  it("matches the default port when the target uses it", () => {
    expect(
      rewriteLocation(
        "http://10.0.0.5/web/",
        { host: "10.0.0.5", port: 80 },
        pub,
      ),
    ).toBe("https://radarr.example.com/web/");
  });

  it("matches an IPv6 target", () => {
    expect(
      rewriteLocation("http://[::1]:8080/a", { host: "::1", port: 8080 }, pub),
    ).toBe("https://radarr.example.com/a");
  });

  it("leaves relative and outside redirects alone", () => {
    expect(rewriteLocation("/login", target, pub)).toBe("/login");
    expect(rewriteLocation("https://accounts.example.org/x", target, pub)).toBe(
      "https://accounts.example.org/x",
    );
    expect(rewriteLocation("http://100.81.240.42:9999/x", target, pub)).toBe(
      "http://100.81.240.42:9999/x",
    );
  });

  it("never moves an https redirect down to http", () => {
    expect(
      rewriteLocation(
        "https://radarr.example.com/a",
        target,
        "http://radarr.example.com",
      ),
    ).toBe("https://radarr.example.com/a");
  });
});
