# ADR-006 — Durable inbox/outbox tables + in-process worker instead of Redis/BullMQ

- **Status:** Accepted (with scaling limits) · 2026-11-05
- **Context:** Stage 17 requires durable event processing, dedup, retries, checkpoints and dead-letter handling. Redis/BullMQ are unavailable in the environment.
- **Decision:** Implement the same reliability semantics with database tables and an in-process worker: `WebhookEvent` inbox (persist-before-ack, dedup on external id, attempts, next-retry, dead-letter), `OutboxEvent` published transactionally with state changes, `EventCheckpoint` per source, and a singleton scheduler (instrumentation-started, single-flight guarded) that drives inbox processing, outbox publishing, reservation sweeps, quote expiry and reconciliation.
- **Scaling limits (explicit):** one worker process only; SQLite write serialisation caps throughput; horizontal scale requires Postgres + a real queue — recorded in the production migration checklist. Worker termination recovery relies on transactional claims and checkpoints.
