// ORZARYN — deterministic policy engine (Stage 9).
// Pure decision logic + atomic budget reservation. Returns explicit decisions
// with reason codes. DEFAULT-DENY when a critical validation cannot complete.
import { db } from "@/lib/db";
import { AppError } from "./errors";

export type PolicyDecision = "APPROVE" | "REQUIRE_APPROVAL" | "DENY";

export type ReasonCode =
  | "SYSTEM_PAUSED"
  | "AGENT_NOT_ACTIVE"
  | "AGENT_REVOKED"
  | "ORG_SUSPENDED"
  | "MANDATE_NOT_FOUND"
  | "MANDATE_NOT_ACTIVE"
  | "MANDATE_EXPIRED"
  | "ASSET_MISMATCH"
  | "NETWORK_MISMATCH"
  | "PROVIDER_NOT_APPROVED"
  | "PROVIDER_NOT_ALLOWLISTED"
  | "SERVICE_CATEGORY_NOT_PERMITTED"
  | "SERVICE_NOT_LISTED"
  | "PER_PURCHASE_LIMIT_EXCEEDED"
  | "DAILY_LIMIT_EXCEEDED"
  | "WEEKLY_LIMIT_EXCEEDED"
  | "MONTHLY_LIMIT_EXCEEDED"
  | "INSUFFICIENT_BUDGET"
  | "CONCURRENCY_LIMIT_EXCEEDED"
  | "VELOCITY_LIMIT_EXCEEDED"
  | "WITHIN_MANDATE"
  | "AMOUNT_REQUIRES_APPROVAL"
  | "VALIDATION_ERROR";

export interface PolicyCheck {
  code: ReasonCode;
  passed: boolean;
  detail?: string;
}

export interface PolicyInput {
  agentId: string;
  mandateId: string;
  providerId: string;
  serviceId: string;
  serviceCategory: string;
  serviceStatus: string;
  providerStatus: string;
  asset: string;
  network: string;
  amountMinor: bigint;
}

export interface PolicyResult {
  decision: PolicyDecision;
  reasonCodes: ReasonCode[]; // ordered: blockers first
  checks: PolicyCheck[];
}

function dayStart(d = new Date()) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function weekStart(d = new Date()) {
  const x = dayStart(d);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); // Monday
  return x;
}
function monthStart(d = new Date()) {
  const x = dayStart(d);
  x.setUTCDate(1);
  return x;
}

/** Sum of committed+reserved spend for a mandate within a period (from work orders). */
async function spendSince(mandateId: string, since: Date): Promise<bigint> {
  const rows = await db.workOrder.aggregate({
    _sum: { amount: true },
    where: {
      agent: { mandates: { some: { id: mandateId } } },
      state: { in: ["PENDING_APPROVAL", "APPROVED", "FUNDED", "ACCEPTED", "DELIVERED", "IN_REVIEW"] },
      createdAt: { gte: since },
    },
  });
  return (rows._sum.amount ?? 0n) as bigint;
}

/**
 * Deterministic evaluation. Every check runs; a failed hard check → DENY with
 * its reason code first. If everything passes but the amount is at/above the
 * mandate's approval threshold → REQUIRE_APPROVAL; else APPROVE.
 */
export async function evaluatePolicy(input: PolicyInput): Promise<PolicyResult> {
  const checks: PolicyCheck[] = [];
  const blockers: ReasonCode[] = [];
  const add = (c: PolicyCheck) => {
    checks.push(c);
    if (!c.passed) blockers.push(c.code);
  };

  // 0. global pause
  const control = await db.systemControl.findUnique({ where: { id: "global" } });
  add({
    code: "SYSTEM_PAUSED",
    passed: !(control?.paused ?? false),
    detail: control?.paused ? control.reason ?? "Emergency pause active" : undefined,
  });

  // 1. agent + org status
  const agent = await db.agent.findUnique({ where: { id: input.agentId }, include: { org: true } });
  add({ code: "AGENT_NOT_ACTIVE", passed: !!agent && agent.status === "ACTIVE", detail: agent?.status });
  add({ code: "ORG_SUSPENDED", passed: !!agent && agent.org.status === "ACTIVE" });

  // 2. mandate
  const mandate = await db.mandate.findUnique({ where: { id: input.mandateId } });
  add({ code: "MANDATE_NOT_FOUND", passed: !!mandate && mandate.agentId === input.agentId });
  if (mandate) {
    add({ code: "MANDATE_NOT_ACTIVE", passed: mandate.status === "ACTIVE", detail: mandate.status });
    add({ code: "MANDATE_EXPIRED", passed: mandate.validUntil.getTime() > Date.now() });
    add({ code: "ASSET_MISMATCH", passed: mandate.asset === input.asset });
    add({ code: "NETWORK_MISMATCH", passed: mandate.network === input.network });
  }

  // 3. provider + service permissions
  add({
    code: "PROVIDER_NOT_APPROVED",
    passed: input.providerStatus === "APPROVED",
    detail: input.providerStatus,
  });
  add({ code: "SERVICE_NOT_LISTED", passed: input.serviceStatus === "LISTED" });
  if (mandate) {
    const allow = JSON.parse(mandate.providerAllowlist) as string[];
    if (allow.length > 0) {
      add({ code: "PROVIDER_NOT_ALLOWLISTED", passed: allow.includes(input.providerId) });
    }
    const cats = JSON.parse(mandate.serviceCategories) as string[];
    if (cats.length > 0) {
      add({ code: "SERVICE_CATEGORY_NOT_PERMITTED", passed: cats.includes(input.serviceCategory) });
    }
  }

  // hard blockers end evaluation here (still deterministic; no budget mutation)
  if (blockers.length > 0 || !mandate) {
    return { decision: "DENY", reasonCodes: blockers.length ? blockers : ["MANDATE_NOT_FOUND"], checks };
  }

  // 4. amount limits
  add({
    code: "PER_PURCHASE_LIMIT_EXCEEDED",
    passed: input.amountMinor <= mandate.perPurchaseLimit,
    detail: `${input.amountMinor} > ${mandate.perPurchaseLimit}`,
  });

  const [daily, weekly, monthly] = await Promise.all([
    spendSince(mandate.id, dayStart()),
    spendSince(mandate.id, weekStart()),
    spendSince(mandate.id, monthStart()),
  ]);
  add({ code: "DAILY_LIMIT_EXCEEDED", passed: daily + input.amountMinor <= mandate.dailyLimit, detail: `${daily}+${input.amountMinor}` });
  add({ code: "WEEKLY_LIMIT_EXCEEDED", passed: weekly + input.amountMinor <= mandate.weeklyLimit });
  add({ code: "MONTHLY_LIMIT_EXCEEDED", passed: monthly + input.amountMinor <= mandate.monthlyLimit });

  // 5. aggregate budget (informational here; enforced atomically at reservation)
  const available = mandate.availableBudget;
  add({ code: "INSUFFICIENT_BUDGET", passed: available >= input.amountMinor, detail: `available=${available}` });

  // 6. concurrency + velocity
  const activeCount = await db.workOrder.count({
    where: { agentId: input.agentId, state: { in: ["PENDING_APPROVAL", "APPROVED", "FUNDED", "ACCEPTED", "DELIVERED", "IN_REVIEW"] } },
  });
  add({ code: "CONCURRENCY_LIMIT_EXCEEDED", passed: activeCount < mandate.maxConcurrent, detail: `${activeCount}/${mandate.maxConcurrent}` });
  const hourAgo = new Date(Date.now() - 3_600_000);
  const hourly = await db.workOrder.count({ where: { agentId: input.agentId, createdAt: { gte: hourAgo } } });
  add({ code: "VELOCITY_LIMIT_EXCEEDED", passed: hourly < mandate.maxPerHour });

  if (blockers.length > 0) {
    return { decision: "DENY", reasonCodes: blockers, checks };
  }

  if (mandate.approvalThreshold !== null && input.amountMinor >= mandate.approvalThreshold) {
    return { decision: "REQUIRE_APPROVAL", reasonCodes: ["AMOUNT_REQUIRES_APPROVAL", "WITHIN_MANDATE"], checks };
  }
  return { decision: "APPROVE", reasonCodes: ["WITHIN_MANDATE"], checks };
}

/**
 * Atomic budget reservation (Stage 9 / ADR-005).
 * Conditional decrement — two concurrent requests can never consume the same
 * budget: the guard is part of the UPDATE's WHERE clause.
 */
export async function reserveBudget(mandateId: string, amountMinor: bigint): Promise<void> {
  if (amountMinor <= 0n) throw new AppError("VALIDATION_ERROR", "Reservation amount must be positive");
  const res = await db.mandate.updateMany({
    where: { id: mandateId, availableBudget: { gte: amountMinor } },
    data: {
      availableBudget: { decrement: amountMinor },
      reservedTotal: { increment: amountMinor },
    },
  });
  if (res.count !== 1) {
    throw new AppError("INSUFFICIENT_BUDGET", "Budget reservation failed (insufficient or concurrently consumed)");
  }
}

export async function commitReservation(mandateId: string, amountMinor: bigint): Promise<void> {
  await db.mandate.updateMany({
    where: { id: mandateId, reservedTotal: { gte: amountMinor } },
    data: { reservedTotal: { decrement: amountMinor }, spentTotal: { increment: amountMinor } },
  });
}

export async function releaseReservation(mandateId: string, amountMinor: bigint): Promise<void> {
  await db.mandate.updateMany({
    where: { id: mandateId, reservedTotal: { gte: amountMinor } },
    data: { reservedTotal: { decrement: amountMinor }, availableBudget: { increment: amountMinor } },
  });
}
