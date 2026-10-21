import { X509Certificate, createPrivateKey } from "node:crypto";
import { createSecureContext, type SecureContext } from "node:tls";
import * as acme from "acme-client";
import selfsigned from "selfsigned";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { createFetchAdapter } from "./fetch-adapter.js";
import type { Repository, CertRow } from "./repository.js";
import type { ProxySettings } from "./settings.js";

const ACCOUNT_KEY = "acme-account";
const RENEW_BEFORE_MS = 30 * 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 6 * 60 * 60 * 1000;
const STAGING = "https://acme-staging-v02.api.letsencrypt.org/directory";
const PRODUCTION = "https://acme-v02.api.letsencrypt.org/directory";

interface StoredAccount {
  directoryUrl: string;
  sealedKey: string;
  url: string | null;
}

/** Renew in the last 30 days, or the last third for short lived certificates. */
export function renewalDue(certPem: string | null, now = Date.now()): boolean {
  if (!certPem) return true;
  try {
    const x509 = new X509Certificate(certPem);
    const from = new Date(x509.validFrom).getTime();
    const to = new Date(x509.validTo).getTime();
    const window = Math.min(RENEW_BEFORE_MS, (to - from) / 3);
    return to - now < window;
  } catch {
    return true;
  }
}

export function domainCovers(pattern: string, host: string): boolean {
  const p = pattern.toLowerCase();
  const h = host.toLowerCase();
  if (p === h) return true;
  if (p.startsWith("*.")) {
    return h.split(".").slice(1).join(".") === p.slice(2);
  }
  return false;
}

export function createCertManager(
  ctx: PluginContext,
  repo: Repository,
  getSettings: () => Promise<ProxySettings>,
) {
  // HTTP-01 answers, served by the HTTP listener.
  const challenges = new Map<string, string>();
  const contexts = new Map<number, SecureContext>();
  const lastFailure = new Map<number, number>();
  let issuing: Promise<void> = Promise.resolve();
  let onIssued: () => void = () => {};

  async function loadAccount(directoryUrl: string) {
    const stored = (await ctx.kv.get(ACCOUNT_KEY)) as StoredAccount | null;
    if (stored && stored.directoryUrl === directoryUrl) {
      const key = await ctx.secrets.unseal(stored.sealedKey);
      if (key) return { key, url: stored.url };
    }
    const key = (await acme.crypto.createPrivateKey()).toString();
    await ctx.kv.set(ACCOUNT_KEY, {
      directoryUrl,
      sealedKey: await ctx.secrets.seal(key),
      url: null,
    } satisfies StoredAccount);
    return { key, url: null };
  }

  async function saveAccountUrl(directoryUrl: string, url: string) {
    const stored = (await ctx.kv.get(ACCOUNT_KEY)) as StoredAccount | null;
    if (!stored || stored.directoryUrl !== directoryUrl || stored.url === url) {
      return;
    }
    await ctx.kv.set(ACCOUNT_KEY, { ...stored, url });
  }

  async function runAcme(cert: CertRow) {
    const settings = await getSettings();
    if (!settings.acmeEmail) {
      throw new Error("Set the certificate email in the plugin settings first");
    }
    // A custom CA on a private network is allowed to be reached.
    let privateHosts: string[] = [];
    if (settings.acmeDirectoryUrl) {
      try {
        privateHosts = [new URL(settings.acmeDirectoryUrl).hostname];
      } catch {
        throw new Error("The certificate authority address is not a valid URL");
      }
    }
    const directoryUrl =
      settings.acmeDirectoryUrl ||
      (settings.acmeStaging ? STAGING : PRODUCTION);
    acme.axios.defaults.adapter = createFetchAdapter(
      ctx.fetch,
      privateHosts,
    ) as never;
    const account = await loadAccount(directoryUrl);
    const client = new acme.Client({
      directoryUrl,
      accountKey: account.key,
      ...(account.url ? { accountUrl: account.url } : {}),
    });
    const [key, csr] = await acme.crypto.createCsr({
      commonName: cert.domains[0],
      altNames: cert.domains,
    });
    const pem = await client.auto({
      csr,
      email: settings.acmeEmail,
      termsOfServiceAgreed: true,
      skipChallengeVerification: true,
      challengePriority: ["http-01"],
      challengeCreateFn: async (_authz, challenge, keyAuthorization) => {
        if (challenge.type !== "http-01") {
          throw new Error(`Unsupported challenge ${challenge.type}`);
        }
        challenges.set(challenge.token, keyAuthorization);
      },
      challengeRemoveFn: async (_authz, challenge) => {
        challenges.delete(challenge.token);
      },
    });
    await saveAccountUrl(directoryUrl, client.getAccountUrl());
    return { certPem: pem, keyPem: key.toString() };
  }

  async function store(certId: number, certPem: string, keyPem: string) {
    const x509 = new X509Certificate(certPem);
    await repo.saveCertMaterial(certId, {
      status: "ready",
      error: null,
      certPem,
      keySealed: await ctx.secrets.seal(keyPem),
      notAfter: new Date(x509.validTo),
    });
    contexts.delete(certId);
  }

  async function issue(certId: number, force: boolean): Promise<void> {
    const cert = await repo.getCert(certId);
    if (!cert || cert.source !== "acme") return;
    if (!force && cert.status === "ready") return;
    try {
      const { certPem, keyPem } = await runAcme(cert);
      await store(cert.id, certPem, keyPem);
      lastFailure.delete(cert.id);
      onIssued();
      ctx.log.info(`Issued certificate for ${cert.domains.join(", ")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastFailure.set(cert.id, Date.now());
      // Keep serving the old certificate when a renewal fails.
      await repo.saveCertMaterial(cert.id, {
        status: cert.certPem ? "ready" : "error",
        error: message,
      });
      await ctx.notify
        .send({
          title: `Certificate failed for ${cert.domains[0]}`,
          body: message,
          severity: "critical",
          category: "reverse-proxy.cert_failed",
          audience: "admins",
          dedupeKey: `reverse-proxy.cert_failed:${cert.id}`,
        })
        .catch(() => {});
    }
  }

  // One order at a time, so two routes do not race the same account.
  function queueIssue(certId: number, force = false): Promise<void> {
    issuing = issuing.then(() => issue(certId, force)).catch(() => {});
    return issuing;
  }

  async function createSelfSigned(userId: string, domains: string[]) {
    const cert = await repo.createCert(userId, domains, "selfsigned");
    const pems = selfsigned.generate(
      [{ name: "commonName", value: domains[0] }],
      {
        days: 825,
        keySize: 2048,
        algorithm: "sha256",
        extensions: [
          {
            name: "subjectAltName",
            altNames: domains.map((value) => ({ type: 2, value })),
          },
        ],
      },
    );
    await store(cert.id, pems.cert, pems.private);
    return (await repo.getCert(cert.id))!;
  }

  async function createCustom(userId: string, certPem: string, keyPem: string) {
    let x509: X509Certificate;
    try {
      x509 = new X509Certificate(certPem);
      if (!x509.checkPrivateKey(createPrivateKey(keyPem))) {
        throw new Error("mismatch");
      }
    } catch {
      throw new Error("The certificate and private key do not match");
    }
    const names = (x509.subjectAltName ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.startsWith("DNS:"))
      .map((part) => part.slice(4));
    const cn = /CN=([^\n,]+)/.exec(x509.subject)?.[1];
    const domains = names.length ? names : cn ? [cn] : [];
    if (!domains.length) throw new Error("The certificate has no domain name");
    const cert = await repo.createCert(userId, domains, "custom");
    await store(cert.id, certPem, keyPem);
    return (await repo.getCert(cert.id))!;
  }

  /** The cert that already serves a domain, or a new one. */
  async function ensureFor(
    userId: string,
    domain: string,
    mode: "acme" | "selfsigned",
  ): Promise<number> {
    const existing = (await repo.listCerts()).find(
      (c) =>
        c.source === mode && c.domains.some((d) => domainCovers(d, domain)),
    );
    if (existing) return existing.id;
    if (mode === "selfsigned") {
      return (await createSelfSigned(userId, [domain])).id;
    }
    return (await repo.createCert(userId, [domain], "acme")).id;
  }

  async function secureContext(certId: number): Promise<SecureContext | null> {
    const cached = contexts.get(certId);
    if (cached) return cached;
    const cert = await repo.getCert(certId);
    if (!cert?.certPem || !cert.keySealed) return null;
    const key = await ctx.secrets.unseal(cert.keySealed);
    if (!key) return null;
    const secure = createSecureContext({ cert: cert.certPem, key });
    contexts.set(certId, secure);
    return secure;
  }

  async function renewDue(): Promise<void> {
    for (const cert of await repo.listCerts()) {
      if (cert.source !== "acme") continue;
      const failedAt = lastFailure.get(cert.id) ?? 0;
      if (Date.now() - failedAt < RETRY_AFTER_MS) continue;
      const due =
        cert.status === "pending" ||
        cert.status === "error" ||
        renewalDue(cert.certPem);
      if (due) void queueIssue(cert.id, true);
    }
  }

  return {
    challenge: (token: string) => challenges.get(token),
    queueIssue,
    createSelfSigned,
    createCustom,
    ensureFor,
    secureContext,
    renewDue,
    forget: (certId: number) => contexts.delete(certId),
    setOnIssued: (fn: () => void) => {
      onIssued = fn;
    },
  };
}

export type CertManager = ReturnType<typeof createCertManager>;
