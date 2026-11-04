# ORZARYN — Market Validation (Stage 2)

- **Date:** 2026-11-05
- **Method:** Desk research (≈30 web queries + ≈25 primary-source document fetches across official docs, EIP specifications, funding coverage, and protocol dashboards). **No customer interviews were possible from this environment.** All customer-side evidence is therefore labelled **UNVALIDATED**, and interview instruments are provided in §9 for human operators to run.
- **Evidence discipline:** Every claim carries a confidence tag: `[VERIFIED-PUBLIC]` = official docs or ≥2 independent sources; `[VENDOR-CLAIM]` = company announcement without independent usage verification; `[UNCLEAR]` = could not be verified. No onchain transaction counts are treated as customer demand (per directive).

---

## 1. Product thesis under test

**Thesis (as supplied):** Enterprises will adopt a platform where they register AI agents, grant cryptographically-verifiable spending mandates, and let those agents purchase discrete services from approved providers — with USDC held in escrow and released only on buyer acceptance of evidence, settled on Solana.

**Verdict of this study:** The thesis is **plausible but unproven, and time-sensitive**. Payment rails and wallets for agents are crowded and well-funded; **the escrow + mandate + work-order layer for B2B services is the least-served layer** — but the exact model ORZARYN proposes was standardised as **ERC-8183 "Agentic Commerce"** (draft, Feb 2026) `[VERIFIED-PUBLIC]`, meaning the window in which a proprietary implementation can lead is narrow and standards-compatibility is likely mandatory.

## 2. Market landscape — what already exists

### 2.1 Agent wallet & payment infrastructure (crowded, well-funded)

| Player | What it actually does | Solana? | Spending policy | Escrow | Status | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| Coinbase AgentKit / CDP | Open agent-wallet framework; full Policy Engine (spend rules, allowlists); Payments MCP (Oct 2025) | x402: yes; CDP EVM-first | **Yes** | Partial (x402 batch channels) | Production | [VERIFIED-PUBLIC] |
| Google AP2 (→ FIDO Alliance, Apr 2026) | Open protocol; Verifiable-Credential **Cart/Payment Mandates** — the same "mandate" model; preapproval added Oct 2026 | No | **Yes** (mandates) | No | Pilots/demos | [VERIFIED-PUBLIC] |
| Stripe (stripe/ai, Agentic Commerce Protocol) | Agent toolkit; processed OpenAI Instant Checkout (Sep 2025) | No | Limited | No | Production (B2C retreat: Instant Checkout discontinued Mar 2026) | [VERIFIED-PUBLIC] |
| Mastercard Agent Pay | Agent trust services; "one approved budget → multiple provider payments" via signed vouchers; pilots with Cloudflare, Ant Int'l, Base, Coinbase, BVNK | No | Yes (budgets) | Voucher redemption only | Named pilots | [VERIFIED-PUBLIC] |
| Skyfire | USDC-settled agent payment network; per-agent wallets, per-transaction/time limits, human-review escalation; $8.5M seed (Aug 2024) | No | **Yes** (limits + human review) | No | Pilots; Fastly/Forter partnerships | [VERIFIED-PUBLIC product; VENDOR-CLAIM partnerships] |
| Catena Labs | "Governance & banking platform for AI agents": agent identity, **deterministic policies**, audit trails, stablecoin payroll/procurement; $18M (2025) → $30M Series A (May 2026) | [UNCLEAR] | **Yes** | **No work-order escrow found** | Funded build | [VERIFIED-PUBLIC] |
| Crossmint | Agent wallets across **EVM + Solana + Stellar**; "Agentic Cards"; stablecoin orchestration; $23.6M (2025) + €20.7M (2026) | **Yes** | Limited | No | Production (MoneyGram) | [VERIFIED-PUBLIC docs; VENDOR-CLAIM round details] |
| Nekuda | Agent credential/checkout infra; $5M (May 2025, Madrona/Amex V/Visa V); pivoted toward WebMCP tooling | No | Limited | No | Partial (Gensmo) | [VERIFIED-PUBLIC; VENDOR-CLAIM Gensmo] |
| Paid.ai | Results-based billing for agent work; $21.6M seed (Lightspeed), $33.3M total (Sep 2025) | — | Billing, not policy | No | Funded build | [VERIFIED-PUBLIC] |

**Reading:** wallet + policy is becoming **table stakes** shipped by Coinbase, card networks, and banks. None of the verified players combines **mandate → discovery → quote → purchase → escrowed settlement on acceptance** end-to-end for B2B work orders.

### 2.2 x402 — real but small, and no disputes

- Multi-chain as of 2026 (EVM, **Solana SPL/Token-2022**, TON, Stellar, XRPL, Aptos, NEAR…); Linux Foundation **x402 Foundation** operational Jul 14 2026 (Google/Microsoft/Amazon backing reported) `[VERIFIED-PUBLIC]`.
- Cumulative volume since May 2025: **198.9M settlements / $52.7M total value** on Base+Solana+Polygon, of which only **0.6–7.5% of value is genuinely agentic** (TRM Labs via PYMNTS, Sep 2026); CoinDesk (Jul 2026): "75 million payments moved just $24 million" (~$0.32 avg). Coinbase's "100M+ AI payments on Base" is `[VENDOR-CLAIM]`.
- Documented criticisms: **no refund/chargeback/dispute mechanism**; pay-then-retry latency; demand "just not there yet" (CoinDesk, Mar 2026) `[VERIFIED-PUBLIC]`.
- Solana is the **top x402 network by dollar volume since Dec 2025** (~$380K daily ATH; 43.1K monthly active payers, Oct 2026); batch settlement with escrowed channels runs on SVM (public preview Sep 2026) `[VERIFIED-PUBLIC]`.

**Implication for ORZARYN:** x402 proves rails, not demand for **discrete, higher-value B2B work orders with acceptance conditions** — exactly the gap ORZARYN targets (escrow + evidence + release-on-acceptance).

### 2.3 Standards that commoditise parts of the plan

- **ERC-8183 "Agentic Commerce"** (draft, Feb 2026; Ethereum Foundation + Virtuals): job with **escrowed budget**, states Open→Funded→Submitted→Terminal, **evaluator attests completion**, timeout refunds, hooks `[VERIFIED-PUBLIC]`. This is ORZARYN's work-order model as an open EIP (EVM-oriented).
- **ERC-8004 Trustless Agents** (2025): onchain agent identity/reputation registries `[VERIFIED-PUBLIC]`.
- **AP2 mandates** (→ FIDO): standardised spend mandates with Verifiable Credentials `[VERIFIED-PUBLIC]`.
- **Cloudflare Monetization Gateway**: x402-charged resources incl. paid MCP tools — commoditises service monetisation/discovery `[VERIFIED-PUBLIC]`.

**Implication:** ORZARYN should treat these as **compatibility targets** (mandate semantics ≈ AP2 VDCs; work-order lifecycle ≈ ERC-8183; agent registry exportable to ERC-8004-style registries), not as afterthoughts.

### 2.4 Escrow & settlement for services

- Request Network: stablecoin invoicing with authorize-capture-void **escrow** flows since 2017 (EVM-first) `[VERIFIED-PUBLIC]`.
- Kleros: decentralised arbitration, now marketed "For AI Agents" `[VERIFIED-PUBLIC]`.
- **No established vendor owns B2B work-order escrow end-to-end.** The emerging composition is open standards, not a product.

### 2.5 Enterprise context and funding climate

- Gartner forecast: agents to intermediate **$15T of B2B purchases by 2028** — a **forecast, not observed spend** `[VENDOR-CLAIM]`.
- B2C agentic checkout retrenched (OpenAI Instant Checkout killed Mar 2026); **B2B/infrastructure kept compounding**; Mastercard explicitly targets the ~$80T B2B payments market `[VERIFIED-PUBLIC]`.
- Funding into adjacent "agent spend control": Ramp (agent spend platform, $60B valuation, Oct 2026), Oak $60M (agent identity), Paid $33.3M, Catena $30M, Crossmint $23.6M+, Skyfire $8.5M, Willow $7M, Nava $8.3M `[VERIFIED-PUBLIC headlines]`.
- OKX AI marketplace (Jul 2026): agents hire and pay each other in stablecoins `[VERIFIED-PUBLIC]` — early proof of agent-to-agent services commerce.

## 3. Initial Ideal Customer Profile (ICP) — UNVALIDATED

**Primary ICP:** Ops/AI/engineering leaders at **50–2,000-employee technology-forward companies** that (a) already operate autonomous or semi-autonomous AI agents in production workflows (data ops, content/dev services, research, integrations), (b) have a finance function that requires auditability and pre-approval controls, and (c) are comfortable with stablecoin settlement (or are crypto-native).

**Secondary ICP:** Crypto-native service providers (studios, dev shops, data-labeling firms) seeking new B2B demand from AI-agent buyers without invoicing friction.

**Anti-ICP (for MVP):** Regulated financial institutions; enterprises requiring invoicing/PO integration with legacy ERP at go-live; consumer agents.

## 4. User personas (UNVALIDATED — to be tested with interviews)

1. **"Controlled Autonomy" Ops Lead (buyer-side economic buyer).** Runs an AI-operations team; needs agents to execute spend within limits; fears runaway spend and compliance exposure; buys auditability, not speed. Success = agents complete purchasing with zero policy exceptions.
2. **Finance Controller / Treasurer (buyer-side blocker).** Owns treasury and reconciliation; demands segregation of proposed/reserved/escrowed/released amounts, exportable audit trails, and no floating-point or unexplained balances.
3. **Agent Platform Engineer (buyer-side implementer).** Integrates agents via SDK/MCP; wants narrow-scoped tools, typed errors, testnet-first docs; will resist anything requiring unrestricted key custody.
4. **Approved Provider / Studio Owner (supply side).** Wants new B2B demand, clear escrow (no payment risk after acceptance), fast settlement in USDC, and dispute clarity.
5. **Security/Compliance Officer (enterprise gatekeeper).** Needs revocation to be immediate and provable, evidence hashes onchain but PII off-chain, and complete audit history per action.

## 5. Customer problem map (UNVALIDATED)

| # | Problem | Who feels it | Today's workaround | Evidence status |
| --- | --- | --- | --- | --- |
| P1 | No safe way to let an agent spend on *discrete services* with pre-agreed limits | Ops lead | Human-in-the-loop for every purchase, or hard-coded wallet caps | [UNCLEAR] — to validate |
| P2 | Payment risk: paying before delivery | Buyer | Trust, or expensive legal escrow | [VERIFIED-PUBLIC] (x402 lacks refunds/disputes) |
| P3 | No unified audit trail: who/what authorised which payment, against which mandate | Controller | Screenshots, spreadsheets, card statements | [UNCLEAR] |
| P4 | Provider-side: getting paid by anonymous agent buyers | Provider | Upfront payment only | [UNCLEAR] |
| P5 | Agent identity/portability: proving *which* agent did what | Security | Ad-hoc API keys | [VERIFIED-PUBLIC] (ERC-8004 motivation) |

## 6. Existing workflow map (how purchasing happens today, buyer-side)

1. Team identifies need → 2. Human raises internal PR/PO (or just uses a corporate card) → 3. Vendor onboarding/compliance check → 4. Contract/invoice → 5. Payment via card/bank → 6. Delivery accepted by email → 7. Books closed at month-end. **Agent involvement today is point solutions** (agent pays per-API-call via x402/crypto wallet; agent shops with Skyfire-style credentials). There is **no verified production workflow** where an autonomous agent buys discrete B2B services under a corporate mandate with escrowed settlement.

## 7. Competitive analysis — where ORZARYN is differentiated vs. exposed

**Plausible advantages (to be validated):**
1. **Release-on-acceptance escrow for discrete work orders** — ERC-8183 standardised the pattern but no vendor product dominates it; x402 explicitly lacks disputes/refunds.
2. **Unified workflow** (mandate → discovery → quote → policy check → work order → evidence → settlement) vs. point solutions that each cover one step.
3. **Solana-native cost profile** — Solana already leads x402 dollar volume; sub-cent settlement fits high-frequency service purchases.
4. **Human-authorised settlement gates** (approval queues, evidence panels) match enterprise control requirements better than pure protocol play.

**Exposures:**
1. Card rails (Mastercard Agent Pay, Stripe) may absorb "budget + mandate" into existing corporate spend rails that finance teams already trust.
2. ERC-8183 implementations and x402 Bazaar may commoditise escrow and discovery.
3. Coinbase CDP Policy Engine already ships policy enforcement for agent wallets.
4. **No public evidence of B2B agent-services GMV anywhere** — the demand side is the biggest unknown, not the technology.

## 8. Proposed MVP, commercial & pricing hypotheses

**Proposed MVP (matches directive scope):** org + RBAC; agent registry with API-key + wallet-challenge identity; mandates (per-purchase/daily/weekly/monthly/aggregate limits, provider allowlists, expiry, revocation); approved-provider directory with application review; quote flow with expiry; deterministic policy engine with atomic budget reservation and reason codes; work-order lifecycle with terms hash; evidence submission/review with hashes; escrow simulation + testnet settlement via Alchemy; ledger with reconciliation + CSV export; approval centre; dispute flow; agent API (MCP-style) with narrow tools.

**Commercial hypotheses (all UNVALIDATED):**
- H1: Platform fee of **0.5–1.5% of settled volume**, free pilot for first 10 orgs.
- H2: Provider-side subscription ($99–499/mo) for verified listing + priority discovery, waived during pilot.
- H3: Buyer seats included; premium = advanced policy (velocity rules, multi-approver thresholds).

**Pilot acceptance criteria (proposed):**
- ≥3 design-partner orgs complete ≥10 real work orders each on testnet then small-value mainnet-equivalent (testnet USDC only in staging).
- ≥90% of purchases fully policy-covered (decision + reason code recorded).
- Reconciliation: 100% of ledger entries traceable to source operations; zero unexplained deltas across a 30-day window.
- ≥2 providers complete ≥5 orders each with evidence accepted first-pass ≥70%.
- Interview evidence: ≥8 of 10 design-partner stakeholders say the escrow+mandate model resolves P1/P2 better than current workaround.

**Explicit go/no-go framework:** proceed to pilot **only** after (a) 3 signed design partners from interviews, (b) Anchor program compiled + independently reviewed, (c) Alchemy Agent Wallet custom-instruction capability verified in staging. **Current status: NO-GO for external pilot** until those gates pass; engineering continues on staging with testnet only.

## 9. Customer interview instrument (for human operators — no interviews were possible here)

1. How do your agents currently spend money? Walk me through the last purchase an agent made — who approved it, how was it paid, how did it get into your books?
2. What spending limits or controls exist for agents today? Who enforces them? What happened the last time an agent overspent or bought the wrong thing?
3. When you buy services from vendors, how do you handle "pay before vs. after delivery"? What disputes have you had in the last 12 months?
4. If a platform held funds in escrow and released only when you accept evidence — what would make you trust it? What would disqualify it immediately?
5. Who signs off on a new payment/settlement vendor in your org, and what evidence do they need (SOC 2, audits, legal opinion)?
6. Would you accept USDC settlement on Solana? If not, what rail? What is your current stablecoin exposure?
7. (Provider-side) What would make you accept work from an AI-agent buyer you've never met? What payment terms?
8. What would you pay for this? What do you pay today for spend-control/procurement tooling per seat/volume?

## 10. Competitor feature matrix

| Player | Wallet infra | Spending policy | Escrow | Solana | Agent identity/registry | Production evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Coinbase AgentKit/CDP + x402 | Y | Y | Partial (batch channels) | x402 yes | Partial | **Y** (volumes real, $ small) |
| Google AP2 (→FIDO) | N (protocol) | Y (mandates) | N | N | Y (VDCs) | Pilots |
| Stripe / ACP | Y (Bridge) | Limited | N | N | N | **Y** (B2C retreat) |
| Mastercard Agent Pay | Y (cards/vouchers) | Y (budgets) | N | N | Y (trust services) | Named pilots |
| Skyfire | Y | Y (limits, human review) | N | N | Y (KYA) | Pilots |
| Catena Labs | Y (banking) | Y (deterministic policies) | N | [UNCLEAR] | Y | Funded build |
| Crossmint | Y | Limited | N | **Y** | Partial | Partial |
| Virtuals ACP / ERC-8183 | N (standard) | Partial | **Y** | N (EVM) | Y (ERC-8004) | Early implementations |
| Request Network / Kleros | Y | N | **Y (+arbitration)** | EVM-first | N | **Y** |
| **ORZARYN (proposed)** | Y | **Y (mandate engine)** | **Y (release-on-acceptance)** | **Y (USDC)** | **Y (registry + MCP)** | — (build stage) |

## 11. Go/no-go decision

**Decision: CONDITIONAL GO — engineering continues on staging/testnet; NO-GO for external pilot or any production financial deployment** until the three gates in §8 pass. Rationale: differentiation is real but narrowing (ERC-8183); demand evidence is absent publicly and must be generated by interviews and a design-partner pilot; the regulatory posture of escrow-as-a-service requires legal review (recorded in `docs/status/RELEASE_READINESS.md`).

---

### Source register (primary)

- x402 docs: https://docs.x402.org/ (network/token support; batch settlement)
- Coinbase CDP/AgentKit: https://docs.cdp.coinbase.com/x402/welcome · https://github.com/coinbase/agentkit
- AP2: https://ap2-protocol.org/
- Stripe ai/ACP: https://github.com/stripe/ai · https://openai.com/index/buy-it-in-chatgpt/
- Skyfire: https://techcrunch.com/2024/08/21/skyfire-lets-ai-agents-spend-your-money/
- Paid.ai: https://techcrunch.com/2025/09/28/paid-the-ai-agent-results-based-billing-startup-from-manny-medina-raises-huge-21m-seed/
- Catena Labs: https://catenalabs.com/ · Crossmint docs: https://docs.crossmint.com/llms.txt · Nekuda: https://www.nekuda.ai/
- Mastercard Agent Pay: https://fintechnews.sg/139360/ai/mastercard-agent-pay-2/
- x402 volumes/criticism: https://www.pymnts.com/news/artificial-intelligence/2026/agentic-payments-are-growing-most-x402-payments-are-not-from-ai-agents/ · https://www.coindesk.com/markets/2026/03/11/coinbase-backed-ai-payments-protocol-wants-to-fix-micropayment-but-demand-is-just-not-there-yet · https://news.ycombinator.com/item?id=45347335
- Solana x402: https://cointelegraph.com/news/x402-ecosystem-expands-solana
- Standards: https://eips.ethereum.org/EIPS/eip-8004 · https://eips.ethereum.org/EIPS/eip-8183 · https://whitepaper.virtuals.io/
- Escrow/arbitration: https://docs.request.network/llms.txt · https://kleros.io/
- Discovery/monetisation: https://blog.cloudflare.com/monetization-gateway/

*Confidence tags inline; anything not tagged VERIFIED-PUBLIC should be re-checked before being relied upon in investor or customer materials.*
