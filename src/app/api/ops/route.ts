// ORZARYN — operations console API (Stage 22): metrics, kill switch, DLQ replay
import { z } from "zod";
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getChainProvider } from "@/lib/chain/alchemy-solana";
import { processInboxOnce } from "@/lib/events";

export const dynamic = "force-dynamic";

export const GET = api(async () => {
  const p = await requireOrgUser();
  if (p.role !== "OWNER" && p.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "Operations console is restricted to OWNER/ADMIN");
  }
  const [control, chainHealth, caps] = await Promise.all([
    db.systemControl.findUnique({ where: { id: "global" } }),
    getChainProvider().health(),
    Promise.resolve(getChainProvider().capabilities()),
  ]);
  const [woByState, escrowedSum, deadLetters, pendingWebhooks, outboxPending, queueLag] = await Promise.all([
    db.workOrder.groupBy({ by: ["state"], _count: { _all: true } }),
    db.workOrder.aggregate({ _sum: { amount: true }, where: { fundingStatus: "ESCROWED" } }),
    db.webhookEvent.count({ where: { status: "DEAD" } }),
    db.webhookEvent.count({ where: { status: { in: ["PENDING", "FAILED", "PROCESSING"] } } }),
    db.outboxEvent.count({ where: { status: "PENDING" } }),
    db.eventCheckpoint.findUnique({ where: { source: "inbox" } }),
  ]);
  const deadEvents = await db.webhookEvent.findMany({ where: { status: "DEAD" }, take: 20, orderBy: { receivedAt: "desc" } });
  return ok({
    paused: control?.paused ?? false,
    pauseReason: control?.reason,
    chain: { health: chainHealth, capabilities: caps },
    workOrdersByState: woByState.map((s) => ({ state: s.state, count: s._count._all })),
    escrowedTotal: escrowedSum._sum.amount ?? 0n,
    events: { deadLetters, pendingWebhooks, outboxPending, lastCheckpoint: queueLag?.cursor },
    deadEvents,
  });
});

const actionSchema = z.object({
  action: z.enum(["pause", "resume", "replay_dead_letter", "reconcile"]),
  reason: z.string().min(4).max(300).optional(),
});

export const POST = api(async (ctx) => {
  const p = await requireOrgUser();
  if (p.role !== "OWNER" && p.role !== "ADMIN") throw new AppError("FORBIDDEN", "Restricted");
  const b = await ctx.body<unknown>();
  const parsed = actionSchema.safeParse(b);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Invalid ops action", parsed.error.flatten().fieldErrors);

  switch (parsed.data.action) {
    case "pause": {
      if (!parsed.data.reason) throw new AppError("VALIDATION_ERROR", "A reason is required to pause the system");
      await db.systemControl.upsert({
        where: { id: "global" },
        create: { id: "global", paused: true, reason: parsed.data.reason, updatedBy: p.userId },
        update: { paused: true, reason: parsed.data.reason, updatedBy: p.userId },
      });
      await audit({ actorType: "USER", actorId: p.userId, action: "ops.paused", resourceType: "system", resourceId: "global", metadata: { reason: parsed.data.reason }, requestId: ctx.requestId });
      return ok({ paused: true });
    }
    case "resume": {
      await db.systemControl.upsert({
        where: { id: "global" },
        create: { id: "global", paused: false, updatedBy: p.userId },
        update: { paused: false, updatedBy: p.userId },
      });
      await audit({ actorType: "USER", actorId: p.userId, action: "ops.resumed", resourceType: "system", resourceId: "global", requestId: ctx.requestId });
      return ok({ paused: false });
    }
    case "replay_dead_letter": {
      const revived = await db.webhookEvent.updateMany({
        where: { status: "DEAD" },
        data: { status: "PENDING", attempts: 0, nextRetryAt: null, lastError: null },
      });
      await processInboxOnce();
      await audit({ actorType: "USER", actorId: p.userId, action: "ops.dlq_replayed", resourceType: "webhook_events", resourceId: "all", metadata: { count: revived.count }, requestId: ctx.requestId });
      return ok({ replayed: revived.count });
    }
    case "reconcile": {
      const { reconcileOnce } = await import("@/lib/events");
      const r = await reconcileOnce();
      await audit({ actorType: "USER", actorId: p.userId, action: "ops.reconcile", resourceType: "reconciliation", resourceId: "all", metadata: r, requestId: ctx.requestId });
      return ok(r);
    }
  }
});
