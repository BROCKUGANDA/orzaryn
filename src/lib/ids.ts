// ORZARYN — human-readable identifiers
import { randomBytes } from "node:crypto";

export function woPublicId(date = new Date()): string {
  const year = date.getUTCFullYear();
  const rand = randomBytes(3).toString("hex").toUpperCase(); // 16.7M space per year
  return `WO-${year}-${rand}`;
}

export function quotePublicId(): string {
  return `Q-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function receiptPublicId(): string {
  return `SR-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function disputePublicId(): string {
  return `DP-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function apiKeyId(): string {
  return `ozk_${randomBytes(8).toString("hex")}`;
}

export function apiKeySecret(): string {
  return `ozs_${randomBytes(24).toString("base64url")}`;
}

export function requestRequestId(): string {
  return `req_${randomBytes(8).toString("hex")}`;
}
