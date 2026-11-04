# ADR-001 — A vendor-neutral ChainProvider interface with an Alchemy Solana adapter

- **Status:** Accepted · 2026-11-05
- **Context:** Stage 12 requires Alchemy integration without spreading vendor-specific code through the application, and requires EVM/Solana implementations to remain distinct because Alchemy's EVM rollup product is not interchangeable with Solana infrastructure.
- **Decision:** All chain access goes through `src/lib/chain/provider.ts` (`ChainProvider`: health, getSlot, getSignatureStatus, getBalance, submitTransaction, verifyWebhook, capabilities). `alchemy-solana.ts` is the only Alchemy-aware module. An EVM provider may implement the same interface later but shares no assumptions with the Solana adapter.
- **Consequences:** Vendor swaps or multi-vendor failover touch one module; capability probing lets the app degrade honestly; slight indirection cost.
