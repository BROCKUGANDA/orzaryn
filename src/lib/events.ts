// ORZARYN — event processing & reconciliation (Stage 17).
// Webhook ingest: verify → persist-before-ack → dedup. Worker: transactional
// claims, idempotent processing, exponential backoff, dead-letter, checkpoints.
// Sweeps: reservation expiry, quote expiry. Reconciliation: ledger vs mandates.
import { db } from "@/lib/db";
import { logger } from "./logger";
import { releaseReservation } from "./policy";
import { escrowInvariant } from "./ledger";

const log = logger("events");

// ── webhook ingestion ────────────────────────────────────────────────────────

export async function ingestWebhook(input: {
  source: string;
  externalId: string;
  payload: string;
  signatureValid: boolean;
}) {
  // Dedup on (source, externalId); persist BEFORE acknowledgement (Stage 17).
  const existing = await db.webhookEvent.findUnique({
    where: { source_externalId: { source: input.source, externalId: input.externalId } },
  });
  if (existing) return { deduped: true, id: existing.id };
  const row = await db.webhookEvent.create({
    data: {
      source: input.source,
      externalId: input.externalId,
      payload: input.payload,
      signatureValid: input.signatureValid,
      status: "PENDING",
    },
  });
  log.info("webhook.accepted", { id: row.id, source: input.source, valid: input.signatureValid });
  return { deduped: false, id: row.id };
}

// ── outbox ───────────────────────────────────────────────────────────────────

export async function publishToOutbox(type: string, payload: Record<string, unknown>) {
  await db.outboxEvent.create({
    data: { type, payload: JSON.stringify(payload), status: "PENDING" },
  });
}

// ── inbox processing ─────────────────────────────────────────────────────────

async function processWebhookEvent(id: string): Promise<void> {
  const evt = await db.webhookEvent.findUnique({ where: { id } });
  if (!evt) return;
  if (!evt.signatureValid) {
    throw new Error("signature_invalid");
  }
  const payload = JSON.parse(evt.payload) as {
    type?: string;
    reference?: string; // DEMO:<id> or tx signature
    status?: string;
    slot?: number;
  };

  // Known event families:
  // 1. treasury/treasury_confirmed — confirm a pending treasury tx by reference
  // 2. escrow/escrow_confirmed — confirm escrow funding/release for a work order
  // 3. program_log — Anchor program log forward (recorded, reconciled later)
  if (payload.type === "treasury_confirmed" && payload.reference) {
    await db.treasuryTx.updateMany({
      where: { txSignature: payload.reference, status: "PENDING" },
      data: { status: "CONFIRMED" },
    });
  } else if (payload.type === "escrow_confirmed" && payload.reference) {
    await db.settlementReceipt.updateMany({
      where: { chainRef: payload.reference },
      data: {},
    }); // receipts are created after finality; reference exists for probing
  } else if (payload.type === "program_log") {
    // persisted for reconciliation; no state change
  } else {
    throw new Error(`unhandled_event_type:${payload.type ?? "none"}`);
  }
}

export async function processInboxOnce(): Promise<{ processed: number; failed: number }> {
  const claimable = await db.webhookEvent.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
    take: 10,
    orderBy: { receivedAt: "asc" },
  });
  let processed = 0;
  let failed = 0;
  for (const evt of claimable) {
    const claimed = await db.webhookEvent.updateMany({
      where: { id: evt.id, status: evt.status },
      data: { status: "PROCESSING" },
    });
    if (claimed.count !== 1) continue;
    try {
      await processWebhookEvent(evt.id);
      await db.webhookEvent.update({
        where: { id: evt.id },
        data: { status: "PROCESSED", processedAt: new Date(), lastError: null },
      });
      processed++;
    } catch (e) {
      const attempts = evt.attempts + 1;
      const dead = attempts >= evt.maxAttempts;
      const backoffMs = Math.min(60_000, 1_000 * 2 ** attempts) * Math.random(); // full jitter
      await db.webhookEvent.update({
        where: { id: evt.id },
        data: {
          status: dead ? "DEAD" : "FAILED",
          attempts,
          lastError: e instanceof Error ? e.message : "unknown",
          nextRetryAt: dead ? null : new Date(Date.now() + backoffMs),
        },
      });
      failed++;
      log.warn("webhook.failed", { id: evt.id, attempts, dead, error: e instanceof Error ? e.message : "unknown" });
    }
  }
  return { processed, failed };
}

export async function publishOutboxOnce(): Promise<{ published: number }> {
  const pending = await db.outboxEvent.findMany({ where: { status: "PENDING" }, take: 20, orderBy: { createdAt: "asc" } });
  let published = 0;
  for (const evt of pending) {
    // Single-process publisher; subscriber list is pluggable (webhook fanout deferred).
    const r = await db.outboxEvent.updateMany({ where: { id: evt.id, status: "PENDING" }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    published += r.count;
  }
  return { published };
}

// ── sweeps ───────────────────────────────────────────────────────────────────

export async function sweepExpiredReservations(): Promise<number> {
  const expired = await db.budgetReservation.findMany({
    where: { status: "RESERVED", expiresAt: { lt: new Date() } },
  });
  let n = 0;
  for (const r of expired) {
    await releaseReservation(r.mandateId, r.amount);
    await db.budgetReservation.update({ where: { id: r.id }, data: { status: "EXPIRED" } });
    n++;
  }
  return n;
}

export async function sweepExpiredQuotes(): Promise<number> {
  const r = await db.quote.updateMany({
    where: { status: "ISSUED", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return r.count;
}

// ── reconciliation ───────────────────────────────────────────────────────────

export async function reconcileOnce(): Promise<{ checked: number; mismatches: number }> {
  let checked = 0;
  let mismatches = 0;

  // 1. Per-mandate: available + reserved + spent == aggregate
  const mandates = await db.mandate.findMany();
  for (const m of mandates) {
    const sum = m.availableBudget + m.reservedTotal + m.spentTotal;
    const match = sum === m.aggregateBudget;
    checked++;
    if (!match) mismatches++;
    const recent = await db.reconciliationRecord.findFirst({
      where: { scope: "MANDATE_SUMS", reference: m.id, status: match ? "MATCH" : "MISMATCH" },
      orderBy: { runAt: "desc" },
    });
    if (!recent) {
      await db.reconciliationRecord.create({
        data: {
          scope: "MANDATE_SUMS",
          reference: m.id,
          expected: m.aggregateBudget,
          observed: sum,
          delta: sum - m.aggregateBudget,
          status: match ? "MATCH" : "MISMATCH",
          details: match ? undefined : `available=${m.availableBudget} reserved=${m.reservedTotal} spent=${m.spentTotal}`,
        },
      });
    }
  }

  // 2. Per work order with escrow: one-time settlement invariant
  const wos = await db.workOrder.findMany({ where: { fundingStatus: { in: ["ESCROWED", "RELEASED", "REFUNDED"] } } });
  for (const wo of wos) {
    const inv = await escrowInvariant(wo.id);
    checked++;
    if (!inv.balanced) {
      mismatches++;
      await db.reconciliationRecord.create({
        data: {
          scope: "ESCROW_VS_LEDGER",
          reference: wo.id,
          expected: inv.escrowed,
          observed: inv.released + inv.refunded + inv.fees,
          delta: inv.escrowed - (inv.released + inv.refunded + inv.fees),
          status: "MISMATCH",
          details: "escrow outflows exceed inflow",
        },
      });
    }
  }
  return { checked, mismatches };
}

// ── worker loop (in-process singleton; ADR-006) ──────────────────────────────

let started = false;
let running = false;

export function startWorkers() {
  if (started) return;
  started = true;
  log.info("worker.started", { intervalMs: 5_000 });
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await processInboxOnce();
      await publishOutboxOnce();
      await sweepExpiredReservations();
      await sweepExpiredQuotes();
      await checkpoint();
    } catch (e) {
      log.error("worker.tick_failed", { error: e instanceof Error ? e.message : "unknown" });
    } finally {
      running = false;
    }
  }, 5_000);
  // reconciliation is heavier; run every 60s
  setInterval(async () => {
    try {
      const r = await reconcileOnce();
      if (r.mismatches > 0) log.error("reconciliation.mismatch", r);
    } catch (e) {
      log.error("reconciliation.failed", { error: e instanceof Error ? e.message : "unknown" });
    }
  }, 60_000);
}

async function checkpoint() {
  const sources = [
    { source: "inbox", cursor: new Date().toISOString() },
    { source: "outbox", cursor: new Date().toISOString() },
    { source: "sweep", cursor: new Date().toISOString() },
  ];
  for (const s of sources) {
    await db.eventCheckpoint.upsert({
      where: { source: s.source },
      create: { source: s.source, cursor: s.cursor },
      update: { cursor: s.cursor },
    });
  }
}
