# ADR-005 — Prisma + SQLite now, portable schema for Postgres migration

- **Status:** Accepted (with migration path) · 2026-11-05
- **Context:** The directive recommends PostgreSQL + Drizzle. The environment provides no Postgres server (no Docker, no binaries) and the scaffold standard is Prisma with the SQLite client.
- **Decision:** Use Prisma + SQLite. The schema is written for portability: string-enumerated statuses, `BigInt` money columns, JSON stored as validated string columns, no SQLite-specific types. A production migration to Postgres is a datasource swap + migration run, plus switching the reservation primitive from conditional-UPDATE to `SELECT … FOR UPDATE` (see below).
- **Concurrency note:** SQLite serialises writes, which makes the atomic budget reservation (`UPDATE mandates SET reserved = reserved + ? WHERE id = ? AND available >= ?` semantics via a guarded `updateMany`) safe. On Postgres, the same operation must be wrapped in a transaction with row locks. This is recorded as a **required change** in the production migration checklist.
- **Consequences:** Staging-grade durability only; no multi-node writes; honest scaling limits documented in ADR-006.
