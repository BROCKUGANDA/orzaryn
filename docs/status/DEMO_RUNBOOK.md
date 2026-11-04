# ORZARYN — Staging Demo Runbook (Stage 23)

**Environment:** sandbox staging · testnet/DEMO only · never real funds.

## Prerequisites

1. Dev server running (`bun run dev`, port 3000).
2. Seed once: `bun scripts/seed.ts` (idempotent; prints demo credentials once).
3. Baseline quality gates: `bun run lint && npx tsc --noEmit && bun test`.

## Automated scenario

```bash
bun scripts/demo-scenario.ts
```

Expected output (abridged — see BUILD_STATUS for a recorded run):

1. Owner signs in → organisation context (OWNER).
2. Agent registry loads (`atlas-01: ACTIVE`).
3. Fresh agent API key issued (audit-logged).
4. Treasury balance shown (2,500 testnet USDC in seed).
5. Agent (via `x-orz-key`) discovers permitted services.
6. Agent requests a quote (amount, terms hash, expiry).
7. Agent proposes the purchase → policy decision `APPROVE / WITHIN_MANDATE` → work order created, budget atomically reserved.
8. Buyer funds escrow (DEMO reference; state FUNDED/ESCROWED).
9. Provider accepts → submits evidence (hash commitment) → marks delivered.
10. Buyer begins review → accepts → **release-on-acceptance** settles; receipt issued (`SR-…:RELEASE`).
11. Reconciliation runs: mandates + escrow invariants — 0 mismatches.

Failure scenarios in the same run:

- **Over-limit purchase** → `POLICY_DENIED` with `PER_PURCHASE_LIMIT_EXCEEDED` (+ daily accumulation).
- **Suspended agent** → tool call blocked with `AGENT_REVOKED`, instantly.
- **Duplicate webhook** → deduped, single durable record.
- **Dispute + refund** (separate manual steps below) → escrow returned, receipt `SR-…:REFUND`, reconciliation MATCH.

## Manual scenario add-ons

```bash
# dispute + refund on any FUNDED order
curl -b cookies -X POST /api/work-orders/<WO>/transition -d '{"action":"open_dispute","reason":"…"}'
curl -b cookies -X POST /api/work-orders/<WO>/transition -d '{"action":"refund","reason":"…"}'

# emergency pause / resume (audited)
curl -b cookies -X POST /api/ops -d '{"action":"pause","reason":"drill"}'
curl -b cookies -X POST /api/ops -d '{"action":"resume"}'

# dead-letter replay + reconciliation
curl -b cookies -X POST /api/ops -d '{"action":"replay_dead_letter"}'
curl -b cookies -X POST /api/ops -d '{"action":"reconcile"}'

# CSV exports
curl -b cookies /api/ledger?format=csv -o ledger.csv
curl -b cookies /api/reports?format=csv -o settlements.csv
```

## What this demo does NOT show (honest limits)

- Onchain settlement: chain references are `DEMO:*` simulations until the Anchor program is compiled and live credentials exist (KI-1/KI-2).
- Provider identity: provider steps use the staging claim, not a provider portal (SF-3).
- Email/notifications: not built (KI-5/KI-7).
