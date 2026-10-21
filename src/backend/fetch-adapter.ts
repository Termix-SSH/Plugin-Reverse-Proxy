import type { PluginFetch } from "@termix-ssh/plugin-sdk/backend";

export type AxiosLikeConfig = {
  url?: string;
  method?: string;
  headers?: unknown;
  data?: unknown;
  timeout?: number;
  validateStatus?: ((status: number) => boolean) | null;
};

function plainHeaders(headers: unknown): Record<string, string> {
  const source =
    headers && typeof (headers as { toJSON?: unknown }).toJSON === "function"
      ? (headers as { toJSON: () => Record<string, unknown> }).toJSON()
      : ((headers ?? {}) as Record<string, unknown>);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" || typeof value === "number") {
      out[key] = String(value);
    }
  }
  return out;
}

/**
 * An axios adapter over ctx.fetch. It settles the way axios' own adapters do,
 * because acme-client's retry interceptor relies on a rejected error that
 * carries the response.
 */
export function createFetchAdapter(
  fetch: PluginFetch,
  allowPrivateHosts: readonly string[] = [],
) {
  return async (config: AxiosLikeConfig) => {
    const method = (config.method ?? "get").toUpperCase();
    const response = await fetch(String(config.url), {
      method,
      headers: plainHeaders(config.headers),
      body:
        config.data == null
          ? undefined
          : typeof config.data === "string"
            ? config.data
            : JSON.stringify(config.data),
      timeoutMs: config.timeout || 30_000,
      allowPrivateHosts,
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const result = {
      data: method === "HEAD" ? "" : await response.text(),
      status: response.status,
      statusText: response.statusText,
      headers,
      config,
      request: {},
    };
    const validate = config.validateStatus;
    if (!result.status || !validate || validate(result.status)) return result;
    throw Object.assign(
      new Error(`Request failed with status code ${result.status}`),
      {
        isAxiosError: true,
        code: result.status >= 500 ? "ERR_BAD_RESPONSE" : "ERR_BAD_REQUEST",
        config,
        response: result,
      },
    );
  };
}
