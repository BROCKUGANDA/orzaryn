// ORZARYN — provider directory (Stage 10): list + application.
// Controlled ecosystem: providers enter via application + review, never self-serve APPROVED.
import { z } from "zod";
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const applySchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().min(10).max(600),
  walletAddress: z.string().min(32).max(50),
  contactEmail: z.string().email(),
  website: z.string().url().optional(),
  categories: z.array(z.enum(["DATA", "DEVELOPMENT", "CONTENT", "RESEARCH", "INTEGRATION", "OPS"])).min(1),
});

export const GET = api(async (ctx) => {
  const p = await requireOrgUser();
  const statusFilter = ctx.req.nextUrl?.searchParams.get("status") ?? undefined;
  const providers = await db.provider.findMany({
    where: statusFilter ? { status: statusFilter } : undefined,
    include: { services: { where: { status: "LISTED" } }, _count: { select: { workOrders: true } } },
    orderBy: { createdAt: "desc" },
  });
  return ok(providers);
});

export const POST = api(async (ctx) => {
  const p = await requireOrgUser();
  const b = await ctx.body<unknown>();
  const parsed = applySchema.safeParse(b);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Invalid provider application", parsed.error.flatten().fieldErrors);

  const dup = await db.provider.findFirst({ where: { name: parsed.data.name, status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] } } });
  if (dup) throw new AppError("CONFLICT", "A provider with this name already exists (impersonation protection)");

  const provider = await db.provider.create({
    data: {
      orgId: p.orgId,
      name: parsed.data.name,
      description: parsed.data.description,
      walletAddress: parsed.data.walletAddress,
      walletVerifiedAt: null, // verified separately via signed challenge (wallet.verified)
      contactEmail: parsed.data.contactEmail,
      website: parsed.data.website,
      categories: JSON.stringify(parsed.data.categories),
      status: "SUBMITTED",
      submittedBy: p.userId,
    },
  });
  await audit({
    orgId: p.orgId, actorType: "USER", actorId: p.userId,
    action: "provider.applied", resourceType: "provider", resourceId: provider.id, requestId: ctx.requestId,
  });
  return ok(provider);
});
