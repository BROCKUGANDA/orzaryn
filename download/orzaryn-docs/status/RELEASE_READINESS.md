# ORZARYN — Release Readiness (Stage 24)

**Current verdict: NOT RELEASE-READY — external pilot is NO-GO.** Staging build is complete and verified end-to-end; the gates below are the explicit path to pilot and production. This file is the authoritative checklist.

## Release gates

| # | Gate | Status | Evidence required to pass |
| --- | --- | --- | --- |
| G1 | Product workflow works end-to-end (Stage 23 scenario) | ✅ PASS (staging) | `bun scripts/demo-scenario.ts` — 18-step happy path + failure scenarios |
| G2 | Critical contracts independently security-reviewed | ❌ BLOCKED | Anchor program compiled + `anchor test` green + external review of `program/orzaryn-escrow` |
| G3 | Alchemy Agent Wallet capability verified | ❌ BLOCKED | Staging probe with credentials; custom-instruction support confirmed or documented fallback adopted (ADR-007) |
| G4 | Financial policies enforced with reconciliation | ✅ PASS (offchain, staging) | Policy engine tests + reconciliation MATCH runs; ⚠️ onchain enforcement absent until G2 |
| G5 | Production authorities secured (KMS, rotation, dual control) | ❌ OPEN | Key inventory + KMS integration + rotation runbook |
| G6 | CI: lint + tsc + unit + integration + dependency/secret scanning | ❌ PARTIAL | Tests/lint/tsc pass locally; CI pipeline + scanners not wired |
| G7 | Legal review (escrow classification, MSB/money-transmission posture, ToS, jurisdiction) | ❌ OPEN | Written legal opinion — **required before any real-value settlement** |
| G8 | Monitoring operational (alerts on health/DLQ/reconciliation mismatch) | ❌ PARTIAL | Health + admin console done; alerting channels not wired |
| G9 | Disaster recovery tested (DB restore, worker crash, RPC outage) | ❌ PARTIAL | Recovery designed (checkpoints, idempotency); restore drill not executed |
| G10 | Rollback procedures verified | ❌ OPEN | Migration rollback + pause/rollback drill |
| G11 | **Mainnet deployment explicitly approved by principal** | ❌ NEVER ASSUMED | Written authorisation; directive rule 7 |

## Pilot checklist (after G2/G3/G7 — testnet or zero-value only)

1. Postgres migration executed (ADR-005 checklist): datasource swap, row-locked reservation, shared rate limiter, queue extraction.
2. Provider portal live (wallet-challenge verified providers; removes SF-3).
3. Email verification + notification fanout (KI-5/KI-7).
4. Evidence AV scanning (KI-6).
5. Platform-operator identity model (SF-8).
6. Interview program executed per `MARKET_VALIDATION.md` §9 with ≥3 signed design partners.

## Rollback plan (summary)

- Emergency pause (`POST /api/ops {action:"pause"}`) halts new work orders platform-wide; audited.
- In-flight orders complete or refund through the dispute path; ledger reconciliation confirms zero unexplained deltas.
- DB: SQLite file snapshot before migrations; Postgres: migration down-scripts + point-in-time restore (to be drilled — G9).
- Chain: no mainnet authority exists in this build; testnet refs are DEMO-labelled.

## Sign-off record

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Principal / product owner | — | Pending (this document defines what they are approving) | — |
| Engineering agent | Principal agent (automated) | Staging complete; production NO-GO until gates above | 2026-11-05 |
