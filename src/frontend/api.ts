import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  CertRecord,
  RouteInput,
  RouteRecord,
  RouteRuntime,
} from "../shared/types";

export type RouteView = RouteRecord & {
  runtime: RouteRuntime;
  hostName?: string;
};

export interface HostInfo {
  id: number;
  name: string;
  address: string;
  enabled: boolean;
  defaultAccess: "none" | "user" | "host";
  targetAddress: string;
}

export interface ProxyState {
  routes: RouteView[];
  hosts: HostInfo[];
  certs: CertRecord[];
  ports: {
    http: number;
    https: number;
    bindHost: string;
    running: { http?: number; https?: number };
  };
  needsBaseUrl: boolean;
  needsEmail: boolean;
}

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Reverse proxy is not ready");
  return client;
}

/** The server's message for a failed call, or the fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: unknown } } })
    ?.response?.data?.error;
  return typeof message === "string" && message ? message : fallback;
}

export async function getState(): Promise<ProxyState> {
  return (await api().get<ProxyState>("/state")).data;
}

export async function saveRoute(
  hostId: number,
  routeId: number | null,
  input: RouteInput,
): Promise<void> {
  if (routeId) await api().put(`/routes/${routeId}`, input);
  else await api().post("/routes", { ...input, hostId });
}

export async function setRouteEnabled(
  routeId: number,
  enabled: boolean,
): Promise<void> {
  await api().patch(`/routes/${routeId}/enabled`, { enabled });
}

export async function removeRoute(routeId: number): Promise<void> {
  await api().delete(`/routes/${routeId}`);
}

export async function makeSelfSigned(domains: string[]): Promise<void> {
  await api().post("/certs/selfsigned", { domains });
}

export async function uploadCert(cert: string, key: string): Promise<void> {
  await api().post("/certs/upload", { cert, key });
}

export async function renewCert(id: number): Promise<void> {
  await api().post(`/certs/${id}/renew`);
}

export async function removeCert(id: number): Promise<void> {
  await api().delete(`/certs/${id}`);
}
