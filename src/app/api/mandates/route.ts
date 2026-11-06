// ORZARYN — mandates (Stage 8/9): create/list/revoke. Versioned terms.
import { z } from "zod";
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canonicalJson, sha256 } from "@/lib/crypto";
import { parseToMinor } from "@/lib/money";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  agentId: z.string().min(1),
  perPurchaseLimit: z.string().regex(/^\d+(\.\d{1,6})?$/),
  dailyLimit: z.string().regex(/^\d+(\.\d{1,6})?$/),
  weeklyLimit: z.string().regex(/^\d+(\.\d{1,6})?$/),
  monthlyLimit: z.string().regex(/^\d+(\.\d{1,6})?$/),
  aggregateBudget: z.string().regex(/^\d+(\.\d{1,6})?$/),
  approvalThreshold: z.string().regex(/^\d+(\.\d{1,6})?$/).optional(),
  providerAllowlist: z.array(z.string()).default([]),
  serviceCategories: z.array(z.string()).default([]),
  validDays: z.number().int().min(1).max(365).default(30),
  maxConcurrent: z.number().int().min(1).max(20).default(5),
  maxPerHour: z.number().int().min(1).max(60).default(10),
});

export const GET = api(async () => {
  const p = await requireOrgUser();
  const mandates = await db.mandate.findMany({
    where: { orgId: p.orgId },
    include: { agent: { select: { name: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });
  return ok(mandates);
});

export const POST = api(async (ctx) => {
  const p = await requireOrgUser();
  if (p.role !== "OWNER" && p.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "Only OWNER/ADMIN can create mandates");
  }
  const b = await ctx.body<unknown>();
  const parsed = createSchema.safeParse(b);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Invalid mandate payload", parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const agent = await db.agent.findFirst({ where: { id: d.agentId, orgId: p.orgId } });
  if (!agent) throw new AppError("NOT_FOUND", "Agent not found");
  if (agent.status === "REVOKED") throw new AppError("AGENT_REVOKED", "Cannot grant mandates to a revoked agent");
  if (agent.status === "SUSPENDED") throw new AppError("MANDATE_INVALID", "Agent is suspended; activate first");

  const perPurchase = parseToMinor(d.perPurchaseLimit);
  const daily = parseToMinor(d.dailyLimit);
  const weekly = parseToMinor(d.weeklyLimit);
  const monthly = parseToMinor(d.monthlyLimit);
  const aggregate = parseToMinor(d.aggregateBudget);
  if (!(perPurchase <= daily && daily <= weekly && weekly <= monthly && monthly <= aggregate)) {
    throw new AppError("VALIDATION_ERROR", "Limits must satisfy per-purchase ≤ daily ≤ weekly ≤ monthly ≤ aggregate");
  }

  const terms = canonicalJson({
    agentId: agent.id, perPurchaseLimit: perPurchase.toString(), dailyLimit: daily.toString(),
    weeklyLimit: weekly.toString(), monthlyLimit: monthly.toString(), aggregateBudget: aggregate.toString(),
    providerAllowlist: d.providerAllowlist, serviceCategories: d.serviceCategories,
    asset: "USDC", network: env.NETWORK, validDays: d.validDays,
  });
  const mandate = await db.mandate.create({
    data: {
      orgId: p.orgId,
      agentId: agent.id,
      version: 1,
      status: "ACTIVE",
      perPurchaseLimit: perPurchase,
      dailyLimit: daily,
      weeklyLimit: weekly,
      monthlyLimit: monthly,
      aggregateBudget: aggregate,
      availableBudget: aggregate,
      approvalThreshold: d.approvalThreshold ? parseToMinor(d.approvalThreshold) : null,
      providerAllowlist: JSON.stringify(d.providerAllowlist),
      serviceCategories: JSON.stringify(d.serviceCategories),
      validUntil: new Date(Date.now() + d.validDays * 24 * 3_600_000),
      termsHash: sha256(terms),
      createdBy: p.userId,
      maxConcurrent: d.maxConcurrent,
      maxPerHour: d.maxPerHour,
    },
  });
  await audit({
    orgId: p.orgId, actorType: "USER", actorId: p.userId,
    action: "mandate.created", resourceType: "mandate", resourceId: mandate.id,
    metadata: { agent: agent.name, aggregate: aggregate.toString(), termsHash: mandate.termsHash }, requestId: ctx.requestId,
  });
  return ok(mandate);
});
