// ORZARYN — treasury (Stage 15): accounts, deposits (testnet), balances.
import { z } from "zod";
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { requireOrgUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { parseToMinor, formatFromMinor } from "@/lib/money";
import { post, ledgerIdempotencyKey } from "@/lib/ledger";
import { getChainProvider } from "@/lib/chain/alchemy-solana";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const GET = api(async () => {
  const p = await requireOrgUser();
  const accounts = await db.treasuryAccount.findMany({
    where: { orgId: p.orgId },
    include: { transactions: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  const escrowed = await db.workOrder.aggregate({
    _sum: { amount: true },
    where: { orgId: p.orgId, fundingStatus: "ESCROWED" },
  });
  const pending = await db.workOrder.aggregate({
    _sum: { amount: true },
    where: { orgId: p.orgId, state: { in: ["PENDING_APPROVAL", "APPROVED"] } },
  });
  return ok({
    accounts,
    totals: {
      treasury: accounts.reduce((a, t) => a + t.trackBalance, 0n),
      escrowed: (escrowed._sum.amount ?? 0n),
      pending: (pending._sum.amount ?? 0n),
    },
  });
});

const depositSchema = z.object({
  accountId: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d{1,6})?$/),
});

const accountSchema = z.object({
  action: z.literal("create_account"),
  label: z.string().min(2).max(60),
  address: z.string().min(32).max(50),
});

export const POST = api(async (ctx) => {
  const p = await requireOrgUser();
  if (p.role !== "OWNER" && p.role !== "TREASURER") {
    throw new AppError("FORBIDDEN", "Only OWNER/TREASURER can operate the treasury");
  }
  const b = await ctx.body<unknown>();

  const acct = z.object(accountSchema.shape).safeParse(b);
  if (acct.success) {
    const account = await db.treasuryAccount.create({
      data: {
        orgId: p.orgId,
        label: acct.data.label,
        address: acct.data.address,
        asset: "USDC",
        network: env.NETWORK,
      },
    });
    await audit({ orgId: p.orgId, actorType: "USER", actorId: p.userId, action: "treasury.account_created", resourceType: "treasury_account", resourceId: account.id, requestId: ctx.requestId });
    return ok(account);
  }

  const parsed = depositSchema.safeParse(b);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Invalid treasury payload", parsed.error.flatten().fieldErrors);
  const account = await db.treasuryAccount.findFirst({ where: { id: parsed.data.accountId, orgId: p.orgId } });
  if (!account) throw new AppError("NOT_FOUND", "Treasury account not found");
  const amount = parseToMinor(parsed.data.amount);
  if (amount <= 0n) throw new AppError("VALIDATION_ERROR", "Deposit must be positive");

  // TESTNET ONLY (directive rule 5/7): this credits the ledger-tracked balance and
  // records the chain reference (DEMO or live testnet signature). Never mainnet.
  const chain = getChainProvider();
  const submit = await chain.submitTransaction(Buffer.from(`treasury-deposit:${account.id}:${amount}`).toString("base64"));
  const tx = await db.treasuryTx.create({
    data: {
      accountId: account.id,
      type: "DEPOSIT",
      amount,
      txSignature: submit.reference,
      status: "CONFIRMED",
      sourceType: "MANUAL",
      createdBy: p.userId,
    },
  });
  await db.treasuryAccount.update({ where: { id: account.id }, data: { trackBalance: { increment: amount } } });
  await post({
    orgId: p.orgId,
    entryType: "ESCROWED", // deposit increases deployable funds; tracked separately in treasury account
    direction: "DEBIT",
    account: `org:${p.orgId}:treasury`,
    amount,
    sourceType: "TREASURY_TX",
    sourceId: tx.id,
    memo: `Deposit ${formatFromMinor(amount)} USDC (${submit.mode === "demo" ? "DEMO reference" : "testnet"}) — TESTNET ONLY`,
    idempotencyKey: ledgerIdempotencyKey(["DEPOSIT", tx.id]),
  });
  await audit({ orgId: p.orgId, actorType: "USER", actorId: p.userId, action: "treasury.deposit", resourceType: "treasury_tx", resourceId: tx.id, metadata: { amount: amount.toString(), reference: submit.reference, simulated: submit.simulated }, requestId: ctx.requestId });
  return ok({ tx, reference: submit.reference, simulated: submit.simulated });
});
