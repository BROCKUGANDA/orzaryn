# ORZARYN — Initial Repository Audit

- **Audited:** 2026-11-05 (UTC+8)
- **Auditor:** Principal Engineering Agent (Stage 1 of the ORZARYN build directive)
- **Scope:** Full repository, toolchain, configuration, and the master product specification as supplied by the principal.
- **Integrity note:** This audit states what actually exists. Nothing has been modified yet.

---

## 1. Executive summary

The ORZARYN workspace is a **greenfield repository**. The build directive repeatedly refers to "the existing repository", "existing frontend", "existing Solana programs", "existing test suites" and "the approved existing Alchemy application". Inspection shows **none of these artifacts exist in the repository**. The only pre-existing file is a placeholder README (`download/README.md`) and a standard Next.js scaffold installed by the sandbox initialization script on 2026-11-05.

Two downstream consequences:

1. **Stage 1 cannot audit prior code** because there is none. This document therefore audits (a) the actual repository state, (b) the runtime toolchain, and (c) the feasibility and risk profile of the master specification itself, so that Stages 6–18 build on documented reality instead of assumed assets.
2. **The Alchemy application id `q15y93g86sfgd0rb` cannot be validated from the repository** — there is no checked-in configuration, no API key material (correctly so), and no network-side access has been granted to this workspace. Stage 12 must treat integration capability as *unverified until a health check passes against a configured endpoint*.

## 2. What actually exists (file references)

| Path | State | Notes |
| --- | --- | --- |
| `/home/z/my-project/download/README.md` | Pre-existing | Single line: "Here are the generated files." Deliverables directory, not source. |
| `package.json` | Scaffold | Next.js 16.1.1, React 19, TypeScript 5, Tailwind CSS 4, Prisma 6.11.1 (SQLite provider), TanStack Query 5, Zustand 5, zod 4, framer-motion 12, shadcn/ui (New York) full set, sonner, lucide-react. No Solana/web3 packages. No test runner configured. |
| `prisma/schema.prisma` | Scaffold default | `User`/`Post` demo models on SQLite. Replaced by the ORZARYN domain schema in Stage 6. |
| `src/app/page.tsx` | Scaffold default | Placeholder logo page. |
| `src/app/layout.tsx`, `src/app/globals.css` | Scaffold default | Geist fonts; Z.ai metadata replaced with ORZARYN identity in Stage 5. |
| `src/components/ui/*` | Scaffold | 47 shadcn/ui primitives (button, table, dialog, tabs, toast, etc.) — reusable per directive Stage 5/6. |
| `bun.lock`, `eslint.config.mjs`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts` | Scaffold | TypeScript strict mode available via tsconfig; enforced for all new code. |
| `examples/websocket/*` | Scaffold | Reference socket.io pattern (gateway + `XTransformPort`). |
| `tests/*.sh` | Scaffold | Sandbox infrastructure scripts, not product tests. |
| `Caddyfile` | Sandbox | Single-port gateway: only `/` is user-visible; backend services reached via `XTransformPort`. |

**Not present:** backend service, product API routes (beyond scaffold stub), database migrations, domain models, smart contracts, Solana programs, wallet integrations, Alchemy configuration, authentication, authorization, design tokens, logos, static brand assets, test suites, CI pipelines, deployment configurations, secrets management, documentation.

## 3. Runtime toolchain inventory

| Capability | Available | Consequence |
| --- | --- | --- |
| Node.js v24.22.2 / bun / npm 11.19.1 | ✅ | Next.js app + TS tooling fully supported. |
| Rust / cargo | ❌ | Anchor program **cannot be compiled or tested** in this environment. |
| Solana CLI (`solana`, `cargo-build-sbf`) | ❌ | No program builds, no devnet deploys from this workspace. |
| Anchor | ❌ | Stage 13 delivers source + test scaffolding, explicitly marked **uncompiled**. |
| Docker | ❌ | No containerized Postgres/Redis. |
| PostgreSQL / Redis binaries | ❌ | Sandbox standard is **SQLite via Prisma**. |
| Outbound network (npm registry, RPC) | ✅ | Package installation works; external RPC reachable only with configured credentials. |

## 4. Specification-vs-environment gaps and required decisions

The directive recommends PostgreSQL + Drizzle, Redis + BullMQ, NestJS/Fastify, and Rust/Anchor. Per operating principle 4 ("do not introduce unnecessary complexity") and the compatibility rule ("verify compatibility with the existing repository before changing its technology stack"), the following deviations are adopted and recorded as Architecture Decision Records:

| Directive suggestion | Adopted instead | ADR |
| --- | --- | --- |
| PostgreSQL + Drizzle | **Prisma + SQLite** (sandbox standard); schema written with portable types (string enums, BigInt money, JSON-as-string columns) so a Postgres migration is mechanical | ADR-005 |
| Redis + BullMQ | **Durable inbox/outbox tables + in-process worker with checkpoints** (same reliability semantics: persist-before-ack, dedup, retry with backoff, dead-letter) | ADR-006 |
| NestJS / Fastify separate backend | **Next.js Route Handlers** for all APIs; module boundaries preserved so extraction remains possible | ADR-004 |
| Rust/Anchor program (compiled) | Anchor source + tests delivered in `program/` workspace; **cannot compile here** — compilation and auditnet/testnet deployment flagged as blocked pending toolchain or CI with Solana tooling | ADR-003 |
| NextAuth.js | **First-party session layer** (scrypt password hashing, HMAC-signed opaque session cookies, expiring single-use wallet challenges) — fewer moving parts for a financial control plane | ADR-002 |

## 5. Risk register (established at Stage 1)

1. **Unverified Alchemy integration.** The application id is known; capabilities (Agent Wallet session signing for custom Solana program instructions, webhook coverage, network enablement) are **unverified**. Mitigation: chain-provider interface with capability probing + health checks; DEMO mode that degrades honestly rather than faking onchain state.
2. **No Rust toolchain.** The onchain program — the ultimate financial backstop — cannot be compiled, tested, or deployed here. Until it exists, **offchain policy enforcement is the only enforcement layer**, which is a material, documented risk (recorded in `docs/status/RELEASE_READINESS.md`).
3. **Single-process runtime.** SQLite + in-process workers are adequate for staging/pilot, not for horizontal scale. Scaling boundaries are documented in ADR-006.
4. **Single user-visible route.** The sandbox gateway exposes only `/`; the full 18-page IA is implemented as an internal view router within one Next.js route, with all server interaction via `/api/*`.
5. **No secrets in repo (good).** No API keys exist in the workspace; configuration is env-injected with zod validation; demo/testnet-only flags are explicit. This satisfies directive rule 8 by construction.
6. **Market-validation dependency.** No customer access exists in this environment; Stage 2 evidence is desk-research with confidence labels, and interview instruments are provided for human operators to run.

## 6. Recommended changes (executed in Stages 6–18)

1. Replace scaffold identity (metadata, logo, page) with ORZARYN brand system (Stage 5).
2. Replace demo Prisma models with the full domain schema; push migrations; seed clearly-labelled demo data only (Stage 6).
3. Implement foundation modules before features: typed env, structured logging with request IDs, error taxonomy, API envelope, health checks, idempotency, rate limiting, audit log (Stage 6).
4. Implement identity → agent registry → policy engine → work-order state machine in that order, each with tests before the next (Stages 7–11).
5. Implement the Alchemy adapter behind the chain-provider interface with capability probes and honest degradation (Stage 12).
6. Deliver the Anchor program as a separate workspace with tests, marked uncompiled; never deploy anywhere without explicit authorisation (Stage 13).
7. Build the event layer (webhook inbox, outbox, checkpoints, dead-letter, reconciliation) before settlement features rely on it (Stages 15–17).
8. Ship the frontend as view modules over real APIs with loading/empty/error/success states and permission-aware controls (Stage 18).
9. Record all gaps honestly in `docs/status/` (Stage 25).

## 7. Audit conclusion

The repository is a clean scaffold with a strong frontend foundation and **no product code**. Nothing in the directive's implied asset list can be verified. The correct engineering posture is: treat this as a Stage 6 "greenfield build" rather than "remediation of an existing codebase", while preserving every directive control (no mainnet, no real funds, no invented claims). All deviations are recorded as ADRs; all unverified claims are labelled as such throughout the documentation set.
