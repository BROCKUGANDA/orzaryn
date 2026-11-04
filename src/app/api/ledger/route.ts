// ORZARYN — ledger views + CSV export (Stage 15)
import { api } from "@/lib/api";
import { ok } from "@/lib/errors";
import { requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sumByType } from "@/lib/ledger";
import { formatFromMinor } from "@/lib/money";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx) => {
  const p = await requireOrgUser();
  const format = ctx.req.nextUrl?.searchParams.get("format");
  const workOrderId = ctx.req.nextUrl?.searchParams.get("workOrderId") ?? undefined;
  const entries = await db.ledgerEntry.findMany({
    where: { orgId: p.orgId, ...(workOrderId ? { workOrderId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  if (format === "csv") {
    const header = "id,timestamp,entryType,direction,account,amount,asset,workOrderId,sourceType,sourceId,memo";
    const rows = entries.map((e) =>
      [e.id, e.createdAt.toISOString(), e.entryType, e.direction, e.account, formatFromMinor(e.amount), e.asset, e.workOrderId ?? "", e.sourceType, e.sourceId, (e.memo ?? "").replace(/"/g, "'")]
        .map((v) => `"${v}"`)
        .join(","),
    );
    const csv = [header, ...rows].join("\n");
    await audit({ orgId: p.orgId, actorType: "USER", actorId: p.userId, action: "ledger.exported", resourceType: "ledger", resourceId: p.orgId });
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="orzaryn-ledger-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const totals = await sumByType(p.orgId);
  return ok({ entries, totals });
});
