// ORZARYN — agent API keys (Stage 8/16). Secret shown ONCE; only hash stored.
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { apiKeyId, apiKeySecret } from "@/lib/ids";
import { sha256 } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx) => {
  const p = await requireOrgUser();
  const agentId = ctx.req.nextUrl?.pathname?.split("/")[3] ?? "";
  const agent = await db.agent.findFirst({ where: { id: agentId, orgId: p.orgId } });
  if (!agent) throw new AppError("NOT_FOUND", "Agent not found");
  const keys = await db.apiKey.findMany({
    where: { agentId },
    select: { keyId: true, status: true, lastUsedAt: true, createdAt: true, revokedAt: true },
  });
  return ok(keys);
});

export const POST = api(async (ctx) => {
  const p = await requireOrgUser();
  if (p.role !== "OWNER" && p.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "Only OWNER/ADMIN can issue agent keys");
  }
  const agentId = ctx.req.nextUrl?.pathname?.split("/")[3] ?? "";
  const agent = await db.agent.findFirst({ where: { id: agentId, orgId: p.orgId } });
  if (!agent) throw new AppError("NOT_FOUND", "Agent not found");
  if (agent.status === "REVOKED") throw new AppError("AGENT_REVOKED", "Cannot issue keys for a revoked agent");

  const keyId = apiKeyId();
  const secret = apiKeySecret();
  await db.apiKey.create({
    data: { agentId, keyId, secretHash: sha256(secret), status: "ACTIVE", scopes: "agent" },
  });
  await audit({
    orgId: p.orgId, actorType: "USER", actorId: p.userId,
    action: "agent.key.issued", resourceType: "api_key", resourceId: keyId, requestId: ctx.requestId,
  });
  // The full key (keyId.secret) is displayed exactly once — hash-only storage server-side.
  return ok({ keyId, secret, fullKey: `${keyId}.${secret}` });
});
