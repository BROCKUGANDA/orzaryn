// ORZARYN — error taxonomy + uniform API envelope
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INVALID_TRANSITION"
  | "POLICY_DENIED"
  | "POLICY_DEGRADED"
  | "AGENT_REVOKED"
  | "MANDATE_INVALID"
  | "INSUFFICIENT_FUNDS"
  | "INSUFFICIENT_BUDGET"
  | "QUOTE_EXPIRED"
  | "IDEMPOTENCY_REPLAY"
  | "PROVIDER_NOT_APPROVED"
  | "CHAIN_UNAVAILABLE"
  | "CHAIN_DEMO_MODE"
  | "PAUSED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INVALID_TRANSITION: 409,
  POLICY_DENIED: 403,
  POLICY_DEGRADED: 503,
  AGENT_REVOKED: 403,
  MANDATE_INVALID: 403,
  INSUFFICIENT_FUNDS: 402,
  INSUFFICIENT_BUDGET: 402,
  QUOTE_EXPIRED: 410,
  IDEMPOTENCY_REPLAY: 409,
  PROVIDER_NOT_APPROVED: 403,
  CHAIN_UNAVAILABLE: 503,
  CHAIN_DEMO_MODE: 409,
  PAUSED: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  code: ErrorCode;
  details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
  get status() {
    return STATUS[this.code];
  }
}

/** Deep-serialize for JSON: BigInt→string, Date→ISO (money stays string across the wire). */
export function serialize<T>(value: T): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serialize(v);
    return out;
  }
  return value;
}

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ ok: true, data: serialize(data) }, init);
}

export function fail(error: unknown, requestId?: string) {
  if (error instanceof AppError) {
    return Response.json(
      {
        ok: false,
        error: { code: error.code, message: error.message, details: error.details, requestId },
      },
      { status: error.status },
    );
  }
  return Response.json(
    {
      ok: false,
      error: {
        code: "INTERNAL" satisfies ErrorCode,
        message: "Internal error. The incident has been logged.",
        requestId,
      },
    },
    { status: 500 },
  );
}
