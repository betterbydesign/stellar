import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocalConfig } from "./local-config";

export const OPERATOR_COOKIE = "stellar_operator";
const SESSION_SECONDS = 8 * 60 * 60;

export type Operator = { id: string; expiresAt: number; csrfToken: string };

function equal(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function mac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function cookieValue(config: LocalConfig, id: string, expiresAt: number): string {
  const payload = `v1.${id}.${expiresAt}`;
  return `${payload}.${mac(config.runnerSecret, `operator:${config.operatorId}:${payload}`)}`;
}

function cookieFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === OPERATOR_COOKIE) return value.join("=");
  }
  return null;
}

export function readOperator(request: Request, config: LocalConfig): Operator | null {
  const cookie = cookieFromRequest(request);
  if (!cookie || cookie.length > 512) return null;
  const parts = cookie.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !/^[a-f0-9]{64}$/.test(parts[1]) ||
    !/^\d{10,13}$/.test(parts[2]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[3])) return null;
  const expiresAt = Number(parts[2]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() ||
    expiresAt > Date.now() + SESSION_SECONDS * 1000) return null;
  const payload = parts.slice(0, 3).join(".");
  if (!equal(parts[3], mac(config.runnerSecret, `operator:${config.operatorId}:${payload}`))) return null;
  return { id: config.operatorId, expiresAt, csrfToken: mac(config.runnerSecret, `csrf:${config.operatorId}:${payload}`) };
}

export function isAppRequest(request: Request, config: LocalConfig): boolean {
  // NextURL normalizes loopback IPs to localhost. Authorize the actual Host
  // header and browser Origin separately, while allowing only that normalized
  // representation (same protocol and port) in the framework's Request.url.
  const url = new URL(request.url);
  const normalizedOrigin = config.appOrigin.replace("127.0.0.1", "localhost");
  return request.headers.get("host") === config.appHost &&
    (url.origin === config.appOrigin || url.origin === normalizedOrigin);
}

export function isAllowedOrigin(request: Request, config: LocalConfig, required: boolean): boolean {
  const origin = request.headers.get("origin");
  if (required && origin !== config.appOrigin) return false;
  if (origin !== null && origin !== config.appOrigin) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === null || fetchSite === "same-origin" || fetchSite === "none";
}

export function hasValidCsrf(request: Request, operator: Operator): boolean {
  const supplied = request.headers.get("x-stellar-csrf");
  return supplied !== null && equal(supplied, operator.csrfToken);
}

export async function bootstrapOperator(nonce: string, config: LocalConfig): Promise<{ cookie: string; operator: Operator } | null> {
  if (nonce.length > 512 || !equal(nonce, config.bootstrapNonce)) return null;
  // An atomic create survives Next module reloads and concurrent bootstrap POSTs.
  // The launcher creates a fresh random nonce for each invocation.
  const digest = createHash("sha256").update(config.bootstrapNonce).digest("hex");
  const marker = join(tmpdir(), `stellar-bootstrap-${digest}.used`);
  try {
    const handle = await open(marker, "wx", 0o600);
    await handle.close();
  } catch {
    return null;
  }
  const id = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_SECONDS * 1000;
  const cookie = cookieValue(config, id, expiresAt);
  return { cookie, operator: { id: config.operatorId, expiresAt, csrfToken: mac(config.runnerSecret, `csrf:${config.operatorId}:v1.${id}.${expiresAt}`) } };
}
