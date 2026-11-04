# ORZARYN — Integration Status (Stage 25)

| Integration | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Alchemy Solana RPC (read) | **ADAPTER COMPLETE — LIVE UNVERIFIED** | `src/lib/chain/alchemy-solana.ts`; `/api/health` | No credentials in sandbox → DEMO mode honestly reported; `getHealth/getSlot/getTokenAccountsByOwner/getSignatureStatuses` implemented with retry+jitter+circuit breaker |
| Alchemy transaction submission | **ADAPTER COMPLETE — LIVE UNVERIFIED** | `submitTransaction()` | Demo returns `DEMO:<uuid>` refs, never presented as onchain confirmations; live path sends base64 tx, `maxRetries:0` + signature-status probe (no blind rebroadcast) |
| Alchemy webhooks | **INGEST COMPLETE** | `/api/webhooks/alchemy`; inbox table | HMAC verification (fails closed without secret), dedup by external id, persist-before-ack, DLQ + replay |
| Alchemy Agent Wallets | **UNVERIFIED — HARD GATE (ADR-007)** | capability `agentWalletSigning: UNVERIFIED` | Requires staging probe; documented fallback: treasury-signed escrow ops, agents never hold signer authority |
| Solana (Anchor program) | **SOURCE COMPLETE — UNCOMPILED** | `program/orzaryn-escrow/` | No toolchain (ADR-003); 12 instructions + invariants + test plan; never deployed |
| USDC | **CONFIGURED (testnet semantics)** | `USDC_MINT_TESTNET` env | Integer minor units (6dp) everywhere; canonical-mint check present in program source |
| SQLite / Prisma | **PRODUCTION-DEVIATION DOCUMENTED** | ADR-005 | Portable schema; Postgres migration checklist in RELEASE_READINESS |
| Email / notifications | **NOT BUILT** | — | Deferred (PRD §14); invitations return single-use tokens in-app |
| MCP (stdio) | **HTTP TOOLS BUILT; stdio ADAPTER DEFERRED** | `/api/mcp` | 8 narrow tools; agents cannot bypass policy |
| NextAuth | **NOT USED** — first-party auth (ADR-002) | `src/lib/auth.ts` | scrypt + hashed opaque tokens + HMAC cookies |
| Redis/BullMQ | **REPLACED** by durable inbox/outbox (ADR-006) | `src/lib/events.ts` | Same reliability semantics; single-process limit documented |
| EVM rollup | **DEFERRED BY DESIGN** | ADR-001 | Solana and EVM adapters are distinct; no EVM code assumed |
