# ORZARYN — Integration Status (Stage 25)

| Integration | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Alchemy Solana RPC (read) | **LIVE VERIFIED (2026-11-05, solana-devnet)** | `scripts/alchemy-probe.ts`: getHealth ok, getSlot 518725201, getTokenAccountsByOwner (jsonParsed), getSignatureStatuses NOT_FOUND path | Adapter exercises retry+jitter+circuit breaker live; cluster corrected testnet→devnet — Alchemy serves Solana mainnet-beta + devnet only, and the configured USDC mint `4zMMC9…` is Circle's devnet USDC (the old "testnet" label was a misnomer) |
| Alchemy transaction submission | **ADAPTER COMPLETE — LEDGER-ONLY FOR ESCROW UNTIL PROGRAMME DEPLOYED (KI-1)** | `submitTransaction()` classification guard | Real Solana transactions → `sendTransaction` (maxRetries:0 + signature-status probe, no blind rebroadcast). Escrow call sites still pass ASCII descriptors, which fail closed to `LEDGER-ONLY:<descriptor>` refs — explicitly NOT onchain confirmations. Real-tx send not yet exercised with a funded devnet transaction (needs approval) |
| Alchemy webhooks | **INGEST COMPLETE — SIGNATURE VERIFY UNCONFIGURED** | `/api/webhooks/alchemy`; inbox table | HMAC verification implemented and fails closed; `ALCHEMY_WEBHOOK_SECRET` not configured → all events dead-letter as unverified (SF-4). Configure secret + alarm on unverified rate |
| Alchemy Agent Wallets | **UNVERIFIED — HARD GATE (ADR-007)** | capability `agentWalletSigning: UNVERIFIED` | An RPC API key does not prove Agent Wallet (Wallet API) support; requires dashboard setup + dedicated probe. Documented fallback: treasury-signed escrow ops, agents never hold signer authority |
| Solana (Anchor program) | **SOURCE COMPLETE — UNCOMPILED** | `program/orzaryn-escrow/` | No Rust/Solana/Anchor toolchain on any available host (ADR-003); 12 instructions + invariants + test plan; never deployed |
| USDC | **CONFIGURED (devnet-faucet semantics)** | `USDC_MINT_TESTNET` env (value = Circle devnet USDC) | Integer minor units (6dp) everywhere; canonical-mint check present in program source; no real funds — staging only |
| SQLite / Prisma | **PRODUCTION-DEVIATION DOCUMENTED** | ADR-005 | Portable schema; Postgres migration checklist in RELEASE_READINESS |
| Email / notifications | **NOT BUILT** | — | Deferred (PRD §14); invitations return single-use tokens in-app |
| MCP (stdio) | **HTTP TOOLS BUILT; stdio ADAPTER DEFERRED** | `/api/mcp` | 8 narrow tools; agents cannot bypass policy |
| NextAuth | **NOT USED** — first-party auth (ADR-002) | `src/lib/auth.ts` | scrypt + hashed opaque tokens + HMAC cookies |
| Redis/BullMQ | **REPLACED** by durable inbox/outbox (ADR-006) | `src/lib/events.ts` | Same reliability semantics; single-process limit documented |
| EVM rollup | **DEFERRED BY DESIGN** | ADR-001 | Solana and EVM adapters are distinct; no EVM code assumed |
