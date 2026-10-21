export type RouteKind = "http" | "tcp" | "udp";
export type TlsMode = "off" | "acme" | "selfsigned" | "custom";
export type AuthMode = "none" | "user" | "host";

export interface RouteOptions {
  /** Redirect plain HTTP to HTTPS. On by default when TLS is on. */
  forceHttps?: boolean;
  /** Port visitors use for HTTPS when it is not 443. */
  httpsPublicPort?: number;
  preserveHost?: boolean;
  /** Extra request headers sent to the target. */
  headers?: Record<string, string>;
  /** Exact IPs or CIDR ranges. Empty means everyone. */
  allowIps?: string[];
  denyIps?: string[];
  targetScheme?: "http" | "https";
  /** Accept a self-signed certificate on the target. */
  insecureTarget?: boolean;
  /** UDP and TCP idle timeout in seconds. */
  idleSeconds?: number;
}

export interface RouteInput {
  name: string;
  kind: RouteKind;
  domain: string;
  listenPort: number | null;
  targetHost: string;
  targetPort: number;
  tlsMode: TlsMode;
  certId: number | null;
  authMode: AuthMode;
  options: RouteOptions;
  enabled: boolean;
}

export interface RouteRecord extends RouteInput {
  id: number;
  hostId: number;
  userId: string;
  createdAt: string;
}

export interface RouteRuntime {
  state: "running" | "stopped" | "error";
  error?: string;
  listening?: string;
  connections?: number;
  bytesIn?: number;
  bytesOut?: number;
}

export type CertSource = "acme" | "selfsigned" | "custom";

export interface CertRecord {
  id: number;
  domains: string[];
  source: CertSource;
  status: "pending" | "ready" | "error";
  error: string | null;
  notAfter: string | null;
  createdAt: string;
}

export const DEFAULT_HTTP_PORT = 8081;
export const DEFAULT_HTTPS_PORT = 8444;
