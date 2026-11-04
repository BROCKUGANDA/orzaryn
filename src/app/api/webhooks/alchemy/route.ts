// ORZARYN — Alchemy webhook ingestion (Stage 17).
// Verify HMAC signature → persist-before-ack → dedup by external id → 202.
// Invalid signatures are recorded (signatureValid=false) and dead-lettered by the worker.
import { api } from "@/lib/api";
import { AppError, ok } from "@/lib/errors";
import { getChainProvider } from "@/lib/chain/alchemy-solana";
import { ingestWebhook } from "@/lib/events";
import { rateLimit } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = logger("webhooks:alchemy");

export const POST = api(async (ctx) => {
  const ip = ctx.req.headers.get("x-forwarded-for") ?? "local";
  const rl = rateLimit(`webhook:${ip}`, { capacity: 120, refillPerMinute: 120 });
  if (!rl.allowed) throw new AppError("RATE_LIMITED", "Webhook rate limit exceeded");

  const raw = await ctx.req.text();
  const signature = ctx.req.headers.get("x-alchemy-signature");
  const chain = getChainProvider();
  const valid = chain.verifyWebhookSignature(raw, signature);

  let externalId: string;
  try {
    const body = JSON.parse(raw) as { id?: string; webhookId?: string; event?: { id?: string } };
    externalId = body.id ?? body.event?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } catch {
    externalId = `malformed-${Date.now()}`;
  }

  const result = await ingestWebhook({
    source: "alchemy",
    externalId,
    payload: raw,
    signatureValid: valid,
  });
  log.info("webhook.ingested", { externalId, deduped: result.deduped, signatureValid: valid });

  // Always 202 once persisted (valid or not) — worker handles validity outcomes.
  // Invalid-signature events are never processed and land in dead-letter for review.
  return ok({ received: true, id: result.id, deduped: result.deduped });
});
