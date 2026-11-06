// ORZARYN — accounting ledger (Stage 15).
// Every entry traceable to a source operation; idempotent postings; integer
// minor units only. Separate representations for proposed/reserved/escrowed/
// released/refunded/fees/pending settlement (PRD F11).
import { db } from "@/lib/db";
import { AppError } from "./errors";
import { sha256 } from "./crypto";
import { env } from "./env";

export type EntryType = "PROPOSED" | "RESERVED" | "ESCROWED" | "RELEASED" | "REFUNDED" | "FEE" | "PENDING_SETTLEMENT";
export type Direction = "DEBIT" | "CREDIT";

export interface PostInput {
  orgId: string;
  workOrderId?: string | null;
  entryType: EntryType;
  direction?: Direction;
  account: string;
  amount: bigint;
  asset?: string;
  network?: string;
  sourceType: "WORK_ORDER" | "TREASURY_TX" | "WEBHOOK" | "ADJUSTMENT";
  sourceId: string;
  memo?: string;
  /** Unique per logical operation; duplicate posts return the existing entry. */
  idempotencyKey: string;
}

export function ledgerIdempotencyKey(parts: (string | number)[]): string {
  return sha256(parts.join("|")).slice(0, 40);
}

/** Idempotent single posting. Returns { entry, replayed }. */
export async function post(input: PostInput) {
  if (input.amount <= 0n) throw new AppError("VALIDATION_ERROR", "Ledger amounts must be positive");
  const existing = await db.ledgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { entry: existing, replayed: true };
  const entry = await db.ledgerEntry.create({
    data: {
      orgId: input.orgId,
      workOrderId: input.workOrderId ?? null,
      entryType: input.entryType,
      direction: input.direction ?? "DEBIT",
      account: input.account,
      amount: input.amount,
      asset: input.asset ?? "USDC",
      network: input.network ?? env.NETWORK,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      memo: input.memo,
      idempotencyKey: input.idempotencyKey,
    },
  });
  return { entry, replayed: false };
}

/** Post several entries; replays short-circuit the whole batch (all-or-nothing semantics). */
export async function postMany(inputs: PostInput[]) {
  const results: { id: string; replayed: boolean }[] = [];
  const seen = new Set<string>();
  for (const input of inputs) {
    if (seen.has(input.idempotencyKey)) continue;
    seen.add(input.idempotencyKey);
    const r = await post(input);
    results.push({ id: r.entry.id, replayed: r.replayed });
  }
  return results;
}

export async function sumByType(orgId: string, workOrderId?: string) {
  const rows = await db.ledgerEntry.groupBy({
    by: ["entryType"],
    where: { orgId, ...(workOrderId ? { workOrderId } : {}) },
    _sum: { amount: true },
  });
  const out: Record<string, bigint> = {};
  for (const r of rows) out[r.entryType] = (r._sum.amount ?? 0n) as bigint;
  return out;
}

/**
 * Escrow integrity check for a work order (double-entry aware):
 * escrow-in = ESCROWED debits; outflows = RELEASED + REFUNDED + FEE credits.
 * Invariant: outflows ≤ escrow-in AND total debits == total credits.
 */
export async function escrowInvariant(workOrderId: string) {
  const rows = await db.ledgerEntry.findMany({
    where: { workOrderId },
    select: { entryType: true, direction: true, amount: true },
  });
  let escrowedIn = 0n;
  let released = 0n;
  let refunded = 0n;
  let fees = 0n;
  let totalDebit = 0n;
  let totalCredit = 0n;
  for (const r of rows) {
    // PROPOSED/RESERVED are informational state trackers, not double-entry movements
    if (r.entryType === "PROPOSED" || r.entryType === "RESERVED") continue;
    if (r.direction === "DEBIT") totalDebit += r.amount;
    else totalCredit += r.amount;
    if (r.direction === "DEBIT" && r.entryType === "ESCROWED") escrowedIn += r.amount;
    if (r.direction === "CREDIT") {
      if (r.entryType === "RELEASED") released += r.amount;
      else if (r.entryType === "REFUNDED") refunded += r.amount;
      else if (r.entryType === "FEE") fees += r.amount;
    }
  }
  return {
    escrowed: escrowedIn,
    released,
    refunded,
    fees,
    balanced: released + refunded + fees <= escrowedIn && totalDebit === totalCredit,
  };
}
