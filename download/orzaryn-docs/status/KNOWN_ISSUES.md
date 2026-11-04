# ORZARYN — Known Issues (Stage 25)

Every item below is a **real, currently-open issue**. Nothing here is cosmetic.

| ID | Severity | Area | Issue | Impact | Workaround / Plan |
| --- | --- | --- | --- | --- | --- |
| KI-1 | HIGH | Blockchain | Anchor program is **UNCOMPILED** — no Rust/Solana/Anchor toolchain in this environment (ADR-003) | Onchain enforcement of escrow invariants does not exist in staging; offchain policy is the only active enforcement layer | Compile + `anchor test` in CI with Solana tooling; gate G2 blocks any production path |
| KI-2 | HIGH | Alchemy | Agent Wallet signing capability **UNVERIFIED** (ADR-007); no API credentials configured in sandbox | Cannot confirm custom-program instruction support; chain ops run in DEMO mode only | Staging probe with credentials; capability report before pilot |
| KI-3 | MEDIUM | Architecture | Single-process worker + SQLite (ADR-005/006) | No horizontal scale; SQLite serialises writes; staging-grade only | Postgres + queue extraction checklist in RELEASE_READINESS |
| KI-4 | MEDIUM | Providers | Provider-side actions use a staging provider claim (`x-orz-provider` header / `providerIdClaim`) rather than an authenticated provider portal | Anyone with org access can simulate provider accept/deliver for their org's orders (integrity of *staging* demos only; no financial authority) | Provider portal with wallet-challenge auth before pilot; see SF-3 |
| KI-5 | MEDIUM | Identity | No email verification or email-delivered invitations (tokens returned in-app) | Account ownership not proven by email; acceptable for staging | Email provider integration + verified-signup flow |
| KI-6 | MEDIUM | Evidence | Malware scanning is a stub (type/size/hash only) | Malicious file could be stored and later downloaded by a reviewer | AV scan hook + content-disposition hardening before pilot |
| KI-7 | LOW | Notifications | No outbound notifications (approvals, deliveries) | Users must poll the console | Notification service + email/webhook fanout |
| KI-8 | LOW | Frontend | Single-route view router (sandbox gateway exposes `/` only, ADR-008) | No per-view SSR/URL semantics beyond `?view=` | Map views to real route files at deployment |
| KI-9 | LOW | Sessions | Session revocation on password change not yet wired to wallet links panel | Stale sessions could linger after credential rotation | Wire revokeUserSessions into password change flow |
| KI-10 | LOW | Mandates | Daily/weekly/monthly limits computed from work-order sums (not from reservation lifecycle) | Edge: cancelled-after-funding orders still count toward period spend until state advances | Acceptable conservatism; revisit with milestone accounting (PRD §15.5) |
| KI-11 | LOW | Tests | Fault-injection scenarios (RPC timeout after broadcast, DB outage mid-flow) covered by design (breaker + status probe) but not automated | Recovery behaviour verified by reasoning + manual demo, not CI | Chaos harness in CI (ChaosKill worker, RPC proxy faults) |
| KI-12 | LOW | Demo data | Two demo work orders from iterative runs remain in FUNDED→REFUNDED / COMPLETED states | None (clearly DEMO-labelled) | `bun scripts/seed.ts` is idempotent; reset via `db:reset` if needed |

**Verification commands:** `bun test`, `bun run lint`, `npx tsc --noEmit`, `bun scripts/demo-scenario.ts`.
