// ORZARYN — work-order engine (Stage 11) + settlement integration (Stage 15)
// + evidence hooks (Stage 14). Server-side transition validation; every action
// is attributed to an authorised principal; illegal transitions rejected.
import { db } from "@/lib/db";
import { AppError } from "./errors";
import { logger } from "./logger";
import { audit } from "./audit";
import { canonicalJson, sha256 } from "./crypto";
import { post, ledgerIdempotencyKey, escrowInvariant } from "./ledger";
import { evaluatePolicy, reserveBudget, commitReservation, releaseReservation } from "./policy";
import { publishToOutbox } from "./events";
import { getChainProvider } from "./chain/alchemy-solana";
import { env } from "./env";
import { woPublicId, receiptPublicId, disputePublicId } from "./ids";
import { formatFromMinor } from "./money";

const log = logger("workorder");

export type WoState =
  | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "FUNDED" | "ACCEPTED"
  | "DELIVERED" | "IN_REVIEW" | "COMPLETED" | "DISPUTED" | "REFUNDED" | "CANCELLED";

export type WoAction =
  | "approve" | "reject" | "cancel" | "fund" | "accept"
  | "deliver" | "review_start" | "review_accept" | "review_reject"
  | "request_revision" | "open_dispute" | "resolve_dispute" | "refund";

export type Actor =
  | { kind: "USER"; id: string; role: string; orgId?: string }
  | { kind: "AGENT"; id: string }
  | { kind: "PROVIDER"; id: string }
  | { kind: "SYSTEM"; id: string };

/** Normative transition table (PRD §7). */
const TRANSITIONS: Record<WoAction, { from: WoState[]; to: WoState; actors: Actor["kind"][] }> = {
  approve: { from: ["PENDING_APPROVAL"], to: "APPROVED", actors: ["USER"] },
  reject: { from: ["PENDING_APPROVAL"], to: "REJECTED", actors: ["USER"] },
  cancel: { from: ["PENDING_APPROVAL", "APPROVED"], to: "CANCELLED", actors: ["USER", "AGENT"] },
  fund: { from: ["APPROVED"], to: "FUNDED", actors: ["USER"] },
  accept: { from: ["FUNDED"], to: "ACCEPTED", actors: ["PROVIDER"] },
  deliver: { from: ["ACCEPTED"], to: "DELIVERED", actors: ["PROVIDER"] },
  review_start: { from: ["DELIVERED"], to: "IN_REVIEW", actors: ["USER"] },
  review_accept: { from: ["IN_REVIEW"], to: "COMPLETED", actors: ["USER"] },
  review_reject: { from: ["IN_REVIEW"], to: "DISPUTED", actors: ["USER"] },
  request_revision: { from: ["IN_REVIEW"], to: "IN_REVIEW", actors: ["USER"] },
  open_dispute: { from: ["FUNDED", "ACCEPTED", "DELIVERED", "IN_REVIEW"], to: "DISPUTED", actors: ["USER", "PROVIDER"] },
  resolve_dispute: { from: ["DISPUTED"], to: "COMPLETED", actors: ["USER"] }, // terminal side decided by outcome param
  refund: { from: ["DISPUTED"], to: "REFUNDED", actors: ["USER"] },
};

const APPROVE_ROLES = ["OWNER", "ADMIN", "APPROVER"];
const TREASURY_ROLES = ["OWNER", "TREASURER"];

function actorAllowed(actor: Actor, action: WoAction): boolean {
  const t = TRANSITIONS[action];
  if (!t.actors.includes(actor.kind)) return false;
  if (actor.kind === "USER") {
    switch (action) {
      case "approve": case "reject": case "review_start":
      case "review_accept": case "review_reject": case "request_revision":
        return APPROVE_ROLES.includes(actor.role);
      case "fund": case "refund": case "resolve_dispute":
        return TREASURY_ROLES.includes(actor.role) || APPROVE_ROLES.includes(actor.role);
      case "cancel": case "open_dispute":
        return actor.role !== "VIEWER";
      default:
        return false;
    }
  }
  return true;
}

async function nextSeq(workOrderId: string): Promise<number> {
  const last = await db.workOrderEvent.findFirst({ where: { workOrderId }, orderBy: { seq: "desc" } });
  return (last?.seq ?? 0) + 1;
}

async function recordEvent(wo: { id: string; state: string }, action: WoAction, from: WoState, to: WoState, actor: Actor, reason?: string, metadata?: Record<string, unknown>) {
  await db.workOrderEvent.create({
    data: {
      workOrderId: wo.id,
      seq: await nextSeq(wo.id),
      fromState: from,
      toState: to,
      action,
      actorType: actor.kind,
      actorId: actor.id,
      reason: reason ?? null,
      metadata: JSON.stringify(metadata ?? {}),
    },
  });
}

// ── creation ─────────────────────────────────────────────────────────────────

export interface CreateWorkOrderInput {
  orgId: string;
  agentId: string;
  quotePublicId: string;
  actor: Actor;
}

/**
 * Create a work order from an issued quote. Runs the deterministic policy
 * engine; auto-approves within mandate; routes above threshold to the Approval
 * Centre; atomically reserves budget. Quote acceptance is single-use.
 */
export async function createWorkOrderFromQuote(input: CreateWorkOrderInput) {
  const quote = await db.quote.findUnique({
    where: { publicId: input.quotePublicId },
    include: { service: true, provider: true, agent: true },
  });
  if (!quote || quote.orgId !== input.orgId) throw new AppError("NOT_FOUND", "Quote not found for this organisation");
  if (quote.agentId !== input.agentId) throw new AppError("FORBIDDEN", "Quote belongs to a different agent");
  if (quote.status === "EXPIRED") throw new AppError("QUOTE_EXPIRED", "Quote has expired");
  if (quote.status !== "ISSUED") throw new AppError("CONFLICT", `Quote is ${quote.status}; only ISSUED quotes can be accepted`);
  if (quote.expiresAt.getTime() < Date.now()) throw new AppError("QUOTE_EXPIRED", "Quote has expired");

  // active mandate for this agent covering the quote asset/network
  const mandate = await db.mandate.findFirst({
    where: { agentId: input.agentId, status: "ACTIVE", validUntil: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!mandate) throw new AppError("MANDATE_INVALID", "No active mandate for this agent");

  // policy evaluation (deterministic; default-deny)
  const result = await evaluatePolicy({
    agentId: input.agentId,
    mandateId: mandate.id,
    providerId: quote.providerId,
    serviceId: quote.serviceId,
    serviceCategory: quote.service.category,
    serviceStatus: quote.service.status,
    providerStatus: quote.provider.status,
    asset: quote.asset,
    network: quote.network,
    amountMinor: quote.amount,
  });

  if (result.decision === "DENY") {
    await audit({
      orgId: input.orgId,
      actorType: "AGENT",
      actorId: input.agentId,
      action: "workorder.create.denied",
      resourceType: "quote",
      resourceId: quote.publicId,
      metadata: { reasonCodes: result.reasonCodes },
    });
    throw new AppError("POLICY_DENIED", `Purchase denied by policy: ${result.reasonCodes.join(", ")}`, {
      decision: result.decision,
      reasonCodes: result.reasonCodes,
      checks: result.checks,
    });
  }

  // atomic budget reservation (guard inside UPDATE)
  await reserveBudget(mandate.id, quote.amount);
  let reservation;
  try {
    // mark quote accepted (single-use) with concurrent guard
    const accepted = await db.quote.updateMany({
      where: { id: quote.id, status: "ISSUED" },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    if (accepted.count !== 1) throw new AppError("CONFLICT", "Quote was concurrently accepted");

    const termsSnapshot = {
      quoteId: quote.publicId,
      serviceId: quote.serviceId,
      serviceTitle: quote.service.title,
      serviceVersion: quote.service.version,
      providerId: quote.providerId,
      providerName: quote.provider.name,
      providerWallet: quote.provider.walletAddress,
      amountMinor: quote.amount.toString(),
      asset: quote.asset,
      network: quote.network,
      slaHours: quote.service.slaHours,
      acceptanceTerms: quote.service.acceptanceTerms,
      quoteTermsHash: quote.termsHash,
      createdAt: new Date().toISOString(),
    };
    const termsJson = canonicalJson(termsSnapshot);
    const termsHash = sha256(termsJson);

    const autoApproved = result.decision === "APPROVE";
    const wo = await db.workOrder.create({
      data: {
        publicId: woPublicId(),
        orgId: input.orgId,
        agentId: input.agentId,
        providerId: quote.providerId,
        serviceId: quote.serviceId,
        quoteId: quote.id,
        amount: quote.amount,
        asset: quote.asset,
        network: quote.network,
        state: autoApproved ? "APPROVED" : "PENDING_APPROVAL",
        approvalStatus: autoApproved ? "NOT_REQUIRED" : "PENDING",
        deadline: new Date(Date.now() + quote.service.slaHours * 3_600_000),
        terms: termsJson,
        termsHash,
        autoApproved,
      },
    });

    reservation = await db.budgetReservation.create({
      data: {
        mandateId: mandate.id,
        workOrderId: wo.id,
        amount: quote.amount,
        status: "RESERVED",
        expiresAt: new Date(Date.now() + 30 * 60_000), // 30-min reservation window
      },
    });

    await recordEvent(wo, "submit" as WoAction, "PENDING_APPROVAL", wo.state as WoState, input.actor, result.reasonCodes.join(","), { policyChecks: result.checks.length });
    await post({
      orgId: input.orgId,
      workOrderId: wo.id,
      entryType: "PROPOSED",
      direction: "DEBIT",
      account: `org:${input.orgId}:proposed`,
      amount: quote.amount,
      sourceType: "WORK_ORDER",
      sourceId: wo.id,
      memo: `Proposed ${formatFromMinor(quote.amount)} ${quote.asset} to ${quote.provider.name}`,
      idempotencyKey: ledgerIdempotencyKey(["PROPOSED", wo.id]),
    });
    await post({
      orgId: input.orgId,
      workOrderId: wo.id,
      entryType: "RESERVED",
      direction: "DEBIT",
      account: `org:${input.orgId}:reserved`,
      amount: quote.amount,
      sourceType: "WORK_ORDER",
      sourceId: wo.id,
      memo: `Budget reserved on mandate ${mandate.id}`,
      idempotencyKey: ledgerIdempotencyKey(["RESERVED", wo.id]),
    });
    await publishToOutbox("workorder.created", { workOrderId: wo.publicId, autoApproved });
    await audit({
      orgId: input.orgId,
      actorType: "AGENT",
      actorId: input.agentId,
      action: "workorder.created",
      resourceType: "workorder",
      resourceId: wo.publicId,
      metadata: { decision: result.decision, amount: quote.amount.toString() },
    });
    return { workOrder: wo, policy: result, reservationId: reservation.id };
  } catch (e) {
    // compensating release — never leave budget reserved on failure
    await releaseReservation(mandate.id, quote.amount).catch(() => {});
    throw e;
  }
}

// ── transitions ──────────────────────────────────────────────────────────────

export async function transitionWorkOrder(opts: {
  workOrderPublicId: string;
  action: WoAction;
  actor: Actor;
  reason?: string;
  metadata?: Record<string, unknown>;
  /** dispute resolution outcome */
  outcome?: "RESOLVED_PROVIDER" | "RESOLVED_BUYER";
}) {
  const wo = await db.workOrder.findUnique({ where: { publicId: opts.workOrderPublicId } });
  if (!wo) throw new AppError("NOT_FOUND", "Work order not found");

  // AGENT principals may only cancel their own org's orders pre-approval
  if (opts.actor.kind === "AGENT") {
    if (wo.agentId !== opts.actor.id) throw new AppError("FORBIDDEN", "Not this agent's work order");
  }
  if (opts.actor.kind === "PROVIDER") {
    if (wo.providerId !== opts.actor.id) throw new AppError("FORBIDDEN", "Not this provider's work order");
  }
  if (opts.actor.kind === "USER") {
    if (wo.orgId !== opts.actor.orgId && opts.actor.id !== "platform") {
      const member = await db.membership.findUnique({
        where: { userId_orgId: { userId: opts.actor.id, orgId: wo.orgId } },
      });
      if (!member) throw new AppError("FORBIDDEN", "Not a member of this work order's organisation");
    }
  }

  const t = TRANSITIONS[opts.action];
  if (!t) throw new AppError("VALIDATION_ERROR", `Unknown action ${opts.action}`);
  if (!actorAllowed(opts.actor, opts.action)) throw new AppError("FORBIDDEN", `Role not permitted to ${opts.action}`);
  if (!t.from.includes(wo.state as WoState)) {
    throw new AppError("INVALID_TRANSITION", `Cannot ${opts.action} from state ${wo.state}`, { from: wo.state, action: opts.action });
  }

  // dispute resolution outcome routing
  if (opts.action === "resolve_dispute" && opts.outcome === "RESOLVED_BUYER") {
    return transitionWorkOrder({ ...opts, action: "refund" });
  }

  switch (opts.action) {
    case "approve": {
      const updated = await db.workOrder.update({
        where: { id: wo.id },
        data: { state: "APPROVED", approvalStatus: "APPROVED" },
      });
      await recordEvent(wo, "approve", wo.state as WoState, "APPROVED", opts.actor, opts.reason);
      await publishToOutbox("workorder.approved", { workOrderId: wo.publicId });
      return updated;
    }
    case "reject": {
      await releaseReservationFor(wo);
      const updated = await db.workOrder.update({
        where: { id: wo.id },
        data: { state: "REJECTED", approvalStatus: "REJECTED", cancelReason: opts.reason ?? "Rejected by approver" },
      });
      await recordEvent(wo, "reject", wo.state as WoState, "REJECTED", opts.actor, opts.reason);
      await post({
        orgId: wo.orgId, workOrderId: wo.id, entryType: "RESERVED", direction: "CREDIT",
        account: `org:${wo.orgId}:reserved`, amount: wo.amount, sourceType: "WORK_ORDER", sourceId: wo.id,
        memo: "Reservation released on rejection", idempotencyKey: ledgerIdempotencyKey(["RESERVED_RELEASE", wo.id]),
      });
      return updated;
    }
    case "cancel": {
      await releaseReservationFor(wo);
      await db.quote.updateMany({ where: { id: wo.quoteId ?? "" }, data: { status: "SUPERSEDED" } });
      const updated = await db.workOrder.update({
        where: { id: wo.id },
        data: { state: "CANCELLED", cancelReason: opts.reason ?? "Cancelled" },
      });
      await recordEvent(wo, "cancel", wo.state as WoState, "CANCELLED", opts.actor, opts.reason);
      return updated;
    }
    case "fund": {
      // escrow movement: treasury → escrow (chain submission or honest DEMO mark)
      const provider = await db.provider.findUnique({ where: { id: wo.providerId } });
      const treasury = await db.treasuryAccount.findFirst({ where: { orgId: wo.orgId, asset: wo.asset } });
      if (!treasury) throw new AppError("INSUFFICIENT_FUNDS", "No treasury account for this asset — fund the treasury first");
      if (treasury.trackBalance < wo.amount) {
        throw new AppError("INSUFFICIENT_FUNDS", `Treasury has ${formatFromMinor(treasury.trackBalance)} ${wo.asset}; order needs ${formatFromMinor(wo.amount)}`);
      }
      const chain = getChainProvider();
      const caps = chain.capabilities();
      const submit = await chain.submitTransaction(Buffer.from(`escrow-fund:${wo.id}:${wo.amount}`).toString("base64"));
      // treasury balance decrement (atomic conditional)
      const dec = await db.treasuryAccount.updateMany({
        where: { id: treasury.id, trackBalance: { gte: wo.amount } },
        data: { trackBalance: { decrement: wo.amount } },
      });
      if (dec.count !== 1) throw new AppError("INSUFFICIENT_FUNDS", "Concurrent treasury spend detected");
      await commitReservationFor(wo);
      await db.treasuryTx.create({
        data: {
          accountId: treasury.id, type: "ESCROW_IN", amount: -wo.amount,
          txSignature: submit.reference, status: "CONFIRMED", sourceType: "WORK_ORDER", sourceId: wo.id, createdBy: opts.actor.id,
        },
      });
      await post({
        orgId: wo.orgId, workOrderId: wo.id, entryType: "ESCROWED", direction: "DEBIT",
        account: `escrow:${wo.id}`, amount: wo.amount, sourceType: "WORK_ORDER", sourceId: wo.id,
        memo: `Escrow funded (${submit.mode === "demo" ? "DEMO" : "live"})`, idempotencyKey: ledgerIdempotencyKey(["ESCROWED", wo.id]),
      });
      await post({
        orgId: wo.orgId, workOrderId: wo.id, entryType: "ESCROWED", direction: "CREDIT",
        account: `org:${wo.orgId}:treasury`, amount: wo.amount, sourceType: "WORK_ORDER", sourceId: wo.id,
        memo: "Funds moved to escrow", idempotencyKey: ledgerIdempotencyKey(["ESCROWED_CREDIT", wo.id]),
      });
      const updated = await db.workOrder.update({
        where: { id: wo.id },
        data: { state: "FUNDED", fundingStatus: "ESCROWED", settlementState: "PENDING" },
      });
      await recordEvent(wo, "fund", wo.state as WoState, "FUNDED", opts.actor, opts.reason, {
        chainMode: caps.mode, reference: submit.reference, simulated: submit.simulated,
      });
      await publishToOutbox("workorder.funded", { workOrderId: wo.publicId, reference: submit.reference, simulated: submit.simulated });
      return updated;
    }
    case "accept": {
      const updated = await db.workOrder.update({ where: { id: wo.id }, data: { state: "ACCEPTED" } });
      await recordEvent(wo, "accept", wo.state as WoState, "ACCEPTED", opts.actor, opts.reason);
      return updated;
    }
    case "deliver": {
      const latest = await db.evidence.findFirst({ where: { workOrderId: wo.id }, orderBy: { version: "desc" } });
      if (!latest) throw new AppError("VALIDATION_ERROR", "Submit evidence before delivering");
      const updated = await db.workOrder.update({
        where: { id: wo.id },
        data: { state: "DELIVERED", evidenceState: "SUBMITTED" },
      });
      await recordEvent(wo, "deliver", wo.state as WoState, "DELIVERED", opts.actor, opts.reason, { evidenceVersion: latest.version });
      return updated;
    }
    case "review_start": {
      const updated = await db.workOrder.update({
        where: { id: wo.id },
        data: { state: "IN_REVIEW", evidenceState: "IN_REVIEW" },
      });
      await db.evidence.updateMany({ where: { workOrderId: wo.id, status: "SUBMITTED" }, data: { status: "IN_REVIEW" } });
      await recordEvent(wo, "review_start", wo.state as WoState, "IN_REVIEW", opts.actor, opts.reason);
      return updated;
    }
    case "review_accept": {
      const inv = await escrowInvariant(wo.id);
      if (!inv.balanced) throw new AppError("CONFLICT", "Escrow invariant violated; settlement blocked");
      // one-time settlement guard: only if still escrowed
      const guard = await db.workOrder.updateMany({
        where: { id: wo.id, fundingStatus: "ESCROWED" },
        data: { fundingStatus: "RELEASED" },
      });
      if (guard.count !== 1) throw new AppError("INVALID_TRANSITION", "Escrow already settled (one-time settlement enforced)");
      const feeBps = env.PLATFORM_FEE_BPS;
      const fee = (wo.amount * BigInt(feeBps)) / 10000n;
      const net = wo.amount - fee;
      const chain = getChainProvider();
      const submit = await chain.submitTransaction(Buffer.from(`escrow-release:${wo.id}:${net}`).toString("base64"));
      await db.evidence.updateMany({ where: { workOrderId: wo.id, status: "IN_REVIEW" }, data: { status: "ACCEPTED", reviewedAt: new Date(), reviewedBy: opts.actor.id } });
      await post({
        orgId: wo.orgId, workOrderId: wo.id, entryType: "RELEASED", direction: "CREDIT",
        account: `provider:${wo.providerId}:payable`, amount: net, sourceType: "WORK_ORDER", sourceId: wo.id,
        memo: `Release on acceptance (${submit.mode === "demo" ? "DEMO" : "live"})`, idempotencyKey: ledgerIdempotencyKey(["RELEASED", wo.id]),
      });
      if (fee > 0n) {
        await post({
          orgId: wo.orgId, workOrderId: wo.id, entryType: "FEE", direction: "CREDIT",
          account: "platform:fee", amount: fee, sourceType: "WORK_ORDER", sourceId: wo.id,
          memo: `Platform fee ${feeBps} bps`, idempotencyKey: ledgerIdempotencyKey(["FEE", wo.id]),
        });
        await post({
          orgId: wo.orgId, workOrderId: wo.id, entryType: "ESCROWED", direction: "DEBIT",
          account: `escrow:${wo.id}`, amount: fee, sourceType: "WORK_ORDER", sourceId: wo.id,
          memo: "Fee debited from escrow", idempotencyKey: ledgerIdempotencyKey(["FEE_DEBIT", wo.id]),
        });
      }
      await post({
        orgId: wo.orgId, workOrderId: wo.id, entryType: "ESCROWED", direction: "DEBIT",
        account: `escrow:${wo.id}`, amount: net, sourceType: "WORK_ORDER", sourceId: wo.id,
        memo: "Release debited from escrow", idempotencyKey: ledgerIdempotencyKey(["RELEASED_DEBIT", wo.id]),
      });
      const receipt = await db.settlementReceipt.create({
        data: {
          publicId: receiptPublicId(), workOrderId: wo.id, grossAmount: wo.amount, feeAmount: fee, netAmount: net,
          asset: wo.asset, network: wo.network, kind: "RELEASE", chainRef: submit.reference,
        },
      });
      const updated = await db.workOrder.update({
        where: { id: wo.id },
        data: { state: "COMPLETED", evidenceState: "ACCEPTED", settlementState: "SETTLED" },
      });
      await recordEvent(wo, "review_accept", wo.state as WoState, "COMPLETED", opts.actor, opts.reason, {
        receiptId: receipt.publicId, chainRef: submit.reference, simulated: submit.simulated,
      });
      await publishToOutbox("workorder.settled", { workOrderId: wo.publicId, receiptId: receipt.publicId });
      return updated;
    }
    case "review_reject": {
      const updated = await db.workOrder.update({
        where: { id: wo.id },
        data: { state: "DISPUTED", evidenceState: "REJECTED" },
      });
      await db.evidence.updateMany({ where: { workOrderId: wo.id, status: "IN_REVIEW" }, data: { status: "REJECTED", reviewedAt: new Date(), reviewedBy: opts.actor.id, reviewNote: opts.reason } });
      await db.dispute.create({
        data: {
          publicId: disputePublicId(), workOrderId: wo.id,
          reason: opts.reason ?? "Buyer rejected evidence", detail: opts.metadata?.detail as string,
          openedByType: "USER", openedBy: opts.actor.id,
        },
      });
      await recordEvent(wo, "review_reject", wo.state as WoState, "DISPUTED", opts.actor, opts.reason);
      return updated;
    }
    case "request_revision": {
      await db.evidence.updateMany({
        where: { workOrderId: wo.id, status: "IN_REVIEW" },
        data: { status: "REVISION_REQUESTED", reviewedAt: new Date(), reviewedBy: opts.actor.id, reviewNote: opts.reason },
      });
      const updated = await db.workOrder.update({
        where: { id: wo.id },
        data: { evidenceState: "REVISION_REQUESTED" },
      });
      await recordEvent(wo, "request_revision", wo.state as WoState, "IN_REVIEW", opts.actor, opts.reason);
      return updated;
    }
    case "open_dispute": {
      if (await db.dispute.findUnique({ where: { workOrderId: wo.id } })) {
        throw new AppError("CONFLICT", "Dispute already open");
      }
      const updated = await db.workOrder.update({ where: { id: wo.id }, data: { state: "DISPUTED" } });
      await db.dispute.create({
        data: {
          publicId: disputePublicId(), workOrderId: wo.id, reason: opts.reason ?? "Disputed",
          openedByType: opts.actor.kind, openedBy: opts.actor.id,
        },
      });
      await recordEvent(wo, "open_dispute", wo.state as WoState, "DISPUTED", opts.actor, opts.reason);
      return updated;
    }
    case "refund": {
      const guard = await db.workOrder.updateMany({
        where: { id: wo.id, fundingStatus: "ESCROWED" },
        data: { fundingStatus: "REFUNDED" },
      });
      if (guard.count !== 1) throw new AppError("INVALID_TRANSITION", "Escrow already settled (one-time settlement enforced)");
      const treasury = await db.treasuryAccount.findFirst({ where: { orgId: wo.orgId, asset: wo.asset } });
      const chain = getChainProvider();
      const submit = await chain.submitTransaction(Buffer.from(`escrow-refund:${wo.id}:${wo.amount}`).toString("base64"));
      if (treasury) {
        await db.treasuryAccount.update({ where: { id: treasury.id }, data: { trackBalance: { increment: wo.amount } } });
        await db.treasuryTx.create({
          data: { accountId: treasury.id, type: "REFUND", amount: wo.amount, txSignature: submit.reference, status: "CONFIRMED", sourceType: "WORK_ORDER", sourceId: wo.id, createdBy: opts.actor.id },
        });
      }
      await post({
        orgId: wo.orgId, workOrderId: wo.id, entryType: "REFUNDED", direction: "CREDIT",
        account: `org:${wo.orgId}:treasury`, amount: wo.amount, sourceType: "WORK_ORDER", sourceId: wo.id,
        memo: `Refund to treasury (${submit.mode === "demo" ? "DEMO" : "live"})`, idempotencyKey: ledgerIdempotencyKey(["REFUNDED", wo.id]),
      });
      await post({
        orgId: wo.orgId, workOrderId: wo.id, entryType: "ESCROWED", direction: "DEBIT",
        account: `escrow:${wo.id}`, amount: wo.amount, sourceType: "WORK_ORDER", sourceId: wo.id,
        memo: "Refund debited from escrow", idempotencyKey: ledgerIdempotencyKey(["REFUND_DEBIT", wo.id]),
      });
      const receipt = await db.settlementReceipt.create({
        data: {
          publicId: receiptPublicId(), workOrderId: wo.id, grossAmount: wo.amount, feeAmount: 0n, netAmount: wo.amount,
          asset: wo.asset, network: wo.network, kind: "REFUND", chainRef: submit.reference,
        },
      });
      const updated = await db.workOrder.update({
        where: { id: wo.id },
        data: { state: "REFUNDED", settlementState: "SETTLED" },
      });
      await db.dispute.updateMany({ where: { workOrderId: wo.id, status: { in: ["OPEN", "UNDER_REVIEW"] } }, data: { status: "RESOLVED_BUYER", resolvedAt: new Date(), resolvedBy: opts.actor.id, resolutionNote: opts.reason } });
      await recordEvent(wo, "refund", wo.state as WoState, "REFUNDED", opts.actor, opts.reason, { receiptId: receipt.publicId });
      return updated;
    }
    default:
      throw new AppError("VALIDATION_ERROR", "Unhandled action");
  }
}

async function releaseReservationFor(wo: { id: string }) {
  const r = await db.budgetReservation.findUnique({ where: { workOrderId: wo.id } });
  if (r && r.status === "RESERVED") {
    await releaseReservation(r.mandateId, r.amount);
    await db.budgetReservation.update({ where: { id: r.id }, data: { status: "RELEASED" } });
  }
}

async function commitReservationFor(wo: { id: string }) {
  const r = await db.budgetReservation.findUnique({ where: { workOrderId: wo.id } });
  if (r && r.status === "RESERVED") {
    await commitReservation(r.mandateId, r.amount);
    await db.budgetReservation.update({ where: { id: r.id }, data: { status: "COMMITTED" } });
  }
}

/** Emergency revocation: agent cannot create new purchases even mid-session. */
export async function assertAgentCanPurchase(agentId: string) {
  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new AppError("NOT_FOUND", "Agent not found");
  if (agent.status === "REVOKED") throw new AppError("AGENT_REVOKED", "Agent is revoked; new purchases are blocked");
  if (agent.status !== "ACTIVE") throw new AppError("AGENT_REVOKED", `Agent is ${agent.status}; new purchases are blocked`);
}
