# ORZARYN — Design System (Stage 5)

## 1. Foundations

Design tokens live in `src/app/globals.css` as CSS custom properties (Tailwind 4 `@theme` compatible) and in `tailwind.config.ts`. Two themes: `dark` (default) and `light`. Semantic tokens: `--background, --foreground, --card, --border, --primary, --accent, --status-*-fg/bg, --success/--warning/--danger`, plus radius/shadow scales. Typography via `next/font/google`: Space Grotesk (display), Inter (UI), JetBrains Mono (numerals).

## 2. Primitives (shadcn/ui, themed)

All 47 scaffolded shadcn/ui components are available; ORZARYN overrides their tokens in `globals.css` so every primitive inherits the brand (no per-component colour drift). Custom primitives added by ORZARYN: `Money` (formatted integer-minor-unit amount with mono/tabular rendering), `StateBadge`, `HashChip` (truncated hash with copy), `Timeline`.

## 3. Domain components (single source of truth — never duplicated per page)

| Component | Purpose |
| --- | --- |
| `WorkOrderCard` | Work-order summary: ID (mono), provider, amount, state timeline chip, deadline. Click → detail view. |
| `MandateCard` / `MandateEditor` | Mandate limits (per-purchase/daily/weekly/monthly/aggregate), validity window, allowlists, status. |
| `BudgetMeter` | Remaining budget vs limits across periods; amber ≥80%, red ≥95%; reserved shown distinctly from spent. |
| `AgentIdentity` | Agent name, key fingerprint (HashChip), status, developer label. |
| `ProviderCard` | Provider with verification state, wallet fingerprint, service count. |
| `ServiceCard` | Service listing with category, price (Money), version, provider link. |
| `ApprovalQueue` | Items requiring human decision with context (mandate, quote, terms hash) and Approve/Reject actions. |
| `EvidencePanel` | Evidence versions with hashes, review actions (accept/revision/reject). |
| `SettlementReceipt` | Gross/fee/net, escrow references, chain signature or DEMO mark. |
| `FinancialTable` | Right-aligned mono amounts, totals row, CSV export hook. |
| `StatusTimeline` | Work-order event history (actor, action, reason code, time). |
| `LedgerGrid` | Ledger entries grouped by state (proposed/reserved/escrowed/released/refunded/fees). |

## 4. States (mandatory on every view/component)

`loading` (skeleton, never blocking spinners on tables) · `empty` (specific to the entity, with the next action) · `error` (code + human message + retry; never raw stack traces) · `success` (quiet confirmation, toast for async actions) · `degraded` (dependency down; honest DEGRADED banner with what still works).

## 5. Motion tokens

See `MOTION_SYSTEM.md`. Summary: durations 120/180/240ms; easing `cubic-bezier(0.2, 0, 0, 1)`; transitions encode state changes only (approval pulse, denial shake at 2px, escrow release sweep); all motion wrapped in `prefers-reduced-motion` fallbacks.

## 6. Density modes

`comfortable` (default) and `dense` (financial tables, ops console): dense reduces cell padding to 4px 8px and font to 12.5px while keeping 44px touch targets on interactive rows.

## 7. Iconography & illustration

Lucide icons, 1.5px stroke, 16/20px. No illustration except the emblem system; data visualisation uses the domain components and recharts with token colours (violet data / mint live / amber pending / red risk).
