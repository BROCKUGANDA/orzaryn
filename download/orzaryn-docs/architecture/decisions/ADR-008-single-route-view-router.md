# ADR-008 — Single user-visible route with internal view router

- **Status:** Accepted · 2026-11-05
- **Context:** The sandbox gateway exposes exactly one user-visible route (`/`). The directive's Stage 18 information architecture defines 18 pages.
- **Decision:** Implement the full IA as an internal view router inside `src/app/page.tsx` (state-driven navigation, deep-linkable via `?view=`), with all server interaction through `/api/*` route handlers. Each of the 18 destinations is a distinct view module with its own loading/empty/error/success states.
- **Consequences:** No server-side per-page metadata or SSR-per-page benefits; navigation is client-side; URL semantics limited to the query param. This is a staging-environment trade-off; the view modules are structured so each maps 1:1 to a future route file when deployed outside the sandbox.
