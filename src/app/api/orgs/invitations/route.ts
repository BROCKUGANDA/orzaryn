// ORZARYN — members & invitations (Stage 7)
import { z } from "zod";
import { randomToken } from "@/lib/crypto";
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ROLES } from "@/lib/rbac";
import { sha256 } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export const GET = api(async () => {
  const p = await requireOrgUser();
  const members = await db.membership.findMany({
    where: { orgId: p.orgId },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  const invitations = await db.invitation.findMany({
    where: { orgId: p.orgId, status: "PENDING" },
  });
  const wallets = await db.walletLink.findMany({
    where: { user: { memberships: { some: { orgId: p.orgId } } } },
  });
  return ok({
    members: members.map((m) => ({ ...m.user, role: m.role, joinedAt: m.createdAt })),
    invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt })),
    walletLinks: wallets.map((w) => ({ userId: w.userId, address: w.address, verifiedAt: w.verifiedAt })),
  });
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(ROLES),
});

export const POST = api(async (ctx) => {
  const p = await requireOrgUser();
  if (p.role !== "OWNER" && p.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "Only OWNER/ADMIN can invite members");
  }
  const b = await ctx.body<unknown>();
  const parsed = inviteSchema.safeParse(b);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Invalid invitation", parsed.error.flatten().fieldErrors);
  const token = randomToken(24);
  const invitation = await db.invitation.create({
    data: {
      orgId: p.orgId,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      tokenHash: sha256(token),
      invitedBy: p.userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000),
    },
  });
  await audit({ orgId: p.orgId, actorType: "USER", actorId: p.userId, action: "member.invited", resourceType: "invitation", resourceId: invitation.id, metadata: { role: parsed.data.role }, requestId: ctx.requestId });
  // Single-use token returned once over TLS; email delivery is a deployment concern (deferred, PRD §14).
  return ok({ invitationId: invitation.id, acceptToken: token, expiresAt: invitation.expiresAt });
});
