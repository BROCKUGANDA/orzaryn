// ORZARYN — integration tests (Stage 21): policy decisions, atomic reservation
// race, state machine guards. Runs against the staging database with clearly
// labelled DEMO-TEST records, cleaned up afterwards.
process.env.DATABASE_URL = "file:" + process.cwd() + "/db/custom.db";

import { describe, it, expect, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { evaluatePolicy, reserveBudget, releaseReservation } from "../src/lib/policy";
import { sha256 } from "../src/lib/crypto";

const db = new PrismaClient();
const A = (usd: number) => BigInt(Math.round(usd * 1e6));

const created: { agents: string[]; mandates: string[]; orgId?: string } = { agents: [], mandates: [] };

async function fixture() {
  let org = await db.organisation.findUnique({ where: { slug: "orz-test-org" } });
  if (!org) org = await db.organisation.create({ data: { name: "ORZ Test Org (DEMO-TEST)", slug: "orz-test-org" } });
  created.orgId = org.id;
  const agent = await db.agent.create({
    data: { orgId: org.id, name: `test-agent-${Date.now()}`, developer: "test", status: "ACTIVE", createdBy: "test" },
  });
  created.agents.push(agent.id);
  const mandate = await db.mandate.create({
    data: {
      orgId: org.id, agentId: agent.id, status: "ACTIVE",
      perPurchaseLimit: A(100), dailyLimit: A(200), weeklyLimit: A(400), monthlyLimit: A(800),
      aggregateBudget: A(1000), availableBudget: A(1000),
      approvalThreshold: A(50),
      validUntil: new Date(Date.now() + 24 * 3_600_000),
      termsHash: sha256("test"),
      createdBy: "test",
    },
  });
  created.mandates.push(mandate.id);
  let provider = await db.provider.findFirst({ where: { name: "Test Provider (DEMO-TEST)" } });
  if (!provider) {
    provider = await db.provider.create({
      data: { name: "Test Provider (DEMO-TEST)", description: "test fixture provider", status: "APPROVED", walletAddress: "Test11111111111111111111111111111111111111", contactEmail: "t@t.test" },
    });
  }
  let service = await db.service.findFirst({ where: { providerId: provider.id, title: "Test service (DEMO-TEST)" } });
  if (!service) {
    service = await db.service.create({
      data: { providerId: provider.id, title: "Test service (DEMO-TEST)", description: "test fixture service", category: "DATA", status: "LISTED", basePrice: A(10) },
    });
  }
  return { org, agent, mandate, provider, service };
}

afterAll(async () => {
  if (created.mandates.length) await db.mandate.deleteMany({ where: { id: { in: created.mandates } } });
  if (created.agents.length) await db.agent.deleteMany({ where: { id: { in: created.agents } } });
  await db.$disconnect();
});

describe("policy engine (Stage 9)", () => {
  it("APPROVE within mandate", async () => {
    const f = await fixture();
    const r = await evaluatePolicy({
      agentId: f.agent.id, mandateId: f.mandate.id, providerId: f.provider.id, serviceId: f.service.id,
      serviceCategory: f.service.category, serviceStatus: "LISTED", providerStatus: "APPROVED",
      asset: "USDC", network: "solana-devnet", amountMinor: A(10),
    });
    expect(r.decision).toBe("APPROVE");
    expect(r.reasonCodes).toContain("WITHIN_MANDATE");
  });

  it("REQUIRE_APPROVAL at threshold", async () => {
    const f = await fixture();
    const r = await evaluatePolicy({
      agentId: f.agent.id, mandateId: f.mandate.id, providerId: f.provider.id, serviceId: f.service.id,
      serviceCategory: f.service.category, serviceStatus: "LISTED", providerStatus: "APPROVED",
      asset: "USDC", network: "solana-devnet", amountMinor: A(50),
    });
    expect(r.decision).toBe("REQUIRE_APPROVAL");
    expect(r.reasonCodes).toContain("AMOUNT_REQUIRES_APPROVAL");
  });

  it("DENY above per-purchase limit with reason code", async () => {
    const f = await fixture();
    const r = await evaluatePolicy({
      agentId: f.agent.id, mandateId: f.mandate.id, providerId: f.provider.id, serviceId: f.service.id,
      serviceCategory: f.service.category, serviceStatus: "LISTED", providerStatus: "APPROVED",
      asset: "USDC", network: "solana-devnet", amountMinor: A(101),
    });
    expect(r.decision).toBe("DENY");
    expect(r.reasonCodes).toContain("PER_PURCHASE_LIMIT_EXCEEDED");
  });

  it("DENY revoked agent immediately (Stage 8 race rule)", async () => {
    const f = await fixture();
    await db.agent.update({ where: { id: f.agent.id }, data: { status: "REVOKED" } });
    const r = await evaluatePolicy({
      agentId: f.agent.id, mandateId: f.mandate.id, providerId: f.provider.id, serviceId: f.service.id,
      serviceCategory: f.service.category, serviceStatus: "LISTED", providerStatus: "APPROVED",
      asset: "USDC", network: "solana-devnet", amountMinor: A(10),
    });
    await db.agent.update({ where: { id: f.agent.id }, data: { status: "ACTIVE" } });
    expect(r.decision).toBe("DENY");
    expect(r.reasonCodes).toContain("AGENT_NOT_ACTIVE");
  });

  it("DENY unapproved provider", async () => {
    const f = await fixture();
    const r = await evaluatePolicy({
      agentId: f.agent.id, mandateId: f.mandate.id, providerId: f.provider.id, serviceId: f.service.id,
      serviceCategory: f.service.category, serviceStatus: "LISTED", providerStatus: "SUSPENDED",
      asset: "USDC", network: "solana-devnet", amountMinor: A(10),
    });
    expect(r.decision).toBe("DENY");
    expect(r.reasonCodes).toContain("PROVIDER_NOT_APPROVED");
  });
});

describe("atomic budget reservation (Stage 9 / ADR-005)", () => {
  it("concurrent reservations cannot over-consume the budget", async () => {
    const f = await fixture();
    // available 1000; two 700 reservations concurrently → exactly one succeeds
    const attempts = await Promise.allSettled([
      reserveBudget(f.mandate.id, A(700)),
      reserveBudget(f.mandate.id, A(700)),
    ]);
    const fulfilled = attempts.filter((a) => a.status === "fulfilled");
    expect(fulfilled.length).toBe(1);
    const m = await db.mandate.findUnique({ where: { id: f.mandate.id } });
    expect(m!.availableBudget).toBe(A(300));
    expect(m!.reservedTotal).toBe(A(700));
    // cleanup: release and assert conservation available+reserved+spent == aggregate
    await releaseReservation(f.mandate.id, A(700));
    const m2 = await db.mandate.findUnique({ where: { id: f.mandate.id } });
    expect(m2!.availableBudget + m2!.reservedTotal + m2!.spentTotal).toBe(m2!.aggregateBudget);
  });
});
