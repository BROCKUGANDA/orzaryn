# ADR-002 — First-party authentication layer instead of NextAuth.js

- **Status:** Accepted · 2026-11-05
- **Context:** Stage 7 requires password auth, wallet challenges, org membership, RBAC, sessions and audit history. NextAuth.js v4 is available in the scaffold, but its provider/session model is oriented to OAuth flows and would still require custom logic for single-use wallet challenges and agent API keys.
- **Decision:** Implement a first-party layer: scrypt password hashing (node:crypto), opaque session tokens stored as SHA-256 hashes, HMAC-signed HttpOnly cookies, expiring single-use Ed25519 wallet challenges, agent API keys stored as hashes with key-id lookup. No seed phrases or private keys ever stored.
- **Consequences:** Full control over the security-sensitive paths for a financial system; more code to maintain and audit; dependency count reduced.
