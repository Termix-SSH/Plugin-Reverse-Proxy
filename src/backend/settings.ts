import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { DEFAULT_HTTPS_PORT, DEFAULT_HTTP_PORT } from "../shared/types.js";

export interface ProxySettings {
  httpPort: number;
  httpsPort: number;
  bindHost: string;
  publicBaseUrl: string;
  acmeEmail: string;
  acmeStaging: boolean;
  acmeDirectoryUrl: string;
  cookieHours: number;
}

function port(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
}

export async function readSettings(ctx: PluginContext): Promise<ProxySettings> {
  const get = <T>(key: string) => ctx.settings.get<T>(key);
  const hours = Number(await get<number>("cookieHours"));
  return {
    httpPort: port(await get("httpPort"), DEFAULT_HTTP_PORT),
    httpsPort: port(await get("httpsPort"), DEFAULT_HTTPS_PORT),
    bindHost: ((await get<string>("bindHost")) || "0.0.0.0").trim(),
    publicBaseUrl: ((await get<string>("publicBaseUrl")) || "")
      .trim()
      .replace(/\/+$/, ""),
    acmeEmail: ((await get<string>("acmeEmail")) || "").trim(),
    acmeStaging: (await get<boolean>("acmeStaging")) === true,
    acmeDirectoryUrl: ((await get<string>("acmeDirectoryUrl")) || "").trim(),
    cookieHours: Number.isFinite(hours) && hours > 0 ? hours : 12,
  };
}
