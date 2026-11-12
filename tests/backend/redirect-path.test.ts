import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "../../src/backend/http-proxy.js";

describe("safeRedirectPath after sign in", () => {
  it.each([
    ["/", "/"],
    ["/app/page?x=1#top", "/app/page?x=1#top"],
    ["/a/../b", "/b"],
  ])("keeps the same site path %j", (to, expected) => {
    expect(safeRedirectPath(to)).toBe(expected);
  });

  it.each([
    "/\\evil.example",
    "/\\/evil.example",
    "//evil.example",
    "https://evil.example/",
    "/\tevil",
    "/\n/evil.example",
    "evil",
    "",
    null,
    undefined,
  ])("sends %j to the root instead", (to) => {
    expect(safeRedirectPath(to)).toBe("/");
  });

  it("is what the sign in handler uses", () => {
    const source = fs.readFileSync(
      new URL("../../src/backend/http-proxy.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('safeRedirectPath(url.searchParams.get("to"))');
  });
});
