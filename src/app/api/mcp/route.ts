// ORZARYN — MCP-style agent API (Stage 16). Narrowly scoped tools; every call
// carries authenticated agent context; agents CANNOT reach the chain adapter
// or policy internals — only these tools.
import { z } from "zod";
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { agentFromApiKey } from "@/lib/auth";
import { db } from "@/lib/db";
import { createWorkOrderFromQuote, assertAgentCanPurchase, transitionWorkOrder } from "@/lib/workorder";

export const dynamic = "force-dynamic";

const TOOL_NAMES = [
  "discover_services",
  "request_quote",
  "submit_proposal",
  "inspect_mandate",
  "get_work_order",
  "get_evidence_state",
  "request_approval",
  "cancel_work_order",
] as const;

const inputSchemas: Record<(typeof TOOL_NAMES)[number], z.ZodTypeAny> = {
  discover_services: z.object({ category: z.string().optional() }),
  request_quote: z.object({ serviceId: z.string(), requirements: z.string().max(2000).optional() }),
  submit_proposal: z.object({ quotePublicId: z.string() }),
  inspect_mandate: z.object({}),
  get_work_order: z.object({ publicId: z.string() }),
  get_evidence_state: z.object({ publicId: z.string() }),
  request_approval: z.object({ publicId: z.string(), note: z.string().max(500) }),
  cancel_work_order: z.object({ publicId: z.string(), reason: z.string().max(300) }),
};

export const GET = api(async () => {
  // Tool discovery requires an agent key too (no anonymous enumeration).
  throw new AppError("UNAUTHENTICATED", "Agent key required (x-orz-key). Tools: " + TOOL_NAMES.join(", "));
});

export const POST = api(async (ctx) => {
  if (!ctx.agentKeyRaw) throw new AppError("UNAUTHENTICATED", "Agent key required (x-orz-key header)");
  const agent = await agentFromApiKey(ctx.agentKeyRaw);
  if (!agent || agent.kind !== "AGENT") throw new AppError("UNAUTHENTICATED", "Invalid agent key");
  if (agent.status === "REVOKED") throw new AppError("AGENT_REVOKED", "Agent is revoked");
  await assertAgentCanPurchase(agent.agentId);

  const b = await ctx.body<{ tool: string; input?: unknown }>();
  if (!TOOL_NAMES.includes(b.tool as (typeof TOOL_NAMES)[number])) {
    throw new AppError("VALIDATION_ERROR", `Unknown tool. Available: ${TOOL_NAMES.join(", ")}`);
  }
  const toolName = b.tool as (typeof TOOL_NAMES)[number];
  const parsed = inputSchemas[toolName].safeParse(b.input ?? {});
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Invalid tool input", parsed.error.flatten().fieldErrors);
  const i = parsed.data as Record<string, string | undefined>;

  switch (toolName) {
    case "discover_services": {
      const mandates = await db.mandate.findMany({
        where: { agentId: agent.agentId, status: "ACTIVE", validUntil: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });
      const allow = new Set(mandates.flatMap((m) => JSON.parse(m.providerAllowlist) as string[]));
      const cats = new Set(mandates.flatMap((m) => JSON.parse(m.serviceCategories) as string[]));
      const services = await db.service.findMany({
        where: {
          status: "LISTED",
          provider: { status: "APPROVED" },
          ...(i.category ? { category: i.category } : {}),
        },
        include: { provider: { select: { id: true, name: true, status: true } } },
      });
      const permitted = services.filter(
        (s) =>
          (allow.size === 0 || allow.has(s.providerId)) &&
          (cats.size === 0 || cats.has(s.category)),
      );
      return ok({
        services: permitted.map((s) => ({
          id: s.id, title: s.title, category: s.category, provider: s.provider.name,
          providerId: s.providerId, pricingModel: s.pricingModel,
          basePriceMinor: s.basePrice, asset: s.asset, slaHours: s.slaHours,
        })),
        note: "Only services permitted by your active mandates are listed.",
      });
    }
    case "request_quote": {
      const service = await db.service.findUnique({ where: { id: i.serviceId! }, include: { provider: true } });
      if (!service || service.status !== "LISTED" || service.provider.status !== "APPROVED") {
        throw new AppError("NOT_FOUND", "Service not available");
      }
      if (service.basePrice <= 0n) throw new AppError("VALIDATION_ERROR", "Service requires a custom quote; use request_approval with details");
      const { canonicalJson, sha256 } = await import("@/lib/crypto");
      const { quotePublicId } = await import("@/lib/ids");
      const terms = canonicalJson({
        serviceId: service.id, serviceVersion: service.version, title: service.title,
        amountMinor: service.basePrice.toString(), asset: service.asset, network: service.network,
        slaHours: service.slaHours, acceptanceTerms: service.acceptanceTerms,
        requirements: i.requirements ?? null,
      });
      const quote = await db.quote.create({
        data: {
          publicId: quotePublicId(),
          serviceId: service.id,
          providerId: service.providerId,
          orgId: agent.orgId,
          agentId: agent.agentId,
          amount: service.basePrice,
          asset: service.asset,
          network: service.network,
          terms,
          termsHash: sha256(terms),
          status: "ISSUED",
          expiresAt: new Date(Date.now() + 24 * 3_600_000),
        },
      });
      return ok({
        quoteId: quote.publicId, amountMinor: quote.amount, asset: quote.asset,
        termsHash: quote.termsHash, expiresAt: quote.expiresAt,
      });
    }
    case "submit_proposal": {
      const result = await createWorkOrderFromQuote({
        orgId: agent.orgId,
        agentId: agent.agentId,
        quotePublicId: i.quotePublicId!,
        actor: { kind: "AGENT", id: agent.agentId },
      });
      return ok({
        workOrderId: result.workOrder.publicId,
        state: result.workOrder.state,
        decision: result.policy.decision,
        reasonCodes: result.policy.reasonCodes,
        termsHash: result.workOrder.termsHash,
      });
    }
    case "inspect_mandate": {
      const mandate = await db.mandate.findFirst({
        where: { agentId: agent.agentId, status: "ACTIVE", validUntil: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });
      if (!mandate) return ok({ mandate: null });
      return ok({
        mandate: {
          id: mandate.id,
          perPurchaseLimitMinor: mandate.perPurchaseLimit,
          dailyLimitMinor: mandate.dailyLimit,
          weeklyLimitMinor: mandate.weeklyLimit,
          monthlyLimitMinor: mandate.monthlyLimit,
          aggregateBudgetMinor: mandate.aggregateBudget,
          availableBudgetMinor: mandate.availableBudget,
          reservedMinor: mandate.reservedTotal,
          spentMinor: mandate.spentTotal,
          validUntil: mandate.validUntil,
          approvalThresholdMinor: mandate.approvalThreshold,
        },
      });
    }
    case "get_work_order": {
      const wo = await db.workOrder.findFirst({
        where: { publicId: i.publicId!, agentId: agent.agentId },
        include: { events: { orderBy: { seq: "desc" }, take: 10 } },
      });
      if (!wo) throw new AppError("NOT_FOUND", "Work order not found for this agent");
      return ok({
        publicId: wo.publicId, state: wo.state, approvalStatus: wo.approvalStatus,
        fundingStatus: wo.fundingStatus, evidenceState: wo.evidenceState,
        settlementState: wo.settlementState, amountMinor: wo.amount,
        termsHash: wo.termsHash, deadline: wo.deadline,
        recentEvents: wo.events.map((e) => ({ action: e.action, from: e.fromState, to: e.toState, at: e.createdAt })),
      });
    }
    case "get_evidence_state": {
      const wo = await db.workOrder.findFirst({ where: { publicId: i.publicId!, agentId: agent.agentId } });
      if (!wo) throw new AppError("NOT_FOUND", "Work order not found for this agent");
      const evidence = await db.evidence.findMany({ where: { workOrderId: wo.id }, orderBy: { version: "desc" } });
      return ok({
        evidenceState: wo.evidenceState,
        versions: evidence.map((e) => ({ version: e.version, contentHash: e.contentHash, status: e.status, submittedAt: e.createdAt })),
      });
    }
    case "request_approval": {
      const wo = await db.workOrder.findFirst({ where: { publicId: i.publicId!, agentId: agent.agentId } });
      if (!wo) throw new AppError("NOT_FOUND", "Work order not found for this agent");
      await db.workOrderEvent.create({
        data: {
          workOrderId: wo.id,
          seq: (await db.workOrderEvent.count({ where: { workOrderId: wo.id } })) + 1,
          action: "approval_requested",
          actorType: "AGENT",
          actorId: agent.agentId,
          reason: i.note!,
        },
      });
      return ok({ queued: wo.state === "PENDING_APPROVAL", state: wo.state });
    }
    case "cancel_work_order": {
      const updated = await transitionWorkOrder({
        workOrderPublicId: i.publicId!,
        action: "cancel",
        actor: { kind: "AGENT", id: agent.agentId },
        reason: i.reason!,
      });
      return ok({ publicId: updated.publicId, state: updated.state });
    }
    default:
      throw new AppError("VALIDATION_ERROR", "Unhandled tool");
  }
});
