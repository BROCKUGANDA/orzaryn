// ORZARYN — work order detail (terms, money states, events, evidence, receipt)
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { escrowInvariant } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx) => {
  const p = await requireOrgUser();
  const publicId = ctx.req.nextUrl?.pathname?.split("/")[3] ?? "";
  const wo = await db.workOrder.findFirst({
    where: { publicId, orgId: p.orgId },
    include: {
      agent: { select: { name: true, developer: true } },
      provider: { select: { name: true, walletAddress: true, status: true } },
      service: { select: { title: true, category: true } },
      events: { orderBy: { seq: "asc" } },
      evidence: { orderBy: { version: "desc" } },
      dispute: true,
      receipts: true,
      reservation: true,
    },
  });
  if (!wo) throw new AppError("NOT_FOUND", "Work order not found");
  const invariant = await escrowInvariant(wo.id);
  return ok({ workOrder: wo, invariant });
});
