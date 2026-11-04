// ORZARYN — cryptographic primitives (ADR-002): scrypt passwords, HMAC-signed
// opaque tokens, sha256 hashing, timing-safe comparisons. No seeds/private keys ever.
import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as _scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { env } from "./env";

const scrypt = promisify(_scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const dk = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${dk.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hex] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const dk = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, "hex");
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmac(secret: string, payload: string | Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Opaque session token; only sha256(token) is stored. */
export function sessionToken(): { raw: string; hash: string } {
  const raw = randomToken(32);
  return { raw, hash: sha256(raw) };
}

/** Sign a value for stateless tamper protection (e.g. cookie wrapper). */
export function signValue(value: string): string {
  const mac = hmac(env.SESSION_SECRET, value);
  return `${Buffer.from(value).toString("base64url")}.${mac}`;
}

export function unsignValue(signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot < 0) return null;
  const b64 = signed.slice(0, dot);
  const mac = signed.slice(dot + 1);
  let value: string;
  try {
    value = Buffer.from(b64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = hmac(env.SESSION_SECRET, value);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
    return null;
  }
  return value;
}

/** Canonical JSON with sorted keys — used for terms hashes. */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, val]) => [k, sort(val)]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value));
}
