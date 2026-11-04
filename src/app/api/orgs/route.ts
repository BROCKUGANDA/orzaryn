// ORZARYN — organisations: create/list (Stage 7)
import { z } from "zod";
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits, hyphens"),
});

export const GET = api(async (ctx) => {
  const p = await requireUser();
  const memberships = await db.membership.findMany({
    where: { userId: p.userId },
    include: { org: true },
  });
  return ok(memberships.map((m) => ({ ...m.org, role: m.role })));
});

export const POST = api(async (ctx) => {
  const p = await requireUser();
  const b = await ctx.body<unknown>();
  const parsed = createSchema.safeParse(b);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid organisation payload", parsed.error.flatten().fieldErrors);
  }
  const exists = await db.organisation.findUnique({ where: { slug: parsed.data.slug } });
  if (exists) throw new AppError("CONFLICT", "An organisation with this slug already exists");
  const org = await db.organisation.create({ data: { name: parsed.data.name, slug: parsed.data.slug } });
  await db.membership.create({
    data: { userId: p.userId, orgId: org.id, role: "OWNER" },
  });
  await audit({ orgId: org.id, actorType: "USER", actorId: p.userId, action: "org.created", resourceType: "organisation", resourceId: org.id, requestId: ctx.requestId });
  return ok(org);
});
