// ORZARYN — quotes (Stage 10): agent requests; fixed-price auto-issue; custom quotes by provider ops
import { z } from "zod";
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { agentFromApiKey, requireOrgUser } from "@/lib/auth";
import { quotePublicId } from "@/lib/ids";
import { canonicalJson, sha256 } from "@/lib/crypto";
import { parseToMinor } from "@/lib/money";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  serviceId: z.string().min(1),
  requirements: z.string().max(2000).optional(),
});

const issueSchema = z.object({
  serviceId: z.string().min(1),
  agentId: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d{1,6})?$/),
  ttlHours: z.number().int().min(1).max(168).default(24),
});

export const GET = api(async (ctx) => {
  const p = await requireOrgUser();
  const quotes = await db.quote.findMany({
    where: { orgId: p.orgId },
    include: { service: { select: { title: true, category: true } }, provider: { select: { name: true } }, agent: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return ok(quotes);
});

/**
 * POST — two modes:
 * 1. Agent key (`x-orz-key`) requests a quote for a service (FIXED → auto-issued).
 * 2. Org user issues a custom quote (QUOTED pricing) on behalf of a provider under review
 *    of the service terms. In both modes the terms hash is computed over canonical terms.
 */
export const POST = api(async (ctx) => {
  const b = await ctx.body<unknown>();

  // agent mode
  if (ctx.agentKeyRaw) {
    const agent = await agentFromApiKey(ctx.agentKeyRaw);
    if (!agent || agent.kind !== "AGENT") throw new AppError("UNAUTHENTICATED", "Invalid agent key");
    const parsed = requestSchema.safeParse(b);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Invalid quote request", parsed.error.flatten().fieldErrors);

    const service = await db.service.findUnique({ where: { id: parsed.data.serviceId }, include: { provider: true } });
    if (!service || service.status !== "LISTED") throw new AppError("NOT_FOUND", "Service not found or not listed");
    if (service.provider.status !== "APPROVED") throw new AppError("PROVIDER_NOT_APPROVED", "Provider is not approved");

    const amount = service.basePrice;
    if (amount <= 0n) throw new AppError("VALIDATION_ERROR", "This service requires a custom quote; contact the provider");
    const terms = canonicalJson({
      serviceId: service.id, serviceVersion: service.version, title: service.title,
      amountMinor: amount.toString(), asset: service.asset, network: service.network,
      slaHours: service.slaHours, acceptanceTerms: service.acceptanceTerms,
      requirements: parsed.data.requirements ?? null,
    });
    const quote = await db.quote.create({
      data: {
        publicId: quotePublicId(),
        serviceId: service.id,
        providerId: service.providerId,
        orgId: agent.orgId,
        agentId: agent.agentId,
        amount,
        asset: service.asset,
        network: service.network,
        terms,
        termsHash: sha256(terms),
        status: "ISSUED",
        expiresAt: new Date(Date.now() + 24 * 3_600_000),
      },
    });
    await audit({ orgId: agent.orgId, actorType: "AGENT", actorId: agent.agentId, action: "quote.requested", resourceType: "quote", resourceId: quote.publicId, requestId: ctx.requestId });
    return ok(quote);
  }

  // org mode (custom quote issuance)
  const p = await requireOrgUser();
  const parsed = issueSchema.safeParse(b);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Invalid quote payload", parsed.error.flatten().fieldErrors);
  const service = await db.service.findUnique({ where: { id: parsed.data.serviceId }, include: { provider: true } });
  if (!service) throw new AppError("NOT_FOUND", "Service not found");
  if (service.provider.status !== "APPROVED") throw new AppError("PROVIDER_NOT_APPROVED", "Provider is not approved");
  const agent = await db.agent.findFirst({ where: { id: parsed.data.agentId, orgId: p.orgId } });
  if (!agent) throw new AppError("NOT_FOUND", "Agent not found in this organisation");
  const amount = parseToMinor(parsed.data.amount);
  const terms = canonicalJson({
    serviceId: service.id, serviceVersion: service.version, title: service.title,
    amountMinor: amount.toString(), asset: service.asset, network: service.network,
    slaHours: service.slaHours, acceptanceTerms: service.acceptanceTerms,
  });
  const quote = await db.quote.create({
    data: {
      publicId: quotePublicId(),
      serviceId: service.id,
      providerId: service.providerId,
      orgId: p.orgId,
      agentId: agent.id,
      amount,
      asset: service.asset,
      network: service.network,
      terms,
      termsHash: sha256(terms),
      status: "ISSUED",
      expiresAt: new Date(Date.now() + parsed.data.ttlHours * 3_600_000),
    },
  });
  await audit({ orgId: p.orgId, actorType: "USER", actorId: p.userId, action: "quote.issued", resourceType: "quote", resourceId: quote.publicId, requestId: ctx.requestId });
  return ok(quote);
});
