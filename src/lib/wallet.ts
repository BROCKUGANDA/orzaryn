// ORZARYN — wallet ownership verification (Stage 7).
// Expiring, single-use Ed25519 challenges. A connected wallet is NOT sufficient
// evidence of authority; only a verified signature over the canonical challenge is.
import { randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import { db } from "@/lib/db";
import { env } from "./env";
import { AppError } from "./errors";

export function base58Decode(s: string): Uint8Array {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes: number[] = [];
  for (const ch of s) {
    const val = ALPHABET.indexOf(ch);
    if (val < 0) throw new AppError("VALIDATION_ERROR", `Invalid base58 character: ${ch}`);
    let carry = val;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // leading zeros
  for (const ch of s) {
    if (ch !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

export function canonicalChallengeMessage(opts: {
  domain: string;
  address: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  purpose: string;
}): string {
  return [
    `ORZARYN wants you to sign in with your Solana account:`,
    opts.address,
    ``,
    `Purpose: ${opts.purpose}`,
    `Domain: ${opts.domain}`,
    `Nonce: ${opts.nonce}`,
    `Issued at: ${opts.issuedAt}`,
    `Expires at: ${opts.expiresAt}`,
    ``,
    `This signature proves wallet ownership. It does not authorise any transaction or transfer.`,
  ].join("\n");
}

export async function createChallenge(purpose: string, address?: string) {
  const nonce = randomBytes(16).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.CHALLENGE_TTL_MINUTES * 60_000);
  const message = canonicalChallengeMessage({
    domain: new URL(env.APP_URL).host,
    address: address ?? "<wallet>",
    nonce,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    purpose,
  });
  const row = await db.authChallenge.create({
    data: { nonce, purpose, address, message, expiresAt },
  });
  return { nonce, message, expiresAt, id: row.id };
}

/**
 * Verify an Ed25519 signature over the challenge message and consume the nonce
 * atomically (single use). Throws on invalid, expired, or already-consumed challenges.
 */
export async function consumeChallenge(opts: {
  nonce: string;
  address: string;
  signatureBase64: string;
}): Promise<void> {
  const challenge = await db.authChallenge.findUnique({ where: { nonce: opts.nonce } });
  if (!challenge) throw new AppError("VALIDATION_ERROR", "Unknown challenge");
  if (challenge.consumedAt) throw new AppError("CONFLICT", "Challenge already used");
  if (challenge.expiresAt.getTime() < Date.now()) throw new AppError("VALIDATION_ERROR", "Challenge expired");

  const msgBytes = new TextEncoder().encode(challenge.message);
  let sigBytes: Uint8Array;
  try {
    sigBytes = new Uint8Array(Buffer.from(opts.signatureBase64, "base64"));
  } catch {
    throw new AppError("VALIDATION_ERROR", "Malformed signature encoding");
  }
  let pubBytes: Uint8Array;
  try {
    pubBytes = base58Decode(opts.address);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid wallet address encoding");
  }
  if (pubBytes.length !== 32) throw new AppError("VALIDATION_ERROR", "Invalid Solana pubkey length");

  const okSig = nacl.sign.detached.verify(msgBytes, sigBytes, pubBytes);
  if (!okSig) throw new AppError("VALIDATION_ERROR", "Signature verification failed");

  // Atomic single-use consumption: updateMany with consumedAt:null guard
  const res = await db.authChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date(), address: opts.address },
  });
  if (res.count !== 1) throw new AppError("CONFLICT", "Challenge already used");
}
