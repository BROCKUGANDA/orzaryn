// ORZARYN — outbox fanout + webhook finality tests (Stage 24).
// Exercises the REAL delivery path: HTTP subscriber over loopback, HMAC
// signature verification, retry/backoff, dead-lettering, and the
// escrow_confirmed → SettlementReceipt.confirmedAt webhook handler.
process.env.DATABASE_URL = "file:" + process.cwd() + "/db/custom.db";
process.env.EVENT_WEBHOOK_SECRET = "test-outbox-secret-0123456789abcdef";

import { describe, it, expect, afterAll } from "bun:test";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const SECRET = process.env.EVENT_WEBHOOK_SECRET!;
const A = (usd: number) => BigInt(Math.round(usd * 1e6));

// Loopback subscriber: records deliveries, verifies signatures, and can be
// switched between accepting (2xx) and failing (500) modes.
let failing = false;
const deliveries: { eventId: string; body: string; signature: string | null }[] = [];
const receiver = Bun.serve({
  port: 0,
  fetch: async (req) => {
    const body = await req.text();
    const eventId = req.headers.get("x-orzaryn-event-id") ?? "unknown";
    if (failing) return new Response("boom", { status: 500 });
    deliveries.push({ eventId, body, signature: req.headers.get("x-orzaryn-signature") });
    return Response.json({ ok: true });
  },
});
const RECEIVER_URL = `http://127.0.0.1:${receiver.port}/hook`;

// events.ts reads env at import time, but in a full-suite run another test
// file may have imported env.ts first — so configure the parsed `env` object
// directly rather than relying on process.env before parse.
const { ingestWebhook, processInboxOnce, publishOutboxOnce, outboxSubscribers, signOutboxPayload, stampReceiptIfConfirmed } = await import("../src/lib/events");
const { env } = await import("../src/lib/env");
env.EVENT_WEBHOOK_SECRET = SECRET;
env.EVENT_WEBHOOK_URLS = RECEIVER_URL;

const created = {
  receiptIds: [] as string[],
  outboxIds: [] as string[],
  webhookIds: [] as string[],
  workOrderIds: [] as string[],
  serviceIds: [] as string[],
  providerIds: [] as string[],
  orgIds: [] as string[],
};

afterAll(async () => {
  await db.settlementReceipt.deleteMany({ where: { id: { in: created.receiptIds } } });
  await db.workOrder.deleteMany({ where: { id: { in: created.workOrderIds } } });
  await db.service.deleteMany({ where: { id: { in: created.serviceIds } } });
  await db.provider.deleteMany({ where: { id: { in: created.providerIds } } });
  await db.organisation.deleteMany({ where: { id: { in: created.orgIds } } }); // cascades agents
  await db.outboxEvent.deleteMany({ where: { id: { in: created.outboxIds } } });
  await db.webhookEvent.deleteMany({ where: { id: { in: created.webhookIds } } });
  receiver.stop(true);
  await db.$disconnect();
});

describe("outbox fanout (Stage 24)", () => {
  it("parses the subscriber list", () => {
    env.EVENT_WEBHOOK_URLS = ` ${RECEIVER_URL} , https://a.test/x,,`;
    expect(outboxSubscribers()).toEqual([RECEIVER_URL, "https://a.test/x"]);
    env.EVENT_WEBHOOK_URLS = "";
    expect(outboxSubscribers()).toEqual([]);
    env.EVENT_WEBHOOK_URLS = RECEIVER_URL;
  });

  it("signs payloads deterministically over the exact body", () => {
    const sig = signOutboxPayload('{"a":1}');
    expect(sig).toBe(createHmac("sha256", SECRET).update('{"a":1}').digest("hex"));
    expect(signOutboxPayload('{"a":2}')).not.toBe(sig);
  });

  it("delivers to the subscriber with a valid HMAC and marks PUBLISHED", async () => {
    const before = deliveries.length;
    const evt = await db.outboxEvent.create({
      data: { type: "workorder.created", payload: JSON.stringify({ workOrderId: "WO-TEST24-1", demo: true }) },
    });
    created.outboxIds.push(evt.id);

    const r = await publishOutboxOnce();
    expect(r.published).toBeGreaterThanOrEqual(1);

    const mine = deliveries.slice(before).find((d) => d.eventId === evt.id);
    expect(mine).toBeDefined();
    expect(createHmac("sha256", SECRET).update(mine!.body).digest("hex")).toBe(mine!.signature);

    const row = await db.outboxEvent.findUnique({ where: { id: evt.id } });
    expect(row!.status).toBe("PUBLISHED");
    expect(row!.publishedAt).not.toBeNull();
    expect(JSON.parse(mine!.body).payload.demo).toBe(true);
  });

  it("retries with backoff on failure and dead-letters after max attempts", async () => {
    failing = true;
    const evt = await db.outboxEvent.create({
      data: { type: "workorder.settled", payload: JSON.stringify({ workOrderId: "WO-TEST24-2", demo: true }) },
    });
    created.outboxIds.push(evt.id);

    let r = await publishOutboxOnce();
    expect(r.failed).toBeGreaterThanOrEqual(1);
    let row = await db.outboxEvent.findUnique({ where: { id: evt.id } });
    expect(row!.status).toBe("PENDING");
    expect(row!.attempts).toBe(1);
    expect(row!.lastError).toContain("subscriber_http_500");
    expect(row!.nextRetryAt!.getTime()).toBeGreaterThan(Date.now()); // backoff scheduled

    // Fast-forward past backoff with one attempt remaining → must dead-letter.
    await db.outboxEvent.update({
      where: { id: evt.id },
      data: { attempts: env.OUTBOX_MAX_ATTEMPTS - 1, nextRetryAt: null },
    });
    r = await publishOutboxOnce();
    expect(r.failed).toBeGreaterThanOrEqual(1);
    row = await db.outboxEvent.findUnique({ where: { id: evt.id } });
    expect(row!.status).toBe("FAILED");
    expect(row!.nextRetryAt).toBeNull();

    failing = false;
  });

  it("records events as PUBLISHED when no subscriber is configured", async () => {
    env.EVENT_WEBHOOK_URLS = "";
    const evt = await db.outboxEvent.create({
      data: { type: "workorder.approved", payload: JSON.stringify({ workOrderId: "WO-TEST24-3", demo: true }) },
    });
    created.outboxIds.push(evt.id);
    await publishOutboxOnce();
    const row = await db.outboxEvent.findUnique({ where: { id: evt.id } });
    expect(row!.status).toBe("PUBLISHED");
    expect(row!.publishedAt).not.toBeNull();
    env.EVENT_WEBHOOK_URLS = RECEIVER_URL;
  });
});

describe("escrow_confirmed webhook finality (Stage 24)", () => {
  it("stamps confirmedAt on the matching settlement receipt, idempotently", async () => {
    // Minimal fixture chain: org → agent → provider → service → work order → receipt.
    const org = await db.organisation.create({
      data: { name: "Outbox Test Org (DEMO-TEST)", slug: `orz-outbox-test-${Date.now()}` },
    });
    created.orgIds.push(org.id);
    const agent = await db.agent.create({
      data: { orgId: org.id, name: `outbox-agent-${Date.now()}`, developer: "test", status: "ACTIVE", createdBy: "test" },
    });
    const provider = await db.provider.create({
      data: { name: `Outbox Provider (DEMO-TEST) ${Date.now()}`, status: "APPROVED", walletAddress: "Test11111111111111111111111111111111111111", contactEmail: "t@t.test" },
    });
    created.providerIds.push(provider.id);
    const service = await db.service.create({
      data: { providerId: provider.id, title: "outbox-test-service", description: "test fixture service", category: "DEVELOPMENT", status: "LISTED", basePrice: A(10) },
    });
    created.serviceIds.push(service.id);
    const wo = await db.workOrder.create({
      data: {
        publicId: `WO-TEST24-${Date.now()}`, orgId: org.id, agentId: agent.id,
        providerId: provider.id, serviceId: service.id,
        amount: A(10), state: "COMPLETED", fundingStatus: "RELEASED", settlementState: "SETTLED",
        deadline: new Date(Date.now() + 3_600_000), terms: "{}", termsHash: "0".repeat(64),
      },
    });
    created.workOrderIds.push(wo.id);
    const receipt = await db.settlementReceipt.create({
      data: { publicId: `SR-TEST24-${Date.now()}`, workOrderId: wo.id, grossAmount: A(10), feeAmount: A(0), netAmount: A(10), kind: "RELEASE", chainRef: "TESTSIG-test-ref-24" },
    });
    created.receiptIds.push(receipt.id);

    const hook = await ingestWebhook({
      source: "alchemy",
      externalId: `test24-${Date.now()}`,
      payload: JSON.stringify({ type: "escrow_confirmed", reference: "TESTSIG-test-ref-24" }),
      signatureValid: true,
    });
    created.webhookIds.push(hook.id);

    await processInboxOnce();

    let confirmed = await db.settlementReceipt.findUnique({ where: { id: receipt.id } });
    expect(confirmed!.confirmedAt).not.toBeNull();

    // Idempotent replay: same reference again must not error or double-apply.
    const hook2 = await ingestWebhook({
      source: "alchemy",
      externalId: `test24-replay-${Date.now()}`,
      payload: JSON.stringify({ type: "escrow_confirmed", reference: "TESTSIG-test-ref-24" }),
      signatureValid: true,
    });
    created.webhookIds.push(hook2.id);
    await processInboxOnce();
    confirmed = await db.settlementReceipt.findUnique({ where: { id: receipt.id } });
    expect(confirmed!.confirmedAt).not.toBeNull();
  });

  it("back-stamps a receipt created AFTER its webhook confirmation (ordering tolerance)", async () => {
    // 1. Confirmation webhook arrives and is processed — no receipt exists yet.
    const ref = `TESTSIG-ordering-${Date.now()}`;
    const hook = await ingestWebhook({
      source: "alchemy",
      externalId: `test24-ordering-${Date.now()}`,
      payload: JSON.stringify({ type: "escrow_confirmed", reference: ref }),
      signatureValid: true,
    });
    created.webhookIds.push(hook.id);
    await processInboxOnce();

    // 2. The receipt is created later for the same reference — unconfirmed at write.
    const org = await db.organisation.create({
      data: { name: "Outbox Test Org 2 (DEMO-TEST)", slug: `orz-outbox-test2-${Date.now()}` },
    });
    created.orgIds.push(org.id);
    const agent = await db.agent.create({
      data: { orgId: org.id, name: `outbox-agent2-${Date.now()}`, developer: "test", status: "ACTIVE", createdBy: "test" },
    });
    const provider = await db.provider.create({
      data: { name: `Outbox Provider 2 (DEMO-TEST) ${Date.now()}`, status: "APPROVED", walletAddress: "Test11111111111111111111111111111111111111", contactEmail: "t@t.test" },
    });
    created.providerIds.push(provider.id);
    const service = await db.service.create({
      data: { providerId: provider.id, title: "outbox-test-service-2", description: "test fixture service", category: "DEVELOPMENT", status: "LISTED", basePrice: A(10) },
    });
    created.serviceIds.push(service.id);
    const wo = await db.workOrder.create({
      data: {
        publicId: `WO-TEST24B-${Date.now()}`, orgId: org.id, agentId: agent.id,
        providerId: provider.id, serviceId: service.id,
        amount: A(10), state: "COMPLETED", fundingStatus: "RELEASED", settlementState: "SETTLED",
        deadline: new Date(Date.now() + 3_600_000), terms: "{}", termsHash: "0".repeat(64),
      },
    });
    created.workOrderIds.push(wo.id);
    const receipt = await db.settlementReceipt.create({
      data: { publicId: `SR-TEST24B-${Date.now()}`, workOrderId: wo.id, grossAmount: A(10), feeAmount: A(0), netAmount: A(10), kind: "RELEASE", chainRef: ref },
    });
    created.receiptIds.push(receipt.id);
    expect((await db.settlementReceipt.findUnique({ where: { id: receipt.id } }))!.confirmedAt).toBeNull();

    // 3. Write-path back-stamp picks up the earlier confirmation.
    await stampReceiptIfConfirmed(receipt.id, ref);
    const confirmed = await db.settlementReceipt.findUnique({ where: { id: receipt.id } });
    expect(confirmed!.confirmedAt).not.toBeNull();
  });
});
