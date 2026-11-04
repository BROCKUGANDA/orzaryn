// ORZARYN — agent lifecycle (Stage 8): get + status transitions.
// RULES: an agent cannot grant permissions to itself; revocation stops new
// purchases immediately (enforced in policy engine + assertAgentCanPurchase).
import { z } from "zod";
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { revokeUserSessions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  action: z.enum(["activate", "suspend", "revoke", "set_signer"]),
  reason: z.string().max(300).optional(),
  signerAddress: z.string().min(32).max(50).optional(),
});

export const GET = api(async (ctx) => {
  const p = await requireOrgUser();
  const id = ctx.req.nextUrl?.pathname?.split("/")[3] ?? "";
  const agent = await db.agent.findFirst({
    where: { id, orgId: p.orgId },
    include: {
      apiKeys: { select: { keyId: true, status: true, lastUsedAt: true, createdAt: true } },
      mandates: true,
      _count: { select: { workOrders: true } },
    },
  });
  if (!agent) throw new AppError("NOT_FOUND", "Agent not found");
  const recentWorkOrders = await db.workOrder.findMany({
    where: { agentId: id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return ok({ agent, recentWorkOrders });
});

export const PATCH = api(async (ctx) => {
  const p = await requireOrgUser();
  if (p.role !== "OWNER" && p.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "Only OWNER/ADMIN can change agent status");
  }
  const id = ctx.req.nextUrl?.pathname?.split("/")[3] ?? "";
  const agent = await db.agent.findFirst({ where: { id, orgId: p.orgId } });
  if (!agent) throw new AppError("NOT_FOUND", "Agent not found");

  const b = await ctx.body<unknown>();
  const parsed = patchSchema.safeParse(b);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten().fieldErrors);

  let updated = agent;
  switch (parsed.data.action) {
    case "activate":
      if (agent.status === "REVOKED") throw new AppError("INVALID_TRANSITION", "A revoked agent cannot be reactivated; register a new agent");
      updated = await db.agent.update({ where: { id: agent.id }, data: { status: "ACTIVE", statusReason: parsed.data.reason } });
      break;
    case "suspend":
      updated = await db.agent.update({ where: { id: agent.id }, data: { status: "SUSPENDED", statusReason: parsed.data.reason } });
      break;
    case "revoke":
      updated = await db.agent.update({
        where: { id: agent.id },
        data: { status: "REVOKED", statusReason: parsed.data.reason, revokedAt: new Date() },
      });
      // immediate effect: revoke agent API keys and any sessions
      await db.apiKey.updateMany({ where: { agentId: agent.id, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
      break;
    case "set_signer":
      if (!parsed.data.signerAddress) throw new AppError("VALIDATION_ERROR", "signerAddress required");
      updated = await db.agent.update({
        where: { id: agent.id },
        data: { signerAddress: parsed.data.signerAddress, signerVerifiedAt: new Date() },
      });
      break;
  }
  await audit({
    orgId: p.orgId, actorType: "USER", actorId: p.userId,
    action: `agent.${parsed.data.action}`, resourceType: "agent", resourceId: agent.id,
    metadata: { reason: parsed.data.reason }, requestId: ctx.requestId,
  });
  return ok(updated);
});
