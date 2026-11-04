// ORZARYN — disputes (Stage 11/14)
import { api } from "@/lib/api";
import { ok } from "@/lib/errors";
import { requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = api(async () => {
  const p = await requireOrgUser();
  const disputes = await db.dispute.findMany({
    where: { workOrder: { orgId: p.orgId } },
    include: {
      workOrder: {
        select: {
          publicId: true, amount: true, asset: true, state: true, fundingStatus: true,
          service: { select: { title: true } },
          provider: { select: { name: true } },
          agent: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return ok(disputes);
});
