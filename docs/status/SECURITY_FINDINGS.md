# ORZARYN — Security Findings (Stage 20)

**Posture:** threat model in `docs/architecture/SYSTEM_ARCHITECTURE.md` §9. Findings below are the result of the hardening pass performed during this build. Blockers are marked and gate releases.

## Fixed during this build

| ID | Finding | Fix (file references) |
| --- | --- | --- |
| F-1 | Session principal carried no org role → every role-gated route would have failed closed but RBAC was unenforceable from the session | Role resolved server-side from membership on every request (`src/lib/auth.ts::userFromCookies`) |
| F-2 | Provider transitions (`accept`/`deliver`) had no authenticated path | Explicit provider claim limited to the work order's provider of record + APPROVED status, actions limited to accept/deliver (`src/app/api/work-orders/[id]/transition/route.ts`) — residual risk tracked as SF-3 |
| F-3 | Wallet challenge consumption was check-then-act | Single-use consumption via conditional `updateMany(consumedAt: null)` (`src/lib/wallet.ts`) |
| F-4 | Budget reservation could double-spend under concurrency | Conditional-decrement reservation; verified by a two-actor race test (`src/lib/policy.ts`, `tests/integration.test.ts`) |
| F-5 | Quote double-acceptance possible | Single-use acceptance guard (`updateMany` where status=ISSUED) + compensating reservation release on failure (`src/lib/workorder.ts`) |
| F-6 | One-time settlement not enforced in ledger flow | `fundingStatus: ESCROWED → RELEASED/REFUNDED` conditional guard + escrow invariant (`released+refunded+fees ≤ escrowed`) checked before settlement and in reconciliation (`src/lib/workorder.ts`, `src/lib/ledger.ts`, `src/lib/events.ts::reconcileOnce`) |

## Open findings (tracked; blockers marked)

| ID | Severity | Finding | Notes / gate |
| --- | --- | --- | --- |
| SF-1 | **BLOCKER (production only)** | No independent smart-contract security review — program is uncompiled (ADR-003) | Gate G2 |
| SF-2 | HIGH | Secrets management: secrets are env-only (good) but there is no KMS/secret rotation; `SESSION_SECRET` in `.env` is a dev value | Production checklist: KMS + rotation |
| SF-3 | MEDIUM | Provider actions authenticated by staging claim, not a provider-portal session (KI-4) | Provider portal with wallet challenge before pilot |
| SF-4 | MEDIUM | Webhook endpoint accepts unverified events into the inbox (by design, for evidence), but if `ALCHEMY_WEBHOOK_SECRET` is unset ALL events dead-letter as unverified — availability issue, not integrity | Configure secret in staging; alarm on unverified rate |
| SF-5 | MEDIUM | No email verification (KI-5) — signup identity is password-only | Pre-pilot |
| SF-6 | MEDIUM | Evidence malware scan stubbed (KI-6) | Pre-pilot |
| SF-7 | LOW | Rate limits are in-process (per-instance); multi-node deployment needs a shared limiter | Postgres/Redis migration checklist |
| SF-8 | LOW | Admin console restricted to OWNER/ADMIN org roles; platform-level operator identity not yet modelled | Pilot: platform operators as members of a dedicated org |
| SF-9 | LOW | Dependency/secret scanning not yet in CI | Add `npm audit` + gitleaks to CI (G6) |
| SF-10 | LOW | Security headers (CSP/HSTS) not configured in sandbox (gateway-controlled) | Configure at deployment edge |

## Testing coverage against the Stage 20 checklist

- Architecture threat modelling: done (§9) ✔
- Authentication review: done (scrypt, hashed tokens, HMAC cookies, generic errors, lockout counters present) ✔
- Permission review: RBAC matrix unit-tested; server-side enforcement verified in demo ✔
- API security tests: rate limits, validation, uniform errors — manual + demo ✔ (automated API fuzzing pending)
- Smart-contract fuzzing/invariant testing: **blocked** on toolchain (KI-1) ✖
- Dependency scanning: pending CI (SF-9) ✖
- Secret scanning: none in repo (manual check); CI pending (SF-9) ✔/✖
- Injection testing: zod at every boundary; Prisma parameterised ✔
- Replay testing: wallet challenges (single-use) + webhook dedup + idempotency keys tested ✔
- Webhook abuse testing: invalid-signature dead-letter path implemented; manual check ✔
- File-upload testing: type/size allowlist enforced; hash verified; storage paths server-side ✔
- Rate-limit testing: token bucket; auth endpoints tightened ✔
- Administrative-access testing: ops console gated; pause audited ✔
