// ORZARYN — approval centre (Stage 18/9): pending human approvals
import { api } from "@/lib/api";
import { ok } from "@/lib/errors";
import { requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = api(async () => {
  const p = await requireOrgUser();
  const pending = await db.workOrder.findMany({
    where: { orgId: p.orgId, state: "PENDING_APPROVAL" },
    include: {
      agent: { select: { name: true } },
      provider: { select: { name: true, status: true } },
      service: { select: { title: true, category: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const recentlyDecided = await db.workOrder.findMany({
    where: { orgId: p.orgId, approvalStatus: { in: ["APPROVED", "REJECTED"] }, state: { in: ["APPROVED", "REJECTED"] } },
    include: { agent: { select: { name: true } }, provider: { select: { name: true } }, service: { select: { title: true } } },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  return ok({ pending, recentlyDecided });
});
