// ORZARYN — provider review (platform operators) + detail (Stage 10/15)
import { z } from "zod";
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx) => {
  await requireOrgUser();
  const id = ctx.req.nextUrl?.pathname?.split("/")[3] ?? "";
  const provider = await db.provider.findUnique({
    where: { id },
    include: { services: true, _count: { select: { workOrders: true } } },
  });
  if (!provider) throw new AppError("NOT_FOUND", "Provider not found");
  return ok(provider);
});

const reviewSchema = z.object({
  action: z.enum(["start_review", "approve", "reject", "suspend", "reinstate", "verify_wallet"]),
  note: z.string().max(500).optional(),
});

export const PATCH = api(async (ctx) => {
  const p = await requireOrgUser();
  if (p.role !== "OWNER" && p.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "Only OWNER/ADMIN can review providers");
  }
  const id = ctx.req.nextUrl?.pathname?.split("/")[3] ?? "";
  const provider = await db.provider.findUnique({ where: { id } });
  if (!provider) throw new AppError("NOT_FOUND", "Provider not found");
  const b = await ctx.body<unknown>();
  const parsed = reviewSchema.safeParse(b);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten().fieldErrors);

  let status = provider.status;
  let walletVerifiedAt = provider.walletVerifiedAt;
  switch (parsed.data.action) {
    case "start_review":
      if (provider.status !== "SUBMITTED") throw new AppError("INVALID_TRANSITION", `Cannot start review from ${provider.status}`);
      status = "UNDER_REVIEW";
      break;
    case "approve":
      if (provider.status !== "UNDER_REVIEW") throw new AppError("INVALID_TRANSITION", "Provider must be UNDER_REVIEW to approve");
      status = "APPROVED";
      break;
    case "reject":
      if (provider.status !== "UNDER_REVIEW") throw new AppError("INVALID_TRANSITION", "Provider must be UNDER_REVIEW to reject");
      status = "REJECTED";
      break;
    case "suspend":
      if (provider.status !== "APPROVED") throw new AppError("INVALID_TRANSITION", "Only APPROVED providers can be suspended");
      status = "SUSPENDED";
      break;
    case "reinstate":
      if (provider.status !== "SUSPENDED") throw new AppError("INVALID_TRANSITION", "Only SUSPENDED providers can be reinstated");
      status = "APPROVED";
      break;
    case "verify_wallet":
      // In production this requires a signed challenge from the provider wallet.
      walletVerifiedAt = new Date();
      break;
  }
  const updated = await db.provider.update({
    where: { id: provider.id },
    data: { status, walletVerifiedAt, reviewedBy: p.userId, reviewedAt: new Date(), reviewNote: parsed.data.note },
  });
  await audit({
    orgId: p.orgId, actorType: "USER", actorId: p.userId,
    action: `provider.${parsed.data.action}`, resourceType: "provider", resourceId: provider.id,
    metadata: { note: parsed.data.note }, requestId: ctx.requestId,
  });
  return ok(updated);
});
