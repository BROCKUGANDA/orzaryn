# ORZARYN — Build Status (Stage 25, continuous execution report)

- **Updated:** 2026-11-05 · by the principal engineering agent
- **Environment:** sandbox staging · Next.js 16 + Prisma/SQLite · testnet/DEMO only

---

## FEATURE: Identity, organisations, RBAC, wallet challenges (Stages 7)
**STATUS:** COMPLETE (staging)
FRONTEND: auth/signup/login/logout + org onboarding + role-aware navigation
BACKEND: /api/auth/*, /api/orgs, /api/orgs/invitations(+accept), /api/wallet
DATABASE: User/Session/WalletLink/AuthChallenge/Membership/Invitation
BLOCKCHAIN: Ed25519 challenge verification (tweetnacl), single-use nonces
ALCHEMY: n/a
SECURITY: scrypt passwords, hashed session tokens, HMAC-signed cookies, per-IP auth rate limits
TESTS: challenge message unit tests; live signup→org→invite flow exercised in demo
EVIDENCE: `bun test` 16 passing; demo-scenario steps 1–3
REMAINING RISKS: no email verification (invitations delivered as tokens in-app)
NEXT ACTION: email delivery integration before pilot

## FEATURE: Agent Registry + API keys (Stage 8)
**STATUS:** COMPLETE (staging)
FRONTEND: Agents view with register/activate/suspend/revoke/issue-key
BACKEND: /api/agents, /api/agents/[id], /api/agents/[id]/keys
DATABASE: Agent/ApiKey (hashed secrets, keyId lookup)
BLOCKCHAIN: signer address recorded (verification via wallet challenge)
ALCHEMY: n/a
SECURITY: agent cannot self-modify; revocation revokes keys and blocks purchases immediately (verified)
TESTS: integration test "DENY revoked agent immediately"; demo step 16
EVIDENCE: demo-scenario [16] AGENT_REVOKED
REMAINING RISKS: single signer per agent (no key rotation history)
NEXT ACTION: signer rotation with dual control

## FEATURE: Policy & budget engine (Stage 9)
**STATUS:** COMPLETE (staging) — deterministic, reason-coded, default-deny
FRONTEND: mandate editor + BudgetMeter; denial reason codes surfaced in Purchase view
BACKEND: src/lib/policy.ts (evaluatePolicy) wired into /api/work-orders + /api/mcp
DATABASE: Mandate (availableBudget atomic), BudgetReservation
BLOCKCHAIN: n/a (offchain enforcement; onchain mirror is ADR-003 gap)
ALCHEMY: n/a
SECURITY: atomic conditional-decrement reservation; concurrency race tested
TESTS: integration suite — APPROVE/REQUIRE_APPROVAL/DENY paths + concurrent reservation race (exactly one of two 700/1000 reservations succeeds)
EVIDENCE: tests/integration.test.ts 6/6; demo [15] DENY with reason codes
REMAINING RISKS: SQLite single-writer assumption documented in ADR-005; Postgres migration requires row-lock change
NEXT ACTION: Postgres migration checklist execution before any multi-node deployment

## FEATURE: Provider directory + quotes (Stage 10)
**STATUS:** COMPLETE (staging)
FRONTEND: Providers view (apply/review/suspend/verify-wallet/publish-service), marketplace view
BACKEND: /api/providers, /api/providers/[id], /api/services, /api/quotes
DATABASE: Provider/Service/Quote with statuses + terms hashes
BLOCKCHAIN: n/a
ALCHEMY: n/a
SECURITY: duplicate-name impersonation guard; allowlist enforcement in engine
TESTS: exercised in demo (3 providers seeded, 2 APPROVED, 1 UNDER_REVIEW)
EVIDENCE: demo steps 6–7
REMAINING RISKS: provider wallet verification is admin-asserted (challenge-based verification wired for user wallets; provider portal pending)
NEXT ACTION: provider portal with wallet-challenge verification

## FEATURE: Work-order engine (Stage 11)
**STATUS:** COMPLETE (staging) — full state machine with server-side transition validation
FRONTEND: work orders list + detail (timeline, terms snapshot, money states, actions)
BACKEND: src/lib/workorder.ts TRANSITIONS table; /api/work-orders/[id]/transition
DATABASE: WorkOrder/WorkOrderEvent (immutable, seq-attributed)
BLOCKCHAIN: escrow movements carry DEMO refs (live path requires compiled program)
ALCHEMY: submitTransaction via adapter
SECURITY: illegal transitions rejected; principal attribution on every event; one-time settlement guard
TESTS: demo happy path + dispute/refund path; invalid-transition error surfaced in UI
EVIDENCE: demo [8]–[12], refund run (REFUNDED/SETTLED), reconciliation 0 mismatches
REMAINING RISKS: onchain enforcement absent until Anchor program compiled (G2)
NEXT ACTION: toolchain + anchor test suite (program/orzaryn-escrow)

## FEATURE: Alchemy integration (Stage 12)
**STATUS:** COMPLETE as adapter; **RPC READ PATH LIVE VERIFIED (2026-11-05, solana-devnet)** — Agent Wallet signing remains UNVERIFIED (ADR-007) and escrow submission is LEDGER-ONLY until KI-1
FRONTEND: health + capability surfacing (Admin console, dashboard)
BACKEND: src/lib/chain/{provider,alchemy-solana}.ts — RPC getHealth/getSlot/balances/signature-status/submit + HMAC webhook verification
DATABASE: WebhookEvent inbox
BLOCKCHAIN: Solana-only adapter (EVM explicitly not assumed)
ALCHEMY: app id q15y93g86sfgd0rb + API key configured (gitignored .env) → solana-devnet live RPC verified; webhook secret absent → webhooks recorded but unverified (SF-4)
SECURITY: HMAC verify, replay-window via dedup, circuit breaker
TESTS: health endpoint reflects real dependency status; webhook dedup in demo [17]
EVIDENCE: /api/health shows mode+capabilities; Agent Wallet signing: UNVERIFIED (ADR-007)
REMAINING RISKS: everything "live" is unverified until credentials + staging probe; Agent Wallet custom-instruction support unknown (hard gate G3)
NEXT ACTION: staging probe with credentials; capability report

## FEATURE: Evidence & settlement & ledger (Stages 14–15)
**STATUS:** COMPLETE (staging)
FRONTEND: EvidencePanel actions in work-order detail; Settlement receipts; Ledger grid + CSV
BACKEND: /api/work-orders/[id]/evidence (hash commitment, type/size validation, server-side storage); ledger postings idempotent
DATABASE: Evidence/LedgerEntry/SettlementReceipt/TreasuryAccount/TreasuryTx
BLOCKCHAIN: content off-chain; only SHA-256 commitments recorded
ALCHEMY: release/refund references (DEMO)
SECURITY: integer minor units everywhere; one-time settlement; escrow invariant check
TESTS: demo release receipt SR-FB8372; refund receipt; reconcile MATCH; invariant shown in UI
EVIDENCE: demo [13] + refund run; /api/ledger?format=csv
REMAINING RISKS: evidence malware scan is a documented stub (file-type/size only)
NEXT ACTION: AV scanning hook in production checklist

## FEATURE: Agent API / MCP tools (Stage 16)
**STATUS:** COMPLETE (staging)
FRONTEND: Developer portal (tools, auth, error codes, sample curl, testnet guide)
BACKEND: /api/mcp with 8 narrow tools, agent-key auth, policy-path-only access
DATABASE: n/a (uses domain tables)
BLOCKCHAIN: agents cannot reach chain adapter (enforced by surface)
ALCHEMY: n/a
SECURITY: no anonymous enumeration; agent key hashed; scopes field ready
TESTS: demo steps 6–8, 15–16 exercise tools incl. denial paths
EVIDENCE: scripts/demo-scenario.ts output
REMAINING RISKS: not a full MCP stdio server (HTTP JSON-RPC-style; stdio adapter deferred)
NEXT ACTION: publish SDK package + typed client generation

## FEATURE: Events & reconciliation (Stage 17)
**STATUS:** COMPLETE (staging)
FRONTEND: Admin console DLQ inspection + replay + reconcile buttons
BACKEND: src/lib/events.ts (inbox persist-before-ack, dedup, retries w/ jitter, DLQ, outbox, checkpoints, sweeps, reconciliation)
DATABASE: WebhookEvent/OutboxEvent/EventCheckpoint/ReconciliationRecord
BLOCKCHAIN: Solana log forward events recorded (type program_log)
ALCHEMY: webhook endpoint /api/webhooks/alchemy
SECURITY: signature-invalid events never processed (recorded + dead-lettered)
TESTS: demo [17] dedup; reconciliation run MATCH; worker checkpoints visible in health
EVIDENCE: /api/health worker check; admin console
REMAINING RISKS: single-process worker (ADR-006)
NEXT ACTION: queue extraction at scale-out

## FEATURE: Frontend 18 views (Stage 18)
**STATUS:** COMPLETE (staging) — single-route internal view router (ADR-008)
FRONTEND: home, auth, onboarding, dashboard, agents, mandates, providers, quotes/marketplace, purchase, approvals, work orders, work-order detail, settlements, disputes, treasury, reports, developers, admin — all with loading/empty/error/success/degraded states, permission-aware controls, responsive layout, dark ORZARYN design system
BACKEND: real API integration throughout (TanStack Query)
DATABASE: n/a
BLOCKCHAIN: DEMO-labelled chain references rendered honestly
ALCHEMY: health banner reflects real mode
SECURITY: UI hides unauthorised actions; server enforces regardless
TESTS: browser verification pass (see final report); lint+tsc clean
EVIDENCE: application at /
REMAINING RISKS: URL semantics limited to ?view= (sandbox gateway)
NEXT ACTION: map views to real routes on non-sandbox deployment

## FEATURE: Reliability module + tests (Stages 19, 21)
**STATUS:** COMPLETE
FRONTEND: error states + retry everywhere
BACKEND: src/lib/reliability.ts (timeout, retry full-jitter, circuit breaker), idempotency keys on financial POSTs, rate limiter
DATABASE: IdempotencyKey
BLOCKCHAIN: no blind rebroadcast — signature-status probe path defined
ALCHEMY: breaker on RPC
SECURITY: default-deny on degraded dependencies
TESTS: bun test — 16 passing (money integrity, canonical hashing, RBAC, challenge, policy paths, concurrency race)
EVIDENCE: test output in build log
REMAINING RISKS: chaos scenarios (RPC timeout post-broadcast, DB outage) are covered by design + breaker, not yet by automated fault injection
NEXT ACTION: fault-injection harness in CI

## FEATURE: Operations (Stage 22)
**STATUS:** COMPLETE (console + playbooks)
FRONTEND: Admin console (health, capabilities incl. Agent Wallet UNVERIFIED, DLQ replay, reconcile, emergency pause with audited reason)
BACKEND: /api/ops
DATABASE: SystemControl kill switch
BLOCKCHAIN: n/a
ALCHEMY: health probe
SECURITY: pause/resume audited; restricted to OWNER/ADMIN
TESTS: pause/resume exercised manually; reconciliation via demo
EVIDENCE: docs/ops/INCIDENT_PLAYBOOKS.md (9 playbooks)
REMAINING RISKS: alerting channels (email/PagerDuty) not wired
NEXT ACTION: alerting integration

## FEATURE: Staging demonstration (Stage 23)
**STATUS:** COMPLETE — happy path + failure scenarios all verified
EVIDENCE: `bun scripts/demo-scenario.ts` output (18 steps) — see docs/status/DEMO_RUNBOOK.md
NEXT ACTION: rerun after each milestone (runbook included)

---

## FINAL VERIFICATION APPENDIX (2026-11-05, post-build)

- **Quality gates:** `bun run lint` 0 errors · `npx tsc --noEmit` 0 errors · `bun test` 16/16 passing (10 unit + 6 integration).
- **Stage 23 demo:** full run recorded in `download/demo-run-evidence.txt` — happy path (quote → policy APPROVE → escrow → evidence → release → receipt) + failure scenarios (over-limit DENY with reason codes, suspended-agent block, webhook dedup, dispute→refund).
- **Browser verification (Agent Browser):** home, auth, dashboard, work-order detail (timeline + money states), agents (show-once key dialog), admin (DLQ replay 1→0), treasury, deep links, mobile (iPhone 14) — all interactive, no console errors.
- **Defects found & fixed during verification:** (1) session principal did not resolve org role → RBAC was unenforceable; fixed server-side. (2) health endpoint returned a bare object where the UI expected the API envelope → dashboard health panel errored; fixed. (3) `escrowInvariant` summed escrow entries without debit/credit direction → inflated escrow figures; fixed to double-entry-aware check (debits==credits excluding informational PROPOSED/RESERVED); reconciliation re-run: 0 mismatches. (4) event worker did not start under hot-reload runtime → lazy bootstrap via health check added.

---

## LOCAL-MACHINE RE-VERIFICATION (2026-11-05, Windows host — independent of prior sandbox)

All Stage 21 gates and the Stage 23 demonstration were re-executed on the local Windows host (Node 26.7.0, npm 11.19.0, bun 1.4.4 via npx) to confirm the snapshot reproduces outside the original sandbox.

- **Quality gates:** `npx tsc --noEmit` 0 errors (exit 0) · `npx eslint .` clean · `npx -y bun test` 16/16 passing (10 unit + 6 integration incl. concurrency race) — all re-verified locally.
- **Stage 23 demo re-run:** exit 0, all 18 steps — happy path (login → discovery → quote → policy APPROVE → escrow → accept → evidence → release → receipts → reconciliation `checked: 5, mismatches: 0`) + failure scenarios (over-limit DENY with reason codes, suspended-agent block, webhook dedup, treasury after flows).
- **Homepage:** GET / → 200, ORZARYN wordmark rendered.

### Defects found & fixed during local re-verification

1. **Split-brain database (config defect, fixed):** `.env` declared `DATABASE_URL="file:./db/orzaryn.db"`, which Prisma resolves against the `prisma/` schema directory → the server ran against an empty `prisma/db/orzaryn.db`, while `scripts/seed.ts` and `tests/integration.test.ts` hardcode `<repo>/db/custom.db`. Result: seed wrote demo users to `db/custom.db`, server logins failed with `UNAUTHENTICATED`. **Fix:** `.env` now uses `file:../db/custom.db` (schema-relative → the shared staging DB); stray `prisma/db/` artifact deleted; `prisma db push` confirms schema in sync on the unified file. Seed and tests left untouched.
2. **Corrupt npm extractions on this host** (network ECONNRESET during install): `react-hook-form` and `@next/swc-win32-x64-msvc` extracted damaged ("not a valid Win32 application" → Turbopack could not start). Both reinstalled cleanly; no code change required. Lesson recorded: after a failed npm install, verify native binaries before diagnosing framework errors.
3. **Environment note (not a defect):** npm's install-script approval gate blocked Prisma postinstall on this host — `npx prisma generate` must be run manually after fresh installs here.

### Still open on this host

- KI-1 unchanged and now broader: **no Rust/Cargo toolchain on the local machine either** — the Anchor program (`program/orzaryn-escrow/src/lib.rs`, 606 lines) remains UNCOMPILED; gate G2 stands.
- KI-2 partially resolved (see appendix below): RPC read path live-verified; Agent Wallet + webhook secret + real-tx submission still open.

---

## ALCHEMY LIVE VERIFICATION (2026-11-05, Windows host — KI-2 partial resolution)

With an Alchemy API key for app `q15y93g86sfgd0rb` configured (gitignored `.env`, never committed):

- **Cluster correction (defect, fixed):** the adapter targeted `solana-testnet.g.alchemy.com`, a domain that does not exist — Alchemy serves Solana mainnet-beta + devnet only, and the configured USDC mint `4zMMC9…` is Circle's **devnet** USDC (the "testnet" label was a misnomer everywhere). Fixed in `.env` and the `env.ts` defaults; staging now targets **solana-devnet** (faucet-issued asset, no real funds — directive rule 5 preserved).
- **Live probe (`scripts/alchemy-probe.ts`, read-only):** RPC getHealth ok (2658ms) · getSlot 518725201 (finalized) · jsonParsed token-account read · synthetic getSignatureStatuses → clean NOT_FOUND · webhook verify fails closed without secret. `/api/health` reports `chainMode: live`, chain check `up`.
- **Escrow submission guard (defect, fixed):** in live mode the escrow/receipt call sites' ASCII descriptor payloads (`escrow-fund:…`) are not Solana transactions; `submitTransaction` now classifies payloads — real transactions go to `sendTransaction` (maxRetries:0, no blind rebroadcast), descriptors fail closed to `LEDGER-ONLY:<descriptor>` references with an explicit "no onchain transaction was sent" note (KI-1 remains the blocker for real escrow). Stage 23 demo re-run in live mode: exit 0, terminal state `COMPLETED/RELEASED/SETTLED` verified, reconciliation 5 checked / 0 mismatches, ledger memos honestly read "live" with LEDGER-ONLY refs.
- **Stage 23 demo-script integrity defect (found & fixed):** the demo script logged escrow/provider/review transition results **without asserting success** (and logged a hardcoded `firstStatus: 200` for the webhook step). One live-mode run therefore printed a full green report while its work order silently stayed APPROVED/UNFUNDED and the receipts shown were stale from earlier runs — a false green (directive principle 11). Fixed: every step now `mustOk`, failure scenarios assert the expected denial codes (`POLICY_DENIED`, suspended-agent block), a terminal-state assertion verifies the order reached `COMPLETED/RELEASED/SETTLED`, and webhook statuses are captured from real responses.
- **Gates re-verified after changes:** tsc 0 errors · eslint clean · 16/16 tests · demo exit 0 with terminal assertion.
- **Remaining under KI-2:** Agent Wallet signing UNVERIFIED (RPC key ≠ Wallet API credentials; separate dashboard setup + probe), `ALCHEMY_WEBHOOK_SECRET` unset (SF-4), real-tx submission unexercised (needs funded devnet transaction + explicit approval), and the RPC key should be **rotated** since it transited an untrusted channel.
