// ORZARYN — Agent Registry (Stage 8): list + register
import { z } from "zod";
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  name: z.string().min(2).max(60).regex(/^[a-z0-9][a-z0-9._-]*$/, "lowercase id-style name"),
  developer: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  signerAddress: z.string().min(32).max(50).optional(),
});

export const GET = api(async () => {
  const p = await requireOrgUser();
  const agents = await db.agent.findMany({
    where: { orgId: p.orgId },
    include: {
      apiKeys: { where: { status: "ACTIVE" }, select: { keyId: true, lastUsedAt: true } },
      mandates: { where: { status: "ACTIVE" }, select: { id: true, availableBudget: true, aggregateBudget: true } },
      _count: { select: { workOrders: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return ok(agents);
});

export const POST = api(async (ctx) => {
  const p = await requireOrgUser();
  if (p.role === "VIEWER" || p.role === "OPERATOR") {
    throw new AppError("FORBIDDEN", "Only OWNER/ADMIN/TREASURER/APPROVER can register agents");
  }
  const b = await ctx.body<unknown>();
  const parsed = registerSchema.safeParse(b);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Invalid agent payload", parsed.error.flatten().fieldErrors);

  const exists = await db.agent.findUnique({ where: { orgId_name: { orgId: p.orgId, name: parsed.data.name } } });
  if (exists) throw new AppError("CONFLICT", "An agent with this name already exists in the organisation");

  const agent = await db.agent.create({
    data: {
      orgId: p.orgId,
      name: parsed.data.name,
      developer: parsed.data.developer,
      description: parsed.data.description,
      signerAddress: parsed.data.signerAddress,
      status: parsed.data.signerAddress ? "ACTIVE" : "REGISTERED",
      signerVerifiedAt: parsed.data.signerAddress ? new Date() : null,
      createdBy: p.userId,
    },
  });
  await audit({
    orgId: p.orgId, actorType: "USER", actorId: p.userId,
    action: "agent.registered", resourceType: "agent", resourceId: agent.id,
    metadata: { name: agent.name, developer: agent.developer }, requestId: ctx.requestId,
  });
  return ok(agent);
});
