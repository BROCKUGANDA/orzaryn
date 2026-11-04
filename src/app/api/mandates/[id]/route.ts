// ORZARYN — mandate detail + revoke (immediate effect on new purchases)
import { z } from "zod";
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx) => {
  const p = await requireOrgUser();
  const id = ctx.req.nextUrl?.pathname?.split("/")[3] ?? "";
  const mandate = await db.mandate.findFirst({
    where: { id, orgId: p.orgId },
    include: { agent: true, reservations: { where: { status: "RESERVED" } } },
  });
  if (!mandate) throw new AppError("NOT_FOUND", "Mandate not found");
  return ok(mandate);
});

const patchSchema = z.object({ action: z.literal("revoke"), reason: z.string().min(3).max(300) });

export const PATCH = api(async (ctx) => {
  const p = await requireOrgUser();
  if (p.role !== "OWNER" && p.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "Only OWNER/ADMIN can revoke mandates");
  }
  const id = ctx.req.nextUrl?.pathname?.split("/")[3] ?? "";
  const mandate = await db.mandate.findFirst({ where: { id, orgId: p.orgId } });
  if (!mandate) throw new AppError("NOT_FOUND", "Mandate not found");
  const b = await ctx.body<unknown>();
  const parsed = patchSchema.safeParse(b);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten().fieldErrors);

  const updated = await db.mandate.update({
    where: { id: mandate.id },
    data: { status: "REVOKED", revokedAt: new Date(), revokeReason: parsed.data.reason },
  });
  await audit({
    orgId: p.orgId, actorType: "USER", actorId: p.userId,
    action: "mandate.revoked", resourceType: "mandate", resourceId: mandate.id,
    metadata: { reason: parsed.data.reason }, requestId: ctx.requestId,
  });
  return ok(updated);
});
