"use client";
// ORZARYN — client API layer: typed fetch + uniform error surfacing.
export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown; requestId?: string };
}

export class OrzApiError extends Error {
  code: string;
  details?: unknown;
  requestId?: string;
  constructor(code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export async function orzFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown; agentKey?: string; providerKey?: string; idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.agentKey) headers["x-orz-key"] = opts.agentKey;
  if (opts.providerKey) headers["x-orz-provider"] = opts.providerKey;
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({ ok: false, error: { code: "INTERNAL", message: `HTTP ${res.status}` } }))) as ApiEnvelope<T>;
  if (!json.ok) {
    throw new OrzApiError(json.error?.code ?? "INTERNAL", json.error?.message ?? "Request failed", json.error?.details, json.error?.requestId);
  }
  return json.data as T;
}
