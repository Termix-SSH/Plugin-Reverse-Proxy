import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuth, readCookie, stripCookie } from "../../src/backend/auth.js";
import { createRig, type Rig } from "./helpers";

let rig: Rig | null = null;

afterEach(async () => {
  vi.useRealTimers();
  await rig?.close();
  rig = null;
});

const route = { id: 3, domain: "app.test" };

describe("auth tokens", () => {
  it("verifies what it minted, for the same route only", async () => {
    rig = await createRig();
    const token = rig.auth.mint("token", route, 12);
    expect(rig.auth.verify(token, "token", route)).toBe(true);
    expect(rig.auth.verify(token, "cookie", route)).toBe(false);
    expect(rig.auth.verify(token, "token", { id: 4, domain: "app.test" })).toBe(
      false,
    );
    expect(
      rig.auth.verify(token, "token", { id: 3, domain: "other.test" }),
    ).toBe(false);
  });

  it("rejects a tampered or expired value", async () => {
    rig = await createRig();
    const token = rig.auth.mint("token", route, 12);
    expect(rig.auth.verify(token + "x", "token", route)).toBe(false);
    expect(rig.auth.verify(undefined, "token", route)).toBe(false);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 120_000);
    expect(rig.auth.verify(token, "token", route)).toBe(false);
  });

  it("keeps the same key after a restart", async () => {
    rig = await createRig();
    const token = rig.auth.mint("cookie", route, 1);
    const again = createAuth(rig.mock.ctx);
    await again.ready();
    expect(again.verify(token, "cookie", route)).toBe(true);
  });
});

describe("cookie helpers", () => {
  it("reads and strips one cookie", () => {
    const header = "a=1; rp_auth=abc; b=2";
    expect(readCookie(header, "rp_auth")).toBe("abc");
    expect(stripCookie(header, "rp_auth")).toBe("a=1; b=2");
    expect(stripCookie("rp_auth=abc", "rp_auth")).toBeUndefined();
  });
});
