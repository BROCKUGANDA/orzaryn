// ORZARYN — reports (Stage 15/18): settlement history + audit export
import { api } from "@/lib/api";
import { ok } from "@/lib/errors";
import { requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx) => {
  const p = await requireOrgUser();
  const format = ctx.req.nextUrl?.searchParams.get("format");
  const receipts = await db.settlementReceipt.findMany({
    where: { workOrder: { orgId: p.orgId } },
    include: {
      workOrder: {
        select: { publicId: true, provider: { select: { name: true } }, service: { select: { title: true } }, agent: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  if (format === "csv") {
    const header = "receiptId,timestamp,kind,workOrder,provider,service,agent,grossAmount,feeAmount,netAmount,asset,network,chainRef";
    const rows = receipts.map((r) =>
      [r.publicId, r.createdAt.toISOString(), r.kind, r.workOrder.publicId, r.workOrder.provider.name, r.workOrder.service.title, r.workOrder.agent.name, r.grossAmount.toString(), r.feeAmount.toString(), r.netAmount.toString(), r.asset, r.network, r.chainRef ?? ""]
        .map((v) => `"${v}"`)
        .join(","),
    );
    await audit({ orgId: p.orgId, actorType: "USER", actorId: p.userId, action: "reports.exported", resourceType: "settlement_receipts", resourceId: p.orgId });
    return new Response([header, ...rows].join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="orzaryn-settlements-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const auditLogs = await db.auditLog.findMany({
    where: { orgId: p.orgId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const policyDenied = await db.auditLog.count({ where: { orgId: p.orgId, action: "workorder.create.denied" } });
  return ok({ receipts, auditLogs, policyDenied });
});
