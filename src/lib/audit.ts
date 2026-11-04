// ORZARYN — append-only audit log (Stage 7/20). Every privileged action lands here.
import { db } from "@/lib/db";

export type ActorType = "USER" | "AGENT" | "PROVIDER" | "SYSTEM";

export async function audit(entry: {
  orgId?: string | null;
  actorType: ActorType;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  requestId?: string | null;
}) {
  await db.auditLog.create({
    data: {
      orgId: entry.orgId ?? null,
      actorType: entry.actorType,
      actorId: entry.actorId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      metadata: JSON.stringify(entry.metadata ?? {}),
      ip: entry.ip ?? null,
      requestId: entry.requestId ?? null,
    },
  });
}
