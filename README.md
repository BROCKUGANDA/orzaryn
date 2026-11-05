# ORZARYN — Agent Procurement & Settlement Control Plane

> **Live (subdomain):** [https://orzaryn.svalley.tech](https://orzaryn.svalley.tech)
> **Status:** Staging / testnet-only · **Settlement asset:** USDC on Solana Devnet via Alchemy · **License:** Apache-2.0 (see `LICENSE`)

ORZARYN lets a business give an AI agent a **spending mandate** — hard limits, allowlists, and an approval threshold — and let that agent **buy discrete services** from approved providers. Money sits in **escrow** and is **released only when the buyer accepts the delivered evidence**. Every step is policy-checked, ledger-backed, and fully auditable.

No manual gatekeeping for every $5 call. No agent with a blank cheque.

---

## Table of contents

- [What it is](#what-it-is)
- [Who it is for](#who-it-is-for)
- [How it works — the 60-second story](#how-it-works--the-60-second-story)
- [Live demo for judges (5 minutes)](#live-demo-for-judges-5-minutes)
- [How to use the platform](#how-to-use-the-platform)
  - [As a human (Owner / Admin / Approver / Treasurer)](#as-a-human-owner--admin--approver--treasurer)
  - [As an AI agent (MCP / API)](#as-an-ai-agent-mcp--api)
  - [As a provider](#as-a-provider)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Chains & settlement](#chains--settlement)
- [Security & money integrity](#security--money-integrity)
- [API surface](#api-surface)
- [Repo structure](#repo-structure)
- [Local development](#local-development)
- [VPS deployment — orzaryn.svalley.tech](#vps-deployment--orzarynsvalleytech)
- [Testing](#testing)
- [Honest limitations](#honest-limitations)
- [Roadmap](#roadmap)
- [License](#license)

---

## What it is

**ORZARYN is the control plane for agent procurement.**

Enterprises increasingly run AI agents that need to buy work — data labelling, code, content, research, integrations. Card rails and per-call crypto payments (e.g. x402) assume tiny, instant purchases with no acceptance conditions and no dispute path. That is the opposite of B2B services procurement, where **payment follows delivery acceptance**.

ORZARYN fills that gap with one unified workflow:

```
Register agent → Grant mandate → Discover service → Quote → Policy check
→ Work order → Escrow funded → Provider delivers → Buyer accepts → Release
```

Key guarantees:

- **Mandate-bound autonomy** — the agent can only spend inside limits you set (per-purchase, daily, weekly, monthly, aggregate, concurrent, velocity, provider allowlist, expiry).
- **Release-on-acceptance escrow** — funds move `proposed → reserved → escrowed → released / refunded`. Nothing is paid before delivery.
- **Deterministic policy engine** — every purchase returns a decision + ordered reason codes (`WITHIN_MANDATE`, `REQUIRES_APPROVAL`, `DENY: BUDGET_EXCEEDED`, `AGENT_REVOKED`, …). Default-deny when a critical check is unavailable.
- **Full auditability** — immutable work-order events, double-entry ledger, CSV export, and settlement receipts with chain references (or honest `DEMO:` marks when no RPC is configured).
- **Revocation is immediate** — revoke an agent mid-flight and its next tool call fails with `AGENT_REVOKED`. In-flight orders settle; no new purchases.

**What ORZARYN is not:** a general wallet provider, a token issuer, a trustless replacement for legal contracts, or a yield product. It never custodies seed phrases and makes no regulatory or mainnet claims.

## Who it is for

**Primary — buyer side:**
- Ops / AI-platform leaders at 50–2,000-person tech-forward companies already running agents in production.
- Finance Controllers / Treasurers who need segregated balances and exportable audit trails.
- Agent Platform Engineers who want narrow, typed tools and testnet-first docs.

**Supply side:**
- Verified service providers (studios, dev shops, data firms) willing to accept USDC settlement and deliver evidence.

**Explicitly not MVP:** regulated institutions, ERP/PO-integrated procurement, consumer agents.

## How it works — the 60-second story

1. **Human owner** signs up, creates an org, invites the team with roles (`OWNER / ADMIN / TREASURER / APPROVER / OPERATOR / VIEWER`).
2. **Owner registers an agent** (`atlas-01`) and grants a **mandate**: e.g. `≤ $250/purchase, ≤ $1,000/day, approved providers only, human approval ≥ $500, expires Q1`.
3. **Agent** authenticates with an API key + signed wallet challenge, calls `discover_services` → gets only mandate-permitted services.
4. **Agent** calls `request_quote` → receives a priced quote with a `termsHash` (SHA-256 of canonical terms) and expiry.
5. **Agent** calls `submit_proposal(quoteId)` → policy engine evaluates. Within mandate → auto-reserve budget atomically, create work order `WO-…`, fund escrow. Above threshold → appears in the **Approval Centre** for a human.
6. **Provider** accepts, delivers evidence (file/metadata + SHA-256 hash). Only the hash is ever committed on-chain.
7. **Buyer** reviews evidence → Accept → funds **release** to provider with a settlement receipt. Reject / dispute → **refund** path back to treasury.
8. **Workers** reconcile ledger vs escrow, process webhooks exactly-once, sweep expired quotes/reservations, and keep an append-only audit log.

> Work-order state machine:
> `DRAFT → PENDING_APPROVAL → APPROVED → FUNDED → ACCEPTED → DELIVERED → IN_REVIEW → COMPLETED (released) | DISPUTED → REFUNDED | CANCELLED`

## Live demo for judges (5 minutes)

**Live URL:** https://orzaryn.svalley.tech — health check: `/api/health` (no auth needed; every other API requires auth).

> All amounts below are **testnet USDC** on **Solana Devnet**. If Alchemy is unconfigured the UI shows `DEMO` / `healthy-demo` honestly — we never fake a chain confirmation.

| Min | Action | What to point out |
| --- | --- | --- |
| 0:00 | Open `orzaryn.svalley.tech` → Sign up → create org (auto-fills `Overview`) | Role-gated nav; footer always says `staging · testnet USDC only`. |
| 0:45 | **Agents** → Create agent `judge-demo-01` → copy API key once → set signer wallet | Status `REGISTERED → ACTIVE`; key is shown once, stored hashed. |
| 1:30 | **Mandates** → Create mandate: `$250` per-purchase, `$1,000` daily, approval `≥ $500`, 30-day expiry | Versioned, hashed, immediately enforceable. |
| 2:15 | **Treasury** → Fund treasury (testnet) → check `Treasury` balances split by lane | `proposed / reserved / escrowed / released / refunded` never merged. |
| 2:45 | **Marketplace / Purchase** → pick a seeded `FIXED`-price service → Request quote → Submit proposal | Quote shows `termsHash` + expiry; proposal returns policy decision + reason codes. |
| 3:30 | Try a **$600** proposal → lands in **Approvals** as `REQUIRES_APPROVAL` → Approve as human | Proves human gate above threshold; budget was atomically reserved. |
| 4:00 | Simulate provider delivery (seeded work order) → **Work Orders → detail** → accept evidence | Evidence hash verified; one-time settlement enforced. |
| 4:30 | **Settlements + Reports** → download CSV ledger / audit export | Every entry traces to a source operation; reconciles to zero unexplained delta. |
| 5:00 | **Developers** → copy the MCP `discover_services` curl | Show `x-orz-key` auth; agents cannot touch chain/policy internals directly. |

**Failure scenarios to demo live:** double-purchase race (only one reservation wins), revoked agent (`AGENT_REVOKED`), overspend (`DENY`), missed deadline → dispute → refund. See `docs/status/DEMO_RUNBOOK.md`.

## How to use the platform

### As a human (Owner / Admin / Approver / Treasurer)

1. **Onboarding:** `Sign up → verify email → Create org → Invite members` (tokenised, expiring, single-use). Assign roles from the **Admin** view.
2. **Agents:** `Agents → New agent` → name, developer label, signer wallet (verified via 10-min single-use Ed25519 challenge). Issue an API key (shown once). Set status `ACTIVE`.
3. **Mandates:** `Mandates → New mandate` → set limits. Empty allowlist = all approved providers; otherwise restrict to specific providers/categories. Set `approvalThreshold` for human gate.
4. **Treasury:** fund the org treasury (testnet). Withdrawals require `TREASURER` + approval.
5. **Approvals:** over-threshold proposals wait here. Approve / reject with a reason — both are audited.
6. **Work Orders:** track `FUNDED → DELIVERED → IN_REVIEW → COMPLETED`. Review evidence hashes; accept → release, reject/dispute → refund.
7. **Reports:** export ledger, settlements, policy decisions, and audit logs as CSV.

### As an AI agent (MCP / API)

Agents never get a wallet or chain keys. They get **one narrow API** with authenticated agent context:

```bash
# 1) Discover permitted services
curl -s https://orzaryn.svalley.tech/api/mcp \
  -H "content-type: application/json" \
  -H "x-orz-key: ozk_..." \
  -d '{"tool":"discover_services","input":{"category":"DEVELOPMENT"}}'

# 2) Request a quote
curl -s https://orzaryn.svalley.tech/api/mcp \
  -H "content-type: application/json" \
  -H "x-orz-key: ozk_..." \
  -d '{"tool":"request_quote","input":{"serviceId":"<serviceId>"}}'

# 3) Submit proposal (policy engine decides)
curl -s https://orzaryn.svalley.tech/api/mcp \
  -H "content-type: application/json" \
  -H "x-orz-key: ozk_..." \
  -d '{"tool":"submit_proposal","input":{"quotePublicId":"Q-XXXXXX"}}'
# → {"decision":"APPROVE","reasonCodes":["WITHIN_MANDATE"],"workOrderId":"WO-2026-XXXXX"}

# 4) Poll / inspect
# inspect_mandate · get_work_order · get_evidence_state · request_approval · cancel_work_order
```

Full tool list: `discover_services`, `request_quote`, `submit_proposal`, `inspect_mandate`, `get_work_order`, `get_evidence_state`, `request_approval`, `cancel_work_order`.

### As a provider

1. Apply → status `SUBMITTED → UNDER_REVIEW → APPROVED` (platform operators review in **Admin**).
2. Verify wallet via signed challenge, then publish services (`FIXED` or `QUOTED`, base price in USDC minor units, SLA hours, acceptance terms).
3. Accept funded work orders, submit evidence (hash + storage ref), get paid on buyer acceptance. Disputes go through the same timeline both sides see.

## Architecture

Single Next.js process in staging (split containers in production), strict modular backend under `src/lib/`:

| Module | Role |
| --- | --- |
| `env` / `logger` / `errors` | Typed config, structured JSON logs, uniform `{ ok, data \| error }` envelope |
| `auth` / `rbac` | scrypt passwords, HMAC opaque sessions, Ed25519 wallet challenges, role checks |
| `policy` / `ledger` / `money` | Deterministic policy engine, atomic budget reservation, integer-only money |
| `workorder` | Server-side state machine + immutable events |
| `chain` (`ChainProvider`) | Alchemy Solana adapter isolated behind an interface; circuit breaker; honest `DEMO` mode |
| `events` | Webhook inbox (exactly-once), outbox, worker with backoff + dead-letter, reconciliation |
| `reliability` / `ratelimit` | Timeouts, retry+jitter, idempotency keys, token-bucket limits |

Frontend: one route `/` with an internal view router (18 IA destinations), TanStack Query for server state, Zustand for session, shadcn/ui + Tailwind, Framer Motion with reduced-motion fallback. WCAG 2.1 AA intent.

Trust boundaries: humans ↔ app (session), agents ↔ app (API key + challenge), Alchemy ↔ app (HMAC webhook), app ↔ chain (adapter only), app ↔ storage (server-side only).

## Tech stack

**Core platform**

- **Next.js 16** (App Router, standalone output) + **React 19** + **TypeScript strict**
- **Bun** runtime / package manager · **Prisma 6 + SQLite** (Postgres-portable schema; ADR-005)
- **Tailwind CSS v4** + **shadcn/ui (Radix)** + **Lucide** · **Framer Motion** · **Recharts**
- **TanStack Query** + **Zustand** · **react-hook-form + zod** validation everywhere
- **tweetnacl** (Ed25519 challenges) · **Node crypto** (scrypt, SHA-256, HMAC)

**Chain & agent integration**

- **Solana (Devnet)** via **Alchemy JSON-RPC** (`ChainProvider` interface + circuit breaker) · **USDC (SPL, 6 decimals)**
- **Anchor program source** in `program/orzaryn-escrow/` — **uncompiled** (no Rust toolchain in this workspace; ADR-003). Off-chain enforcement is the active layer.
- **MCP-style agent API** (`POST /api/mcp`) with narrow tools and `x-orz-key` auth — no direct chain/policy access
- **Webhooks**: Alchemy webhook ingestion with HMAC verification, dedup, persist-before-ack

**Developer / AI tooling**

- **OpenCode / AI coding agents** for implementation, **ESLint + `tsc`** for gates
- **GitHub Actions** for CI + VPS deploy (see `.github/workflows/`) · **Caddy** reverse proxy with auto-TLS · **systemd** for the VPS service

## Chains & settlement

| Chain | Used? | How |
| --- | --- | --- |
| **Solana** | ✅ **Yes — only chain** | Devnet (staging/testnet) via **Alchemy RPC**. USDC (SPL) for all settlement. `ChainProvider` handles health, slot, signature status, balance, submission, webhook verification, and a capability probe. Anchor escrow source exists but is **not deployed** — see honest status below. |
| Tempo / Zcash / Hyperliquid / Base / Robinhood Chain / Arbitrum / Ethereum L1 | ❌ No | Not integrated. The `ChainProvider` interface and ledger (`network` + `asset` on every row) are designed so a second chain is additive, not a rewrite — but only Solana is wired in this build. |

**Settlement flow (testnet):** org treasury → escrow ledger state (`ESCROWED`) → provider delivers evidence → buyer accepts → `RELEASED` (+ tx signature or `DEMO:<id>` receipt). Refund path returns escrow to treasury on reject/dispute/deadline-miss. Platform fee is **disabled by default** (`PLATFORM_FEE_BPS=0`); when enabled, fee rows are separate ledger entries, never netted silently.

> **Mainnet is not enabled in this build.** Every chain-touching operation records `network`, and when no RPC credentials are configured the platform degrades to clearly-labelled `DEMO` mode.

## Security & money integrity

- **Money is `BigInt` minor units only** (USDC = 6 decimals). No floats in money paths. Atomic conditional-decrement budget reservation — concurrent double-spend is impossible (test included).
- **Auth:** scrypt hashing, timing-safe comparisons, HttpOnly opaque sessions hashed at rest, rotation on login, lockout counters, rate limits.
- **Wallet challenges:** 10-minute, single-use, nonce consumed in-transaction, canonical message binding org + agent + domain (replay-proof).
- **RBAC on every route** (server-side; UI hides what server denies). Agents can never mutate mandates, treasury, or policy.
- **State machine** validated server-side; every transition writes an immutable `WorkOrderEvent` with actor + reason.
- **Webhooks:** HMAC + replay window + dedup by external id + per-source rate limit. Persist-before-ack. Dead-letter after N retries.
- **Idempotency keys** on all financial POSTs. Zod validation on every boundary. No secrets in code or logs.
- **Privacy:** deliverables and PII stay off-chain and access-controlled. Only SHA-256 hashes commit on-chain.
- Details + findings: `docs/architecture/SYSTEM_ARCHITECTURE.md` §9, `docs/status/SECURITY_FINDINGS.md`.

## API surface

Base URL (prod): `https://orzaryn.svalley.tech`

| Endpoint | Auth | Notes |
| --- | --- | --- |
| `GET /api/health` | none | Real dependency status (`healthy` / `healthy-demo` / `degraded`) |
| `* /api/auth/*` | session | Signup/login/logout/me, wallet link challenges |
| `* /api/orgs/*`, `/api/agents/*`, `/api/mandates/*` | session (RBAC) | Org, member, agent registry, mandate CRUD + revoke |
| `* /api/providers/*`, `/api/services/*` | session (RBAC) | Provider review flow, service listings |
| `* /api/quotes/*`, `/api/work-orders/*` | session (RBAC) | Quotes, work orders, evidence, transitions |
| `* /api/approvals/*`, `/api/disputes/*` | session (RBAC) | Approval centre, dispute flow |
| `* /api/treasury/*`, `/api/ledger/*`, `/api/reports/*` | session (RBAC) | Treasury, ledger, CSV exports |
| `POST /api/mcp` | `x-orz-key` (agent) | Narrow agent tools (see above) |
| `POST /api/webhooks/alchemy` | HMAC | Alchemy webhook ingestion |
| `* /api/ops/*` | admin session | Emergency pause, dead-letter replay, metrics |

All responses use `{ ok: true, data }` / `{ ok: false, error: { code, message, details, requestId } }` with a `requestId` on every response and log line. Agents must use `x-orz-key: ozk_…` — no anonymous enumeration.

## Repo structure

```
.
├── src/
│   ├── app/            # Next.js App Router — single route / + api/*
│   │   └── api/        # health, auth, orgs, agents, mandates, providers,
│   │                   # quotes, work-orders, approvals, treasury, mcp, webhooks, ops…
│   ├── components/     # UI (shadcn/ui) + 18 in-app views + brand
│   └── lib/            # auth, rbac, policy, ledger, money, chain/, events, …
├── prisma/schema.prisma  # Domain schema (BigInt money, portable to Postgres)
├── program/orzaryn-escrow/  # Anchor escrow source — UNCOMPILED (see README there)
├── docs/
│   ├── product/        # PRD, market validation
│   ├── architecture/   # system arch + ADR-001…008
│   ├── design/         # design system, IA, a11y
│   └── status/         # demo runbook, release readiness, known issues
├── .github/workflows/  # ci.yml, deploy.yml, security.yml
├── Caddyfile           # Reverse proxy for orzaryn.svalley.tech
└── DEPLOY.md           # Full VPS runbook for the subdomain
```

## Local development

Prereqs: **Bun ≥ 1.3** (or Node ≥ 20), a free port `3000`.

```bash
git clone <repo> && cd ORZARYN
bun install
cp .env.example .env        # fill DATABASE_URL, SESSION_SECRET, Alchemy keys
bunx prisma db push         # create SQLite (db/custom.db)
bunx prisma generate
bun run db:push && bun run dev   # http://localhost:3000
```

Seeded demo data is clearly labelled `DEMO` in the UI. Health check: `curl http://localhost:3000/api/health`.

> `.env` is git-ignored. Never commit secrets. The committed `.env` in some checkouts is a sandbox placeholder — rotate before any real deploy (see `docs/status/SECURITY_FINDINGS.md` SF-1).

## VPS deployment — orzaryn.svalley.tech

**Subdomain:** `orzaryn.svalley.tech` → VPS (Caddy auto-TLS) → Next.js standalone on `localhost:3000`.

Full runbook: **`DEPLOY.md`** (DNS, VPS bootstrap, systemd, Caddy, env, backups, rollback). TL;DR:

```bash
# 1) DNS: A record  orzaryn.svalley.tech  →  <VPS IPv4>
# 2) On VPS: install Bun, Caddy, create /opt/orzaryn, clone, build standalone
# 3) systemd unit runs: bun .next/standalone/server.js  (PORT=3000)
# 4) Caddy:  orzaryn.svalley.tech { reverse_proxy localhost:3000 }  (auto TLS)
# 5) Push to main → GitHub Actions (deploy.yml) ships to the VPS over SSH
```

CI/CD: `.github/workflows/ci.yml` (lint + typecheck + build + unit/integration tests) and `.github/workflows/deploy.yml` (build → rsync to VPS → `systemctl restart orzaryn` → `/api/health` gate). Secrets live in GitHub repo secrets + `/opt/orzaryn/.env` (mode `640`).

## Testing

```bash
bun run lint                 # eslint
bunx tsc --noEmit            # strict typecheck
bun test                     # unit + integration (Node test runner)
bun run build                # Next.js standalone build
```

Money + concurrency tests assert: integer arithmetic, atomic reservation (concurrent double-purchase → exactly one winner), revoked-agent denial, ledger reconciliation to zero delta. See `tests/`.

## Honest limitations

- **Anchor program is uncompiled source only** (`program/orzaryn-escrow/`). No Rust/Anchor toolchain was available; it has not been built, tested on a local validator, or audited. Off-chain enforcement is the active layer (risk R-2).
- **Testnet only.** No mainnet settlement, no real USDC custody. Without Alchemy credentials the chain layer honestly reports `DEMO`.
- **Alchemy Agent Wallet custom-program signing** could not be verified from this environment (ADR-007) — flagged for staging verification.
- **Webhook secret** may be unset → webhook events dead-letter as unverified (SF-4). Set `ALCHEMY_WEBHOOK_SECRET` in prod.
- **SQLite** in staging; Postgres migration path documented (ADR-005) but not yet run.
- **Escrow legal classification** requires legal review before any production pilot (`docs/status/RELEASE_READINESS.md`).

## Roadmap

1. `anchor build && anchor test` on a real toolchain → devnet deploy → independent review (gates in `program/orzaryn-escrow/README.md`).
2. Verify Alchemy Agent Wallet signing; wire `ALCHEMY_WEBHOOK_SECRET`; live webhook E2E.
3. Postgres + split API/worker containers; blue-green deploys.
4. Design-partner pilot: ≥3 orgs × ≥10 real work orders, ≥90% policy coverage, zero reconciliation delta (criteria in `docs/product/MARKET_VALIDATION.md` §8).
5. Standards alignment: mandate semantics ≈ Google AP2 / FIDO, work-order lifecycle ≈ ERC-8183, agent registry exportable to ERC-8004-style registries.

## License

Licensed under the **Apache License 2.0** — see [`LICENSE`](LICENSE). (Intentionally **not** MIT; Apache-2.0 chosen for its explicit patent grant and trademark terms, which suit a payments-adjacent codebase.)

---

*Questions for judges? Start with [`docs/product/PRD.md`](docs/product/PRD.md) and [`docs/status/DEMO_RUNBOOK.md`](docs/status/DEMO_RUNBOOK.md). For the live judge path, use the table above.*
