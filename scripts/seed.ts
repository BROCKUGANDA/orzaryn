// ORZARYN — staging seed (DEMO data only; never real financial data).
// Run: bun scripts/seed.ts
// Prints generated credentials ONCE. All records are labelled DEMO.
process.env.DATABASE_URL = "file:" + process.cwd() + "/db/custom.db";

import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes, createHash } from "node:crypto";
import { canonicalJson } from "../src/lib/crypto";

const db = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const dk = scryptSync(password, salt, 64);
  return `scrypt$${salt}$${dk.toString("hex")}`;
}
function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

async function main() {
  console.log("== ORZARYN staging seed (DEMO DATA — TESTNET ONLY) ==");

  // ── users ──
  const owner = await db.user.upsert({
    where: { email: "demo-owner@orzaryn.test" },
    update: {},
    create: { email: "demo-owner@orzaryn.test", name: "Demo Owner", passwordHash: hashPassword("DemoOwner#2026") },
  });
  const treasurer = await db.user.upsert({
    where: { email: "demo-treasurer@orzaryn.test" },
    update: {},
    create: { email: "demo-treasurer@orzaryn.test", name: "Dana Treasurer", passwordHash: hashPassword("DemoTreasurer#2026") },
  });
  const approver = await db.user.upsert({
    where: { email: "demo-approver@orzaryn.test" },
    update: {},
    create: { email: "demo-approver@orzaryn.test", name: "Ari Approver", passwordHash: hashPassword("DemoApprover#2026") },
  });

  // ── organisation ──
  let org = await db.organisation.findUnique({ where: { slug: "acme-agents-demo" } });
  if (!org) {
    org = await db.organisation.create({ data: { name: "ACME Agents (DEMO)", slug: "acme-agents-demo" } });
  }
  for (const [u, role] of [[owner, "OWNER"], [treasurer, "TREASURER"], [approver, "APPROVER"]] as const) {
    await db.membership.upsert({
      where: { userId_orgId: { userId: u.id, orgId: org.id } },
      update: { role },
      create: { userId: u.id, orgId: org.id, role },
    });
  }

  // ── agent ──
  let agent = await db.agent.findFirst({ where: { orgId: org.id, name: "atlas-01" } });
  if (!agent) {
    agent = await db.agent.create({
      data: {
        orgId: org.id, name: "atlas-01", developer: "ACME AI Platform (DEMO)",
        description: "Demo procurement agent for staging walkthroughs.",
        status: "ACTIVE", signerVerifiedAt: new Date(), createdBy: owner.id,
      },
    });
  }

  // ── agent API key ──
  let key = await db.apiKey.findFirst({ where: { agentId: agent.id, status: "ACTIVE" } });
  let printedKey = "";
  if (!key) {
    const keyId = `ozk_${randomBytes(8).toString("hex")}`;
    const secret = `ozs_${randomBytes(24).toString("base64url")}`;
    key = await db.apiKey.create({ data: { agentId: agent.id, keyId, secretHash: sha256(secret), status: "ACTIVE", scopes: "agent" } });
    printedKey = `${keyId}.${secret}`;
  }

  // ── mandate ──
  let mandate = await db.mandate.findFirst({ where: { agentId: agent.id, status: "ACTIVE" } });
  if (!mandate) {
    const A = (n: string) => BigInt(Math.round(parseFloat(n) * 1e6));
    mandate = await db.mandate.create({
      data: {
        orgId: org.id, agentId: agent.id, status: "ACTIVE",
        perPurchaseLimit: A("250"), dailyLimit: A("1000"), weeklyLimit: A("4000"), monthlyLimit: A("10000"),
        aggregateBudget: A("20000"), availableBudget: A("20000"),
        approvalThreshold: A("500"),
        serviceCategories: JSON.stringify(["DATA", "DEVELOPMENT", "CONTENT", "RESEARCH", "INTEGRATION", "OPS"]),
        validUntil: new Date(Date.now() + 30 * 24 * 3_600_000),
        termsHash: sha256(canonicalJson({ agentId: agent.id, aggregate: "20000", version: 1 })),
        createdBy: owner.id,
      },
    });
  }

  // ── treasury ──
  let treasury = await db.treasuryAccount.findFirst({ where: { orgId: org.id } });
  if (!treasury) {
    treasury = await db.treasuryAccount.create({
      data: {
        orgId: org.id, label: "Primary USDC Treasury (DEMO TESTNET)",
        address: "DemoTreasuryMint11111111111111111111111111111",
        trackBalance: BigInt(2500 * 1e6),
      },
    });
    await db.treasuryTx.create({
      data: { accountId: treasury.id, type: "DEPOSIT", amount: BigInt(2500 * 1e6), txSignature: "DEMO:seed-deposit-1", status: "CONFIRMED", sourceType: "MANUAL", createdBy: owner.id },
    });
  }

  // ── providers ──
  const providerSpecs = [
    { name: "Cortex Data Studio (DEMO)", status: "APPROVED", cat: "DATA", svc: "Dataset annotation — 1k records", price: "180.00" },
    { name: "Forge Labs (DEMO)", status: "APPROVED", cat: "DEVELOPMENT", svc: "Solana program quick audit", price: "240.00" },
    { name: "Meridian Research (DEMO)", status: "UNDER_REVIEW", cat: "RESEARCH", svc: "Market brief — agentic commerce", price: "120.00" },
  ] as const;
  for (const spec of providerSpecs) {
    let provider = await db.provider.findFirst({ where: { name: spec.name } });
    if (!provider) {
      provider = await db.provider.create({
        data: {
          name: spec.name,
          description: "DEMO provider for staging evaluation. Not a real business.",
          status: spec.status,
          walletAddress: "DemoProviderWallet111111111111111111111111111",
          walletVerifiedAt: spec.status === "APPROVED" ? new Date() : null,
          contactEmail: "contact@demo.test",
          categories: JSON.stringify([spec.cat]),
          reviewedBy: spec.status === "APPROVED" ? owner.id : null,
          reviewedAt: spec.status === "APPROVED" ? new Date() : null,
        },
      });
    }
    const svc = await db.service.findFirst({ where: { providerId: provider.id, title: spec.svc } });
    if (!svc) {
      await db.service.create({
        data: {
          providerId: provider.id, title: spec.svc,
          description: "DEMO service listing for the ORZARYN staging walkthrough. Deliverable is a structured report and evidence bundle.",
          category: spec.cat, status: "LISTED", pricingModel: "FIXED",
          basePrice: BigInt(Math.round(parseFloat(spec.price) * 1e6)),
          slaHours: 48, acceptanceTerms: "Buyer accepts upon review of the structured evidence bundle.",
        },
      });
    }
  }

  console.log("\n-- DEMO CREDENTIALS (staging only) --");
  console.log("Owner:     demo-owner@orzaryn.test / DemoOwner#2026");
  console.log("Treasurer: demo-treasurer@orzaryn.test / DemoTreasurer#2026");
  console.log("Approver:  demo-approver@orzaryn.test / DemoApprover#2026");
  if (printedKey) console.log(`Agent API key (shown once): ${printedKey}`);
  else {
    const k = await db.apiKey.findFirst({ where: { agentId: agent.id, status: "ACTIVE" } });
    console.log(`Agent API key exists: ${k?.keyId}.<secret not shown>`);
  }
  console.log("Org slug: acme-agents-demo | Agent: atlas-01 | Mandate aggregate: 20,000.00 USDC (testnet)");
  console.log("== Seed complete. All data is DEMO — no real financial data. ==");
}

main().finally(() => db.$disconnect());
