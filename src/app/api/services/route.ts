// ORZARYN — service listings (Stage 10)
import { z } from "zod";
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { parseToMinor } from "@/lib/money";
import { canonicalJson, sha256 } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  providerId: z.string().min(1),
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(1000),
  category: z.enum(["DATA", "DEVELOPMENT", "CONTENT", "RESEARCH", "INTEGRATION", "OPS"]),
  pricingModel: z.enum(["FIXED", "QUOTED"]).default("FIXED"),
  basePrice: z.string().regex(/^\d+(\.\d{1,6})?$/).default("0"),
  slaHours: z.number().int().min(1).max(720).default(72),
  acceptanceTerms: z.string().min(10).max(1000).default("Buyer accepts on evidence review."),
});

export const GET = api(async (ctx) => {
  await requireOrgUser();
  const providerId = ctx.req.nextUrl?.searchParams.get("providerId") ?? undefined;
  const category = ctx.req.nextUrl?.searchParams.get("category") ?? undefined;
  const services = await db.service.findMany({
    where: {
      ...(providerId ? { providerId } : {}),
      ...(category ? { category } : {}),
      status: "LISTED",
    },
    include: { provider: { select: { id: true, name: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });
  return ok(services);
});

export const POST = api(async (ctx) => {
  const p = await requireOrgUser();
  const b = await ctx.body<unknown>();
  const parsed = createSchema.safeParse(b);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Invalid service payload", parsed.error.flatten().fieldErrors);
  const d = parsed.data;
  const provider = await db.provider.findUnique({ where: { id: d.providerId } });
  if (!provider) throw new AppError("NOT_FOUND", "Provider not found");
  if (provider.status !== "APPROVED") {
    throw new AppError("PROVIDER_NOT_APPROVED", "Only APPROVED providers can publish services");
  }
  const terms = canonicalJson({ title: d.title, category: d.category, pricingModel: d.pricingModel, basePrice: d.basePrice, slaHours: d.slaHours, acceptanceTerms: d.acceptanceTerms });
  const service = await db.service.create({
    data: {
      providerId: d.providerId,
      title: d.title,
      description: d.description,
      category: d.category,
      pricingModel: d.pricingModel,
      basePrice: parseToMinor(d.basePrice),
      slaHours: d.slaHours,
      acceptanceTerms: d.acceptanceTerms,
      status: "LISTED",
      termsHash: sha256(terms),
    },
  });
  await audit({ actorType: "USER", actorId: p.userId, action: "service.listed", resourceType: "service", resourceId: service.id, requestId: ctx.requestId });
  return ok(service);
});
