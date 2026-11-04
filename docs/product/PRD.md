# ORZARYN — Product Requirements Document (Stage 3)

- **Version:** 1.0 · 2026-11-05
- **Status:** Approved for staging build (testnet-only). External pilot gated per `MARKET_VALIDATION.md` §11.
- **Companion docs:** `MARKET_VALIDATION.md`, `../architecture/SYSTEM_ARCHITECTURE.md`, `../design/DESIGN_SYSTEM.md`

---

## 1. Problem

Enterprises increasingly run AI agents that need to purchase services (data work, development tasks, content, integrations), but there is no safe, auditable way for an agent to spend company money on **discrete work with delivery obligations**. Card rails and per-call crypto payments (x402) assume small, instant purchases with no acceptance conditions, no escrow, and no dispute path — the opposite of B2B service procurement, where payment follows delivery acceptance. The result: humans manually gatekeep every purchase (no autonomy gains), or agents spend with inadequate controls (unacceptable risk).

## 2. Target customers

- **Primary:** Ops/AI-platform leaders at 50–2,000-person technology-forward companies operating autonomous agents in production (see ICP in `MARKET_VALIDATION.md` §3).
- **Supply side:** Verified service providers (studios, dev shops, data-labeling firms) willing to accept USDC settlement.
- **Not targeted at MVP:** Regulated institutions; ERP-integrated procurement; consumer agents.

## 3. Product proposition

ORZARYN is the control plane for agent procurement: businesses **register agents, grant spending mandates, and approve purchases by exception**, while agents **discover approved services, obtain quotes, and buy work orders** whose funds sit in escrow and are **released only when the buyer accepts the delivered evidence**. Every action is attributable to a verified principal; every dollar amount is represented in integer minor units across proposed → reserved → escrowed → released/refunded states; settlement is USDC on Solana (testnet in staging).

**What ORZARYN is not:** a general wallet provider, a payment-protocol validator, a token issuer, or a trustless alternative to legal contracts. It does not custody seed phrases, does not guarantee provider quality, and makes no regulatory or yield claims.

## 4. Core workflows

1. **Organisation setup:** signup → verify email → create org → invite members → assign roles → (optional) verify org treasury wallet via signed challenge.
2. **Agent onboarding:** register agent (identity + authorised signer + API key) → assign permissions → grant mandate → agent becomes ACTIVE.
3. **Provider onboarding:** provider applies → review → APPROVED → publishes service listings with pricing.
4. **Agentic purchase:** agent discovers permitted service → requests quote → receives priced quote with terms hash → submits purchase proposal → policy engine evaluates (deterministic, with reason codes) → within thresholds: auto-reserve budget; above: human approval → work order created → escrow funded (testnet) → provider accepts & delivers evidence → buyer review → release / reject / dispute / refund.
5. **Human oversight:** approval centre for over-threshold purchases; revocation and emergency pause; treasury funding; reconciliation and CSV export; dispute resolution.

## 5. User journeys (abridged)

- **J1 — Controller grants autonomy:** Finance Controller creates a mandate: agent "atlas-01", ≤ $250/purchase, ≤ $1,000/day, approved providers only, expires 2026-Q1, requires human approval ≥ $500. System records mandate version, creator, and hash.
- **J2 — Agent buys legally:** Agent authenticates with API key + signs challenge → requests quote Q-8231 ($180) → policy engine returns `APPROVE` (reason: WITHIN_MANDATE) → budget atomically reserved → WO-2026-0031 created → escrow funded → provider delivers → evidence hash verified → controller accepts → release recorded → receipt + ledger entries.
- **J3 — Agent tries to overspend:** same agent proposes $600 purchase → `DENY: REQUIRES_APPROVAL (amount ≥ per-purchase threshold)` → item appears in Approval Centre; approver approves → proceeds; or rejects → reservation released.
- **J4 — Revocation race:** admin revokes agent mid-session → agent's next tool call fails `AGENT_REVOKED` → active work orders settle out but **no new purchases**; revocation is effective immediately for new policy evaluations.
- **J5 — Delivery failure:** provider misses deadline → buyer rejects evidence → dispute → refund path returns escrow to org treasury; both sides see full event timeline.

## 6. Functional requirements (MVP)

| ID | Requirement |
| --- | --- |
| F1 | Email/password signup + login, scrypt-hashed; sessions via HMAC-signed opaque cookies, rotation on login, expiry, revocation on password change. |
| F2 | Wallet verification via expiring (10-min), single-use Ed25519 challenges; canonical message; server-side signature verification; replay-proof (nonce consumed atomically). |
| F3 | Organisations with slug, status, members, invitations (tokenised, expiring, single-use), RBAC roles: OWNER/ADMIN/TREASURER/APPROVER/OPERATOR/VIEWER. |
| F4 | Agent Registry: stable agent identity, parent org, developer label, status lifecycle (REGISTERED→ACTIVE→SUSPENDED→REVOKED), authorised signer fingerprint, scoped permissions, usage metrics, audit history. Agents cannot self-modify permissions or treasury rules. |
| F5 | Mandates: versioned; per-purchase / daily / weekly / monthly / aggregate limits; token+network binding; provider allowlist; service-category restrictions; validity window; revocation with reason; immediate effect on new policy evaluations. |
| F6 | Policy engine: deterministic, pure function over (identity, mandate, provider, service, token, network, amount, budgets, reservations, velocity, concurrency, thresholds); returns decision + ordered reason codes; **default-deny** when any critical dependency is unavailable. Atomic budget reservation (conditional decrement; two concurrent requests cannot consume the same budget). |
| F7 | Provider directory: application → UNVERIFIED/SUBMITTED/UNDER_REVIEW/APPROVED/SUSPENDED/REJECTED; profile; wallet verification; service listings with versioning; provider allowlist enforcement; protections against impersonation, expired quotes, wallet substitution (all provider mutations authenticated + audited). |
| F8 | Quotes: requested by agents, issued by providers, amount in minor units, terms hash (SHA-256 over canonical terms JSON), expiry with sweep, single-use acceptance. |
| F9 | Work orders: unique human-readable ID; org, agent, provider, service, amount, asset, network, terms hash, deadline, acceptance conditions; immutable terms snapshot; full state machine (see §7) with server-side transition validation and principal attribution on every event. |
| F10 | Evidence: authenticated provider submissions (files or structured metadata) with SHA-256 content hashes, versioning, timestamps, buyer review (approve / request-revision / reject / dispute); only evidence **hashes** recorded onchain commitments — never file contents or PII. |
| F11 | Settlement: release (human-approved above threshold), refund, milestone-capable ledger; separate balances for proposed / reserved / escrowed / released / refunded / fees / pending settlement; every entry traceable to a source operation; settlement receipts with chain signature reference. |
| F12 | Agent API (MCP-style, narrow tools): discover_services, request_quote, submit_proposal, inspect_mandate, get_work_order, get_evidence_state, request_approval. All calls carry authenticated agent context; agents cannot invoke chain adapter or policy internals directly. |
| F13 | Events: webhook ingestion with HMAC signature verification, durable inbox, dedup by external event id, persist-before-ack, worker with retries/backoff, dead-letter, checkpoints; outbox for outbound publishes; historical reconciliation job comparing ledger vs escrow state. |
| F14 | Treasury: org treasury accounts (testnet), deposits recorded with tx signature, balances by state, withdrawal requests requiring TREASURER + approval, reconciliation view, CSV export. |
| F15 | Admin console (platform operators): provider reviews, global metrics, emergency pause (blocks all new work orders), dead-letter inspection/replay, agent org management. |
| F16 | Reports: settlement history, ledger export (CSV), audit export, policy decision log. |

## 7. Work-order state machine (normative)

States: `DRAFT → PENDING_APPROVAL → APPROVED | REJECTED → FUNDED (escrow) → ACCEPTED (provider) → DELIVERED → IN_REVIEW → COMPLETED (released) | DISPUTED → REFUNDED | CANCELLED`

Illegal transitions are rejected server-side with reason codes (e.g. `INVALID_TRANSITION`). Transitions allowed only by authorised principal types (buyer-org roles, provider principal, agent within mandate, system worker). Every transition appends an immutable `WorkOrderEvent` with actor identity, reason and metadata.

## 8. Nonfunctional requirements

| ID | Requirement |
| --- | --- |
| N1 | **Money integrity:** all amounts BigInt minor units; no floating point anywhere in money paths; checked arithmetic; atomic reservation. |
| N2 | **Security:** default-deny policy; rate limiting on auth + agent APIs; webhook signature verification; idempotency keys on all financial POSTs; audit log for every privileged action; no secrets in code or logs. |
| N3 | **Reliability:** timeouts + retry with exponential backoff and full jitter on outbound calls; circuit breaker on chain provider; worker recovery after crash; duplicate webhooks processed exactly once. |
| N4 | **Auditability:** append-only audit log; immutable work-order events; CSV export; request IDs on every API response and log line. |
| N5 | **Privacy:** deliverables and PII stay off-chain; only hashes/commitments on-chain; evidence storage access-controlled. |
| N6 | **Performance (staging targets):** policy evaluation < 50 ms p95; API p95 < 300 ms excluding chain; health check reflects real dependency status. |
| N7 | **Accessibility:** WCAG 2.1 AA intent — keyboard navigable, semantic HTML, ARIA labelling, visible focus, reduced-motion support. |
| N8 | **Honesty:** no fake confirmations; DEMO/TESTNET state always visible in UI; degraded dependencies surface as degraded, not silently mocked. |

## 9. Permissions matrix (summary)

| Action | OWNER | ADMIN | TREASURER | APPROVER | OPERATOR | AGENT | PROVIDER |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Manage org/members | ✅ | ✅ | — | — | — | — | — |
| Create/modify mandates | ✅ | ✅ | — | — | — | — | — |
| Fund treasury / withdraw | ✅ | — | ✅ | — | — | — | — |
| Approve purchases | ✅ | ✅ | — | ✅ | — | — | — |
| Register/suspend agents | ✅ | ✅ | — | — | — | — | — |
| Request quotes / propose purchases | — | — | — | — | ✅ | ✅ (within mandate) | — |
| Submit evidence | — | — | — | — | — | — | ✅ |
| Accept evidence / release | ✅ | ✅ | — | ✅ | — | — | — |
| Dispute | ✅ | ✅ | — | ✅ | — | — | ✅ |
| View financials | ✅ | ✅ | ✅ | ✅ | own | own | own |

## 10. Security requirements

Threat-model-driven (see `../architecture/SYSTEM_ARCHITECTURE.md` §9): authentication (scrypt, timing-safe comparisons), session security (HttpOnly, SameSite=Lax, Secure in prod, hashed tokens at rest), authorisation (server-side checks on every route; role + ownership + status gates), input validation (zod on every boundary), financial controls (idempotency, atomic reservation, transition validation, human approval gates), webhook abuse prevention (HMAC + replay window + rate limit), file safety (type/size allowlist, hash verification, malware-scan hook documented), rate limits per principal, and security headers. Findings tracked in `../status/SECURITY_FINDINGS.md`.

## 11. Financial rules

1. Money is integer minor units (USDC: 6 decimals).
2. Ledger states are distinct and never merged: proposed, reserved, escrowed, released, refunded, fees, pending settlement.
3. A work order's funded amount must equal escrow-in; release + refund ≤ escrow-in (one-time settlement enforced).
4. Budget reservation is atomic; expired reservations are swept and returned to available budget.
5. Platform fee is **disabled by default** (`PLATFORM_FEE_BPS=0`); when enabled by authorised config, fee entries are separate ledger rows, never netted silently.
6. Testnet only in this build; every chain-touching operation records `network` and degrades to DEMO mode (clearly labelled) when no RPC credentials are configured.

## 12. Commercial boundaries

No token economics. No interest/yield on escrow. No guarantees of provider delivery quality (reputation is deferred). No custody of buyer seed phrases. No mainnet settlement in this build. Fee switching default-off. Any change to these boundaries requires principal sign-off (directive rule 6).

## 13. Integration requirements

- **Alchemy (app id `q15y93g86sfgd0rb`):** Solana RPC via env-configured endpoint; health/slot/signature-status queries; transaction submission interface; webhook ingestion with HMAC secret from env; capability probe surfaced in health + admin; adapter isolated behind `ChainProvider` interface. **Unverified capabilities must be marked unverified** until a live check passes.
- **Auth-free public APIs:** none — every API except `/api/health` requires authentication (platform key or session).

## 14. MVP scope

In scope: F1–F16, N1–N8, the 18 frontend views listed in the directive (implemented as in-app views), demo/testnet seed data clearly labelled, documentation suite, test suite (unit + integration via Node test runner), Anchor program source (uncompiled, marked).

**Deferred (explicitly):** mainnet deployment; real USDC custody integration; EVM rollup; reputation system; multi-asset support beyond USDC (SPL); notifications (email/webhook outbound to users); SSO/SAML; mobile apps; i18n beyond en; sub-orgs; marketplace self-serve onboarding (directory stays curated).

## 15. Ambiguities identified (not invented around)

1. **Alchemy Agent Wallet custom-program signing support** — documentation could not be verified from this environment; flagged for verification in staging (ADR-007).
2. **Escrow legal classification** per user jurisdiction — requires legal review before production (gated in `RELEASE_READINESS.md`).
3. **Provider KYB requirements** — depth of identity verification for providers is a business decision deferred to the pilot.
4. **Platform fee commercial terms** — default-off until pricing hypotheses are validated.
5. **Milestone payment splits** (partial releases) — modelled in ledger but deferred in UI/state machine to keep the MVP state machine single-release.

## 16. Acceptance criteria (MVP / staging demo)

1. Complete happy path of directive Stage 23 executes end-to-end in the application with testnet/degrade-honest semantics: org → agent → mandate → fund → discover → quote → policy authorise → work order → escrow (simulated or testnet) → accept → deliver → review → release → receipts → reconcile → export.
2. All 10 failure scenarios of Stage 23 produce the documented outcomes (deny codes, releases, refunds, dead-letter recovery).
3. Concurrent double-purchase attempt results in exactly one reservation (test included).
4. Revoked agent cannot complete any purchase attempt (test included).
5. All money assertions pass with integer arithmetic; ledger balances reconcile to zero unexplained delta.
6. `bun run lint` passes; TypeScript strict compiles; unit + integration suites pass; UI verified in browser end-to-end.
