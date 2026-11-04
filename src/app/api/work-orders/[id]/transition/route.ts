// ORZARYN — work-order transitions (Stage 11): the ONLY mutation path for state.
// Server-side validation of every transition; principal attribution; illegal
// transitions rejected with INVALID_TRANSITION.
import { z } from "zod";
import { api, idempotentGuard } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { requireOrgUser, agentFromApiKey } from "@/lib/auth";
import { db } from "@/lib/db";
import { transitionWorkOrder, type WoAction, type Actor } from "@/lib/workorder";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum([
    "approve", "reject", "cancel", "fund", "accept", "deliver",
    "review_start", "review_accept", "review_reject", "request_revision",
    "open_dispute", "resolve_dispute", "refund",
  ]),
  reason: z.string().max(500).optional(),
  outcome: z.enum(["RESOLVED_PROVIDER", "RESOLVED_BUYER"]).optional(),
  detail: z.string().max(2000).optional(),
});

export const POST = api(async (ctx) => {
  const publicId = ctx.req.nextUrl?.pathname?.split("/")[3] ?? "";
  const b = await ctx.body<unknown>();
  const parsed = schema.safeParse(b);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Invalid transition payload", parsed.error.flatten().fieldErrors);

  const wo = await db.workOrder.findUnique({ where: { publicId } });
  if (!wo) throw new AppError("NOT_FOUND", "Work order not found");

  await idempotentGuard(ctx, `work-orders.transition.${parsed.data.action}`, { publicId, ...parsed.data });

  let actor: Actor;
  const providerClaim = ctx.req.headers.get("x-orz-provider");
  if (providerClaim) {
    // STAGING provider claim (documented gap): provider-side actions executed
    // with the provider of record's id. Production requires the provider portal
    // (see docs/status/SECURITY_FINDINGS.md SF-3).
    if (providerClaim !== wo.providerId) throw new AppError("FORBIDDEN", "Provider claim does not match the work order's provider");
    if (!["accept", "deliver"].includes(parsed.data.action)) {
      throw new AppError("FORBIDDEN", "Provider claim is only valid for accept/deliver");
    }
    const provider = await db.provider.findUnique({ where: { id: providerClaim } });
    if (!provider || provider.status !== "APPROVED") throw new AppError("PROVIDER_NOT_APPROVED", "Provider is not approved");
    actor = { kind: "PROVIDER", id: providerClaim };
  } else if (ctx.agentKeyRaw) {
    const agent = await agentFromApiKey(ctx.agentKeyRaw);
    if (!agent || agent.kind !== "AGENT") throw new AppError("UNAUTHENTICATED", "Invalid agent key");
    actor = { kind: "AGENT", id: agent.agentId };
  } else {
    const p = await requireOrgUser();
    actor = { kind: "USER", id: p.userId, role: p.role, orgId: p.orgId };
  }

  const updated = await transitionWorkOrder({
    workOrderPublicId: publicId,
    action: parsed.data.action as WoAction,
    actor,
    reason: parsed.data.reason,
    metadata: { detail: parsed.data.detail },
    outcome: parsed.data.outcome,
  });
  await audit({
    orgId: wo.orgId,
    actorType: actor.kind,
    actorId: actor.id,
    action: `workorder.${parsed.data.action}`,
    resourceType: "workorder",
    resourceId: publicId,
    metadata: { reason: parsed.data.reason, outcome: parsed.data.outcome },
    requestId: ctx.requestId,
  });
  return ok(updated);
});
