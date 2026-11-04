# ORZARYN escrow program (Stage 13) — **UNCOMPILED SOURCE**

> ⚠️ **Honest status:** this workspace contains the complete Anchor program
> source for the 12 required instructions, but the build environment has **no
> Rust, Solana CLI, or Anchor toolchain** (see
> `docs/architecture/decisions/ADR-003-anchor-program-deferred-compile.md`).
> The code has **not** been compiled, run through `anchor test`, or audited.
> It must not be deployed to any cluster until all of those steps pass and the
> principal explicitly authorises deployment.

## Instructions (mapped to directive Stage 13)

| # | Instruction | Function |
| --- | --- | --- |
| 1 | Organisation registration | `initialize_platform` + `register_organisation` |
| 2 | Treasury funding | `fund_treasury` |
| 3 | Mandate creation | `create_mandate` |
| 4 | Mandate revocation | `revoke_mandate` |
| 5 | Work-order creation | `create_work_order` (mandate-bounded; buyer co-signs above threshold) |
| 6 | Escrow funding | `fund_escrow` |
| 7 | Provider acceptance | `provider_accept` |
| 8 | Delivery evidence commitment | `commit_evidence` (hash only) |
| 9 | Buyer acceptance | `buyer_accept_and_release` |
| 10 | Release | `buyer_accept_and_release` (one-time flags) |
| 11 | Refund | `refund` (requires dispute or passed deadline) |
| 12 | Dispute | `open_dispute` |

## Enforced invariants

- Canonical USDC mint fixed at platform init; every token account checked against it.
- Checked u64 arithmetic everywhere; overflow → explicit error.
- One-time settlement: `released` / `refunded` flags; release + refund + fee ≤ escrowed amount by construction.
- Agent authority can only create work orders **inside** mandate limits; the agent can never move escrow.
- Provider must hold an `approved` ProviderRecord; buyer authority gates release/refund.
- PDAs: `platform`, `org/<buyer>/<seed>`, `treasury/<org>`, `mandate/<org>/<id>`, `workorder/<mandate>/<id>`, `escrow/<wo>`, `dispute/<wo>` — deterministic, replay-safe.
- Evidence is a 32-byte hash commitment only; no deliverable content or PII ever reaches the chain.

## Test plan (`tests/`, run once a toolchain exists)

1. `anchor build && anchor test` with local validator + SPL token fixtures.
2. Happy path: init → org → fund treasury → mandate → work order → escrow → accept → evidence → release; assert token balances and events.
3. Negative: agent exceeds per-purchase limit; aggregate overflow; revoked mandate; expired mandate; non-canonical mint; double release; double refund; refund without dispute before deadline; unapproved provider; above-threshold without buyer signer; fee > 1500 bps.
4. Fuzz: `cargo fuzz` targets on amount/limit arithmetic; property: `released + refunded + fee ≤ amount` always.

## Required before ANY deployment

- [ ] `anchor build` clean with warnings as errors
- [ ] Full test suite green on localnet
- [ ] Devnet deploy (authorised) + smoke test with testnet USDC
- [ ] Independent security review of this program
- [ ] Written principal authorisation for mainnet (never assumed)
