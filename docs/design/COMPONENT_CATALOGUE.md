# ORZARYN — Component Catalogue (Stage 5)

## 1. Component inventory

**Brand:** `Emblem`, `Wordmark`, `LogoHorizontal`, `LogoStacked`, `AppIcon` (inline SVG, token-driven).
**Primitives (shadcn/ui, themed):** button, card, dialog, sheet, tabs, table, input, select, textarea, switch, checkbox, radio-group, badge, tooltip, popover, dropdown-menu, command, scroll-area, separator, skeleton, sonner toaster, alert, alert-dialog, breadcrumb, form (react-hook-form), progress, avatar, calendar, pagination, sidebar.
**ORZARYN custom (in `src/components/orz/`):**

| Component | Variants | States handled |
| --- | --- | --- |
| `Money` | default, muted, bold, table-cell | negative guard, mono/tabular, thousand separators, 6-decimal USDC |
| `StateBadge` | workorder states, provider/agent/mandate statuses, quote states | colour + label pairing, luminous variant for live |
| `HashChip` | sm/md, copy-on-click | truncation (8+6), mono, copy toast |
| `BudgetMeter` | mandate (per-purchase/daily/weekly/monthly/aggregate) | amber ≥80%, red ≥95%, reserved-vs-spent distinction |
| `WorkOrderCard` | default, compact | deadline overdue flag, dispute flag |
| `MandateCard` / `MandateEditor` | view/create/edit | validation, expiry warning |
| `AgentIdentity` | row, card | status, key fingerprint, developer |
| `ProviderCard` / `ServiceCard` | grid item | verification state, unverified watermark |
| `ApprovalQueue` | list | context expansion, approve/reject with reason |
| `EvidencePanel` | detail | version list, hash verify status, review actions |
| `SettlementReceipt` | printable | gross/fee/net rows, chain ref or DEMO tag |
| `FinancialTable` | dense/comfortable | totals row, CSV export, empty/loading/error |
| `StatusTimeline` | vertical | actor icons (human/agent/system/provider), reason codes |
| `LedgerGrid` | grouped | state groups, reconciliation delta badge |
| `EnvBanner` | DEMO, TESTNET, DEGRADED | always-on honesty banner |
| `ViewShell` | all views | page header, actions slot, permission gate, states |

## 2. Composition rules

- Domain components never fetch; views fetch (TanStack Query) and pass data + callbacks. This keeps every component testable and reusable across the 18 views.
- All interactive elements: 44px minimum touch target, visible focus (`outline: 2px solid var(--accent)` offset 2px), keyboard reachable.
- Financial figures render exclusively through `Money` (single formatting path — integer minor units in, string out).

## 3. Usage

```tsx
<WorkOrderCard wo={wo} onOpen={() => nav('workorder-detail', wo.id)} />
<BudgetMeter mandate={m} />
<FinancialTable rows={ledger} columns={moneyColumns} exportCsv onEmpty={...} />
```
