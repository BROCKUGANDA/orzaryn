# ORZARYN — Incident Playbooks (Stage 22)

Private operations reference. Every incident: **1) pause if financial integrity at risk, 2) preserve evidence (audit log, event inbox), 3) communicate honestly, 4) reconcile before resuming.**

## P-1 Compromised agent
1. `PATCH /api/agents/:id {action:"revoke"}` — keys revoked + purchases blocked immediately (verified).
2. Freeze its mandates (`PATCH /api/mandates/:id {action:"revoke"}`).
3. Review active work orders for the agent: cancel pre-approval ones; review post-funding ones manually.
4. Inspect `AuditLog` for the agent's actions; export for forensics.
5. Re-issue credentials only after root-cause; consider `pause` if the vector is systemic.

## P-2 Compromised provider
1. `PATCH /api/providers/:id {action:"suspend"}` — listings stop being purchasable (policy denies non-APPROVED).
2. For in-flight orders: buyer review decides; use dispute path for contested ones.
3. Audit provider's quotes/evidence hashes for substitution; compare terms hashes.

## P-3 Invalid programme transaction
1. Do NOT rebroadcast. Query `getSignatureStatus` via the chain adapter (no blind repeat of financial writes).
2. If FAILED: the work order remains in its prior state; correct the cause; re-run the transition.
3. Record the signature in the incident ticket; reconciliation will flag any ledger divergence.

## P-4 RPC outage
1. Health shows chain DOWN; circuit breaker opens after 4 failures.
2. Policy engine continues (chain not in its critical path); funding/release transitions fail with `CHAIN_UNAVAILABLE`/breaker errors — **default-deny** on new escrow movements.
3. Resume: breaker half-opens after cooldown; verify with reconciliation.

## P-5 Database corruption / outage
1. Emergency pause immediately (integrity-first).
2. Restore from snapshot (SQLite file / Postgres PITR).
3. Run reconciliation; investigate mismatches (`ReconciliationRecord`).
4. Post-incident: verify inbox/outbox drained idempotently (worker recovers from checkpoints).

## P-6 Delayed event processing
1. Check `/api/ops` events block (pending webhooks, outbox, last checkpoint lag).
2. Inspect DLQ; fix cause; `replay_dead_letter`.
3. If processing is stuck mid-flight, the transactional claim + idempotent handlers make reprocessing safe.

## P-7 Treasury discrepancy
1. Emergency pause.
2. Run reconciliation; compare `TreasuryAccount.trackBalance` vs `TreasuryTx` sums vs (live mode) chain balance query.
3. Ledger is append-only and idempotent — never edit entries; post an ADJUSTMENT entry with an incident reference and principal approval.

## P-8 Smart-contract vulnerability (post-G2, when program is live)
1. Pause offchain creation of new funded orders (program cannot be paused in this design — use offchain kill switch + revoke mandates).
2. Drain: settle/refund in-flight orders via the program's allowed paths.
3. Escalate to principal + auditors; deploy patched program behind a new platform PDA after review.

## P-9 Administrative key compromise
1. Rotate `SESSION_SECRET` (invalidates all signed cookies) and revoke all sessions (`revokeUserSessions` for all users).
2. Audit `AuditLog` for actions under the compromised identity; revoke anything improperly granted (agents/mandates/providers).
3. Re-issue credentials out-of-band; post-incident review.
