# ADR-003 — Solana + Anchor escrow program delivered as source, compilation deferred

- **Status:** Accepted (with open item) · 2026-11-05
- **Context:** Stage 13 requires an Anchor program enforcing the financial invariants. The build environment has **no Rust/cargo, no Solana CLI, no Anchor** — the program cannot be compiled, tested, or deployed here. Directive rules 7 and 12 forbid mainnet deployment without authorisation in any case.
- **Decision:** Deliver the complete Anchor workspace (`program/orzaryn-escrow`) with the 12 required instructions, PDA derivations, canonical USDC mint check, checked arithmetic, replay protection and one-time settlement, plus a TypeScript test plan. Mark it **UNCOMPILED — NOT DEPLOYED**. Until compiled and reviewed, the offchain policy engine is the only enforcement layer; this is recorded as release gate G2.
- **Consequences:** Honest gap: no onchain enforcement in staging; CI with Solana tooling (or a Rust-enabled environment) is required before any testnet deployment; nothing in the product may claim onchain enforcement until then.
