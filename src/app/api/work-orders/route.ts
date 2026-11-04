// ORZARYN — work orders (Stage 11): list + create (policy-gated)
import { z } from "zod";
import { api, idempotentGuard, idempotentStore } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { agentFromApiKey, requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createWorkOrderFromQuote, assertAgentCanPurchase } from "@/lib/workorder";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx) => {
  const p = await requireOrgUser();
  const state = ctx.req.nextUrl?.searchParams.get("state") ?? undefined;
  const workOrders = await db.workOrder.findMany({
    where: { orgId: p.orgId, ...(state ? { state } : {}) },
    include: {
      agent: { select: { name: true } },
      provider: { select: { name: true } },
      service: { select: { title: true, category: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return ok(workOrders);
});

const createSchema = z.object({ quotePublicId: z.string().min(3) });

export const POST = api(async (ctx) => {
  const b = await ctx.body<unknown>();

  // ── agent mode (MCP-adjacent programmatic purchases) ──
  if (ctx.agentKeyRaw) {
    const agent = await agentFromApiKey(ctx.agentKeyRaw);
    if (!agent || agent.kind !== "AGENT") throw new AppError("UNAUTHENTICATED", "Invalid agent key");
    await assertAgentCanPurchase(agent.agentId);
    const parsed = createSchema.safeParse(b);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", "quotePublicId required");
    const idem = await idempotentGuard(ctx, "work-orders.create", parsed.data);
    if (idem.replay && idem.previous) {
      return new Response(idem.previous.body, {
        status: idem.previous.status,
        headers: { "content-type": "application/json", "x-idempotent-replay": "true" },
      });
    }
    const result = await createWorkOrderFromQuote({
      orgId: agent.orgId,
      agentId: agent.agentId,
      quotePublicId: parsed.data.quotePublicId,
      actor: { kind: "AGENT", id: agent.agentId },
    });
    await idempotentStore(ctx, 200, { workOrder: { publicId: result.workOrder.publicId } });
    return ok(result);
  }

  // ── user mode (manual purchase by an operator on behalf of an agent) ──
  const p = await requireOrgUser();
  if (p.role === "VIEWER") throw new AppError("FORBIDDEN", "Viewers cannot create purchases");
  const parsed = createSchema.safeParse(b);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "quotePublicId required");
  // user-initiated purchases act through a named agent context
  const agent = await db.agent.findFirst({
    where: { orgId: p.orgId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!agent) throw new AppError("VALIDATION_ERROR", "No ACTIVE agent in the organisation to attach this purchase to");
  const idem = await idempotentGuard(ctx, "work-orders.create", parsed.data);
  if (idem.replay && idem.previous) {
    return new Response(idem.previous.body, {
      status: idem.previous.status,
      headers: { "content-type": "application/json", "x-idempotent-replay": "true" },
    });
  }
  const result = await createWorkOrderFromQuote({
    orgId: p.orgId,
    agentId: agent.id,
    quotePublicId: parsed.data.quotePublicId,
    actor: { kind: "USER", id: p.userId, role: p.role },
  });
  await idempotentStore(ctx, 200, { workOrder: { publicId: result.workOrder.publicId } });
  return ok(result);
});
