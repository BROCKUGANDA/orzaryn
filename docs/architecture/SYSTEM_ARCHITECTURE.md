# ORZARYN — System Architecture (Stage 4)

- **Version:** 1.0 · 2026-11-05
- **Decision records:** see `decisions/ADR-001…ADR-008`
- **Context:** greenfield build in a single-port sandbox (Next.js 16 route handlers + Prisma/SQLite); deviations from the directive's recommended stack are recorded in ADR-004/005/006.

---

## 1. System context (C4 level 1)

```
                        ┌──────────────────────────────┐
   Buyer humans ───────▶│                              │
   (Owner/Admin/        │           ORZARYN            │
   Treasurer/Approver)  │   Procurement & Settlement   │
                        │        Control Plane         │
   Provider humans ────▶│  (Next.js app + API + DB)    │
   AI Agents (MCP/API) ▶│                              │
   Platform operators ─▶│                              │
                        └───────┬───────────┬──────────┘
                                │           │
                    ┌───────────▼──┐   ┌────▼─────────────────┐
                    │ Alchemy RPC  │   │ File/evidence storage │
                    │ (Solana) +   │   │ (hashed, access-      │
                    │ Webhooks     │   │  controlled)          │
                    └───────┬──────┘   └──────────────────────┘
                            │
                    ┌───────▼──────────────────┐
                    │ Solana testnet (devnet/  │
                    │ testnet USDC, Anchor     │
                    │ escrow program — future) │
                    └──────────────────────────┘
```

Trust boundaries: **(A)** humans ↔ app (session auth), **(B)** agents ↔ app (API key + challenge signature), **(C)** Alchemy ↔ app (HMAC webhook verification), **(D)** app ↔ chain (RPC, read-only queries + signed submission through the chain adapter only), **(E)** app ↔ storage (server-side only).

## 2. Service boundaries (logical)

Although deployed as one Next.js process (ADR-004), the backend is organised into strict modules under `src/lib/` with one-way dependencies:

| Module | Responsibility | May depend on |
| --- | --- | --- |
| `env` | Typed, validated configuration | — |
| `logger` | Structured JSON logs, request IDs | env |
| `errors` | Error taxonomy + API envelope | — |
| `auth` | Sessions, passwords, challenges | db, logger |
| `rbac` | Role/permission evaluation | — |
| `audit` | Append-only audit trail | db, logger |
| `money` | Integer money helpers | — |
| `policy` | Deterministic policy engine + atomic reservation | db, money, logger |
| `workorder` | State machine + transitions | db, policy, ledger, events, logger |
| `ledger` | Idempotent double-entry postings | db, money, logger |
| `chain` | `ChainProvider` interface + Alchemy Solana adapter | env, logger, reliability |
| `events` | Webhook inbox, outbox, worker, checkpoints, DLQ | db, chain, logger |
| `reliability` | Timeout, retry+jitter, circuit breaker, idempotency | logger |
| `ratelimit` | Token-bucket limiter | logger |

Rule: **UI and API routes never import vendor SDKs directly** — they go through these modules. Agents never call `chain` or `policy` internals; they call MCP tools (§8).

## 3. Data flow — the purchase path (numbered)

1. Agent authenticates (`X-ORZ-KEY` + optional signed challenge) → `auth`.
2. Agent calls `discover_services` → directory of APPROVED providers/services filtered by mandate.
3. Agent calls `request_quote` → provider quotes (or auto-quote for fixed-price services); quote carries `termsHash`.
4. Agent calls `submit_proposal(quoteId)` → `policy.evaluate()` runs (pure + DB state) → `APPROVE` auto-reserves budget atomically; `REQUIRE_APPROVAL` routes to Approval Centre; `DENY` returns reason codes.
5. Work order created with immutable terms snapshot; `ledger.post(RESERVED)`; `events.publish(outbox)`.
6. Human approves (if required) → state `APPROVED` → funding step moves org treasury → escrow ledger state `ESCROWED` (+ testnet tx or DEMO mark).
7. Provider accepts → delivers evidence (hash + storage ref) → `DELIVERED`.
8. Buyer reviews → accepts → `COMPLETED` → `ledger.post(RELEASED)` (+ testnet tx) → receipt.
9. Worker reconciles: inbox events, checkpoints, ledger vs escrow-state deltas.

## 4. Frontend architecture

- Single user-visible route `/` (sandbox gateway constraint, ADR-008) with an internal view router (state-driven), giving the directive's 18 IA destinations as views: home, auth, onboarding, dashboard, agents, mandates, providers, quotes, purchase, approvals, work orders, evidence, settlements, disputes, treasury, reports, developers, admin.
- Server state via TanStack Query against `/api/*`; client state via Zustand (session, current view, toasts); components from shadcn/ui + ORZARYN design system (Stage 5); framer-motion with reduced-motion fallback.
- Every view implements loading / empty / error / success states and permission-aware controls (UI hides what RBAC denies; server enforces regardless).

## 5. Backend architecture

- Next.js Route Handlers under `src/app/api/*`, wrapped by a shared handler providing request ID, zod validation, auth resolution, rate limiting, idempotency, structured logging, and the uniform response envelope `{ ok, data | error: { code, message, details, requestId } }`.
- Workers: an in-process singleton scheduler (started by instrumentation on first request) drives webhook inbox processing, outbox publishing, reservation sweeps, quote expiry, and reconciliation with checkpoints (ADR-006).

## 6. Blockchain architecture

- `ChainProvider` interface (ADR-001): `health()`, `getSlot()`, `getSignatureStatus()`, `getBalance()`, `submitTransaction()`, `verifyWebhook()`, `capabilities()`.
- `AlchemySolanaProvider`: Solana JSON-RPC via Alchemy endpoint (env `ALCHEMY_API_KEY`, app id `q15y93g86sfgd0rb` in `ALCHEMY_APP_ID`); circuit-breaker wrapped; **DEMO mode** when unconfigured — all state marked `DEMO`, never presented as onchain truth.
- Onchain program (Stage 13): Anchor escrow enforcing mandate/escrow invariants; **not compiled/deployed here** (no Rust toolchain) — offchain enforcement is the only active layer, explicitly recorded as risk R-2.

## 7. Event-driven architecture

- **Inbound:** `POST /api/webhooks/alchemy` → verify HMAC → persist to `WebhookEvent` (dedup on external id) → 202. Persist-before-ack (Stage 17).
- **Worker:** claims pending events (transactional claim), validates payload, applies state changes idempotently, checkpoint per source; failures retry with exponential backoff + jitter; after N attempts → dead-letter.
- **Outbound:** domain events written to `OutboxEvent` in the same transaction as state changes; publisher marks sent.
- **Reconciliation:** scheduled job compares ledger sums vs escrow state vs chain reads; deltas produce `ReconciliationRecord` rows and alerts.

## 8. Agent interoperability (MCP surface)

`POST /api/mcp` — JSON-RPC-shaped tool endpoints with authenticated agent context: `discover_services`, `request_quote`, `submit_proposal`, `inspect_mandate`, `get_work_order`, `get_evidence_state`, `request_approval`. Tools are narrow; every call passes through the same policy engine; agents have no route to the chain adapter. SDK + docs + sample agent in the Developer portal view and `docs/` (Stage 16).

## 9. Security boundaries & threat model (summary)

| Threat | Control |
| --- | --- |
| Credential stuffing / brute force | scrypt hashing, rate limiting, generic errors, account lockout counters |
| Session theft | HttpOnly + SameSite cookies, hashed tokens at rest, rotation on login, expiry |
| Wallet challenge replay | 10-min expiry, single-use nonce consumed in transaction, canonical message binding org+agent+domain |
| Privilege escalation | Server-side RBAC on every route; ownership checks; agents cannot mutate mandates/treasury |
| Budget double-spend | Atomic conditional decrement (reservation) inside transaction |
| Illegal state transitions | Server-side transition table; principal attribution; immutable event log |
| Webhook forgery/replay | HMAC verification, timestamp window, dedup by event id, per-source rate limit |
| Injection | zod validation at every boundary; Prisma parameterised queries |
| Secret leakage | Env-only secrets, zod-validated, never logged; secret scanning note in SECURITY_FINDINGS |
| Onchain PII leakage | Only hashes/commitments onchain; content off-chain with access control |
| Vendor outage | Circuit breaker, default-deny policy, honest DEGRADED health |

## 10. Database relationships (core)

`Organisation 1—* Membership *—1 User`; `Organisation 1—* Agent 1—* Mandate`; `Mandate 1—* BudgetReservation *—1 WorkOrder`; `Provider 1—* Service 1—* Quote *—1 WorkOrder`; `WorkOrder 1—* WorkOrderEvent / Evidence / Dispute / LedgerEntry / SettlementReceipt`; `Organisation 1—* TreasuryAccount 1—* TreasuryTx`; `WebhookEvent / OutboxEvent / EventCheckpoint / IdempotencyKey / AuditLog` platform-wide. Full DDL: `prisma/schema.prisma`.

## 11. Failure recovery

- RPC timeout after broadcast → signature-status probe on next attempt (no blind rebroadcast of financial writes).
- Worker crash → checkpointed claims; unacked events reprocessed idempotently.
- Duplicate webhook → dedup by external id; processing is idempotent by design.
- Provider/DB/Redis-equivalent outage → health shows DEGRADED; policy engine default-denies on unavailable critical checks; queues drain on recovery.
- Emergency pause → global kill switch blocks new work orders; in-flight settlement continues under review.

## 12. Deployment architecture

Staging: single Next.js process (sandbox), SQLite on persistent volume, workers in-process, cron-style scheduler; health endpoint aggregated. Production target (documented, not built here): split API/web/worker containers, managed Postgres, Redis-backed queues, key management service, WAF, SIEM log sink, blue-green deploys with migration gates. Deployment is **blocked** by release gates in `docs/status/RELEASE_READINESS.md`.
