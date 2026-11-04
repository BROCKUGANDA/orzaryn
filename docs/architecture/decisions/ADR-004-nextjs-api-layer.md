# ADR-004 — Next.js Route Handlers as the API layer (NestJS/Fastify not introduced)

- **Status:** Accepted · 2026-11-05
- **Context:** The directive recommends NestJS/Fastify for the backend. The repository is a Next.js 16 App Router project with a single exposed port and an in-process dev server managed by the sandbox; introducing a second service would add process management, gateway routing and deployment complexity without changing any product capability at this scale.
- **Decision:** Implement all APIs as Next.js Route Handlers under `src/app/api/*`, wrapped by a shared handler (request ID, zod validation, auth, rate limiting, idempotency, uniform envelope). Business logic lives in `src/lib/*` modules with no Next.js imports, so extraction into NestJS/Fastify later is mechanical.
- **Consequences:** One deployable; module discipline must be enforced in review; horizontal scale-out requires the future extraction (documented in ADR-006 scaling notes).
