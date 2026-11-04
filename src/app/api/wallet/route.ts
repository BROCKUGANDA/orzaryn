// ORZARYN — wallet verification (Stage 7): challenge + verify (Ed25519, single-use)
import { z } from "zod";
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createChallenge, consumeChallenge } from "@/lib/wallet";

export const dynamic = "force-dynamic";

const challengeSchema = z.object({ action: z.literal("challenge"), address: z.string().min(32).max(50), purpose: z.string().default("WALLET_LINK") });
const verifySchema = z.object({ action: z.literal("verify"), nonce: z.string(), address: z.string().min(32).max(50), signature: z.string().min(64), label: z.string().max(60).optional() });

export const GET = api(async () => {
  const p = await requireUser();
  const links = await db.walletLink.findMany({ where: { userId: p.userId } });
  return ok(links.map((l) => ({ address: l.address, label: l.label, verifiedAt: l.verifiedAt })));
});

export const POST = api(async (ctx) => {
  const p = await requireUser();
  const b = await ctx.body<unknown>();
  const challenge = challengeSchema.safeParse(b);
  if (challenge.success) {
    const c = await createChallenge(challenge.data.purpose, challenge.data.address);
    return ok({ nonce: c.nonce, message: c.message, expiresAt: c.expiresAt });
  }
  const verify = verifySchema.safeParse(b);
  if (verify.success) {
    await consumeChallenge({ nonce: verify.data.nonce, address: verify.data.address, signatureBase64: verify.data.signature });
    const link = await db.walletLink.upsert({
      where: { userId_address: { userId: p.userId, address: verify.data.address } },
      create: { userId: p.userId, address: verify.data.address, label: verify.data.label, verifiedAt: new Date() },
      update: { verifiedAt: new Date(), label: verify.data.label },
    });
    await audit({ actorType: "USER", actorId: p.userId, action: "wallet.verified", resourceType: "wallet_link", resourceId: link.id, requestId: ctx.requestId });
    return ok({ verified: true, address: verify.data.address });
  }
  throw new AppError("VALIDATION_ERROR", "Expected {action: challenge|verify, ...}");
});
