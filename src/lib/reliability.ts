// ORZARYN — shared reliability module (Stage 19):
// timeouts, retry with exponential backoff + full jitter, circuit breaker,
// idempotency helpers. No blind repeats of financial writes.
import { logger } from "./logger";

const log = logger("reliability");

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
  }
}

export async function withTimeout<T>(p: Promise<T>, ms: number, label = "op"): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rej) => {
        t = setTimeout(() => rej(new TimeoutError(ms)), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

/** Retry with exponential backoff and FULL jitter. `retryOn` classifies the error. */
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: { attempts?: number; baseMs?: number; maxMs?: number; retryOn?: (e: unknown) => boolean; label?: string } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseMs = opts.baseMs ?? 200;
  const maxMs = opts.maxMs ?? 8_000;
  const retryOn = opts.retryOn ?? ((e) => !(e instanceof Error && e.name === "NonRetryable"));
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      if (attempt === attempts || !retryOn(e)) break;
      const ceiling = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      const delay = Math.floor(Math.random() * ceiling); // full jitter
      log.warn("retry.scheduled", { label: opts.label, attempt, delay });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

/** Minimal circuit breaker per dependency. */
export class CircuitBreaker {
  private state: BreakerState = "CLOSED";
  private failures = 0;
  private openedAt = 0;
  constructor(
    readonly name: string,
    private threshold = 4,
    private cooldownMs = 15_000,
  ) {}

  get currentState() {
    if (this.state === "OPEN" && Date.now() - this.openedAt >= this.cooldownMs) {
      this.state = "HALF_OPEN";
    }
    return this.state;
  }

  get isOpen() {
    return this.currentState === "OPEN";
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen) throw new Error(`circuit_open:${this.name}`);
    try {
      const r = await fn();
      this.failures = 0;
      this.state = "CLOSED";
      return r;
    } catch (e) {
      this.failures++;
      if (this.state === "HALF_OPEN" || this.failures >= this.threshold) {
        this.state = "OPEN";
        this.openedAt = Date.now();
        log.warn("circuit.opened", { name: this.name, failures: this.failures });
      }
      throw e;
    }
  }
}

export function nonRetryable(e: unknown): never {
  if (e instanceof Error) e.name = "NonRetryable";
  throw e;
}
