# ORZARYN — Information Architecture (Stage 5)

## 1. Top-level structure

Single user-visible route `/` (ADR-008) with an internal view router. Views map 1:1 to the directive's 18 destinations. Deep links: `/?view=<key>`; workspace views require auth (redirect to `auth` view preserving intent).

```
public:   home
auth:     auth (sign-in / sign-up / wallet challenge)
workspace (requires session):
  onboarding    dashboard        agents           mandates
  providers     quotes           purchase         approvals
  workorders    workorder-detail evidence         settlements
  disputes      treasury         reports          developers
  admin (platform operators only)
```

## 2. Navigation model

- **Sidebar (workspace):** Overview (dashboard) · Agents · Mandates · Providers · Approvals (badge = count) · Work orders · Settlements · Disputes · Treasury · Reports · Developers · Admin.
- **Primary actions:** global "New purchase" (agent-scoped) and "New mandate" buttons, permission-gated.
- **Context switcher:** organisation selector in sidebar header (multi-org support ready).
- **Approval Centre** is elevated in navigation because it is the human-control heartbeat; a red/amber count badge is the only badge allowed to pulse.

## 3. Object hierarchies

Organisation → Agents → Mandates → (Reservations) → Work Orders → Evidence / Settlement / Dispute. Provider → Services → Quotes → Work Orders. Ledger entries attach to Work Orders and Treasury Accounts; every financial row links to its source (work order, webhook event, treasury tx).

## 4. View contracts (each view must implement)

loading / empty / error / success / degraded states; permission-aware actions; document title reflecting the view; responsive layout per `RESPONSIVE_GUIDELINES.md`; deep-link persistence.

## 5. Search & scan patterns

Financial tables sort by recency by default, mono numerals right-aligned; filters: state, provider, agent, date-range. IDs are copyable HashChips. Work-order detail uses a two-column master layout: left = state timeline + evidence, right = terms, money states, actions.
