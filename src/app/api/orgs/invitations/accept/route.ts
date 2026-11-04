// ORZARYN — accept an invitation (single-use token)
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { requireUser, setActiveOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export const POST = api(async (ctx) => {
  const p = await requireUser();
  const b = await ctx.body<{ token: string }>();
  if (!b.token) throw new AppError("VALIDATION_ERROR", "token required");
  const invitation = await db.invitation.findUnique({ where: { tokenHash: sha256(b.token) } });
  if (!invitation) throw new AppError("NOT_FOUND", "Invitation not found");
  if (invitation.status !== "PENDING") throw new AppError("CONFLICT", `Invitation is ${invitation.status}`);
  if (invitation.expiresAt.getTime() < Date.now()) throw new AppError("CONFLICT", "Invitation expired");

  const consumed = await db.invitation.updateMany({
    where: { id: invitation.id, status: "PENDING" },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });
  if (consumed.count !== 1) throw new AppError("CONFLICT", "Invitation already used");

  await db.membership.upsert({
    where: { userId_orgId: { userId: p.userId, orgId: invitation.orgId } },
    create: { userId: p.userId, orgId: invitation.orgId, role: invitation.role },
    update: { role: invitation.role },
  });
  await setActiveOrg(p.userId, invitation.orgId);
  await audit({ orgId: invitation.orgId, actorType: "USER", actorId: p.userId, action: "member.joined", resourceType: "organisation", resourceId: invitation.orgId, metadata: { role: invitation.role }, requestId: ctx.requestId });
  return ok({ orgId: invitation.orgId, role: invitation.role });
});
