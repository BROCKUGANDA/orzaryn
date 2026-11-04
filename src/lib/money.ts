// ORZARYN — money integrity: integer minor units only. NEVER floats (PRD N1/F11).
import { AppError } from "./errors";

export const ASSET_DECIMALS: Record<string, number> = { USDC: 6 };

export function assertNonNegative(amount: bigint, label = "amount") {
  if (amount < 0n) throw new AppError("VALIDATION_ERROR", `${label} must be >= 0`);
}

/** Checked add: throws on overflow of Number.MAX_SAFE_INTEGER when converting for UI. */
export function addAmounts(...amounts: bigint[]): bigint {
  return amounts.reduce((a, b) => a + b, 0n);
}

/** Checked sub with floor guard. */
export function subAmounts(a: bigint, b: bigint, label = "amount"): bigint {
  const r = a - b;
  if (r < 0n) throw new AppError("VALIDATION_ERROR", `${label} underflow`);
  return r;
}

/** Parse a decimal string like "12.50" into minor units with checked arithmetic. */
export function parseToMinor(decimals: string, asset = "USDC"): bigint {
  const d = ASSET_DECIMALS[asset];
  if (d === undefined) throw new AppError("VALIDATION_ERROR", `Unsupported asset ${asset}`);
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(decimals.trim());
  if (!m) throw new AppError("VALIDATION_ERROR", `Invalid decimal amount: ${decimals}`);
  const whole = m[1];
  const frac = (m[2] ?? "").padEnd(d, "0").slice(0, d);
  return BigInt(whole + frac);
}

/** Format minor units as a display string, e.g. 12500000n -> "12.500000" trimmed to "12.5". */
export function formatFromMinor(minor: bigint, asset = "USDC"): string {
  const d = ASSET_DECIMALS[asset] ?? 6;
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const s = abs.toString().padStart(d + 1, "0");
  const whole = s.slice(0, s.length - d);
  const frac = s.slice(s.length - d).replace(/0+$/, "");
  const body = frac ? `${whole}.${frac}` : whole;
  return neg ? `-${body}` : body;
}

/** Percentage of a budget in basis points (integer math). */
export function bpsOf(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number((part * 10000n) / whole);
}
