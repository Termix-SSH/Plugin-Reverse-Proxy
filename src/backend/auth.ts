import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

const KEY_NAME = "auth-key";
export const COOKIE_NAME = "rp_auth";
export const AUTH_PATH = "/__rp/auth";
const TOKEN_SECONDS = 60;

export interface AuthPayload {
  /** "token" is the one time handoff, "cookie" is the session on the domain. */
  k: "token" | "cookie";
  /** Route id the visitor was cleared for. */
  r: number;
  /** Domain it is valid on. */
  d: string;
  /** Expiry, unix seconds. */
  e: number;
}

function b64(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export function createAuth(ctx: PluginContext) {
  let key: Buffer | null = null;

  async function getKey(): Promise<Buffer> {
    if (key) return key;
    const sealed = (await ctx.kv.get(KEY_NAME)) as string | null;
    const stored = sealed ? await ctx.secrets.unseal(sealed) : null;
    if (stored) {
      key = Buffer.from(stored, "base64");
      return key;
    }
    key = randomBytes(32);
    await ctx.kv.set(KEY_NAME, await ctx.secrets.seal(key.toString("base64")));
    return key;
  }

  // Loaded once up front so request handling can stay synchronous.
  async function ready(): Promise<void> {
    await getKey();
  }

  function mac(body: string): string {
    return b64(createHmac("sha256", key!).update(body).digest());
  }

  function sign(payload: AuthPayload): string {
    const body = b64(Buffer.from(JSON.stringify(payload)));
    return `${body}.${mac(body)}`;
  }

  function verify(
    token: string | undefined,
    kind: AuthPayload["k"],
    route: { id: number; domain: string },
  ): boolean {
    if (!token || !key) return false;
    const [body, signature] = token.split(".");
    if (!body || !signature) return false;
    const expected = Buffer.from(mac(body));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      return false;
    }
    try {
      const payload = JSON.parse(
        Buffer.from(body, "base64url").toString(),
      ) as AuthPayload;
      return (
        payload.k === kind &&
        payload.r === route.id &&
        payload.d === route.domain &&
        payload.e > Date.now() / 1000
      );
    } catch {
      return false;
    }
  }

  function mint(
    kind: AuthPayload["k"],
    route: { id: number; domain: string },
    cookieHours: number,
  ): string {
    const seconds = kind === "token" ? TOKEN_SECONDS : cookieHours * 3600;
    return sign({
      k: kind,
      r: route.id,
      d: route.domain,
      e: Math.floor(Date.now() / 1000) + seconds,
    });
  }

  return { ready, mint, verify };
}

export type ProxyAuth = ReturnType<typeof createAuth>;

export function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name)
      return part.slice(index + 1).trim();
  }
  return undefined;
}

export function stripCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  const kept = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith(`${name}=`));
  return kept.length ? kept.join("; ") : undefined;
}
