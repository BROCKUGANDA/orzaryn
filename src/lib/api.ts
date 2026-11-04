// ORZARYN — API route wrapper (Stage 6): request IDs, structured logging,
// principal resolution, RBAC gate, rate limiting, idempotency, uniform envelope.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { AppError, fail, ok } from "./errors";
import { logger } from "./logger";
import { requestRequestId } from "./ids";
import { rateLimit } from "./ratelimit";
import { agentFromApiKey, resolvePrincipal, type Principal } from "./auth";
import { roleHas, type Permission } from "./rbac";
import { sha256 } from "./crypto";

const log = logger("api");

export interface ApiContext {
  req: NextRequest;
  requestId: string;
  principal: Principal | null;
  agentKeyRaw: string | null;
  body: <T>() => Promise<T>;
}

type Handler = (ctx: ApiContext) => Promise<Response>;

export function api(handler: Handler, opts?: { permission?: Permission; limit?: { capacity: number; refillPerMinute: number } }) {
  return async (req: NextRequest) => {
    const requestId = requestRequestId();
    const started = Date.now();
    try {
      const agentKeyRaw = req.headers.get("x-orz-key");
      let principal = await resolvePrincipal();
      if (!principal && agentKeyRaw) principal = await agentFromApiKey(agentKeyRaw);

      if (opts?.permission) {
        if (!principal) throw new AppError("UNAUTHENTICATED", "Authentication required");
        if (principal.kind !== "USER") throw new AppError("FORBIDDEN", "User session required");
        if (!principal.role || !roleHas(principal.role, opts.permission)) {
          throw new AppError("FORBIDDEN", `Missing permission ${opts.permission}`);
        }
      }

      // rate limiting: per principal or per IP
      const ip = req.headers.get("x-forwarded-for") ?? "local";
      const rlKey = principal ? `${principal.kind}:${principal.kind === "AGENT" ? principal.agentId : principal.kind === "USER" ? principal.userId : principal.providerId}` : `ip:${ip}`;
      const lim = rateLimit(rlKey, opts?.limit ?? { capacity: 60, refillPerMinute: 60 });
      if (!lim.allowed) throw new AppError("RATE_LIMITED", "Too many requests; slow down");

      let cachedBody: unknown;
      const ctx: ApiContext = {
        req,
        requestId,
        principal,
        agentKeyRaw,
        body: async <T>(): Promise<T> => {
          if (cachedBody === undefined) {
            try {
              cachedBody = await req.json();
            } catch {
              throw new AppError("VALIDATION_ERROR", "Request body must be JSON");
            }
          }
          return cachedBody as T;
        },
      };

      const res = await handler(ctx);
      log.info("request", {
        requestId,
        method: req.method,
        path: new URL(req.url).pathname,
        status: res.status,
        ms: Date.now() - started,
        principal: principal ? `${principal.kind}:${principal.kind === "AGENT" ? principal.agentId : principal.kind === "USER" ? principal.userId : principal.providerId}` : "anonymous",
      });
      res.headers.set("x-request-id", requestId);
      return res;
    } catch (e) {
      const res = fail(e, requestId);
      log.warn("request.failed", {
        requestId,
        path: new URL(req.url).pathname,
        code: e instanceof AppError ? e.code : "INTERNAL",
        ms: Date.now() - started,
      });
      res.headers.set("x-request-id", requestId);
      return res;
    }
  };
}

/** Idempotency guard for financial POSTs (Stage 19). */
export async function idempotentGuard(
  ctx: ApiContext,
  endpoint: string,
  payload: unknown,
): Promise<{ replay: boolean; previous?: { status: number; body: string } }> {
  const key = ctx.req.headers.get("idempotency-key");
  if (!key) return { replay: false };
  if (!ctx.principal) throw new AppError("UNAUTHENTICATED", "Authentication required for idempotent calls");
  const principalId = ctx.principal.kind === "AGENT" ? ctx.principal.agentId : ctx.principal.kind === "USER" ? ctx.principal.userId : ctx.principal.providerId;
  const requestHash = sha256(JSON.stringify(payload ?? {}));
  const existing = await db.idempotencyKey.findUnique({ where: { key } });
  if (existing && existing.requestHash === requestHash && existing.responseStatus) {
    return { replay: true, previous: { status: existing.responseStatus, body: existing.responseBody ?? "" } };
  }
  if (existing && existing.requestHash !== requestHash) {
    throw new AppError("IDEMPOTENCY_REPLAY", "Idempotency key reused with a different payload");
  }
  await db.idempotencyKey.create({
    data: {
      key,
      endpoint,
      requestHash,
      principalId,
      expiresAt: new Date(Date.now() + 24 * 3_600_000),
    },
  });
  return { replay: false };
}

export async function idempotentStore(ctx: ApiContext, status: number, data: unknown) {
  const key = ctx.req.headers.get("idempotency-key");
  if (!key) return;
  await db.idempotencyKey.update({
    where: { key },
    data: { responseStatus: status, responseBody: JSON.stringify(data) },
  }).catch(() => {});
}
