# ORZARYN — Motion System (Stage 5)

## 1. Principle

Motion **encodes state change**; it never decorates. If an animation does not tell the operator something they did not know (authorised, denied, settling, degraded), it is removed.

## 2. Tokens

| Token | Value | Use |
| --- | --- | --- |
| `duration-instant` | 120ms | Hover, focus rings, chips |
| `duration-fast` | 180ms | Dropdowns, tooltips, toasts |
| `duration-base` | 240ms | View transitions, dialogs, sheet |
| `duration-slow` | 400ms | Escrow release sweep, receipt reveal |
| `ease-standard` | cubic-bezier(0.2, 0, 0, 1) | Default |
| `ease-exit` | cubic-bezier(0.4, 0, 1, 1) | Dismissals |
| `ease-spring` | framer-motion spring (stiffness 320, damping 30) | Approval confirmation pulse |

## 3. Canonical state motions

- **Authorised / approved:** single mint pulse on the status badge (opacity 1→1.35→1, 400ms) + spring scale 1.02 on the row. One per action.
- **Denied / revoked:** 2px horizontal shake (2 cycles, 180ms) on the decision banner; badge transitions to red without animation (colour + text are the signal; motion only draws attention once).
- **Escrow funded / released:** 400ms left-to-right luminous sweep across the money row (masked gradient); the sweep is the only place the accent glow moves.
- **Approval-required badge:** amber dot with 2s breathing opacity loop (1→0.55→1) — the **only** looping animation allowed in the product.
- **View transitions:** fade + 8px rise, 240ms standard ease; list items stagger 20ms capped at 8 items.
- **Data updates:** numbers crossfade (no count-up animations on money — financial figures must never animate value).

## 4. Reduced motion (mandatory)

All motion is wrapped in framer-motion `useReducedMotion()` or CSS `@media (prefers-reduced-motion: reduce)`; reduced mode replaces: pulse/breathing → static highlight, shake → red border flash once, sweep → instant colour change, view transitions → instant swap. **Static fallback rule:** every state conveyed by motion must remain distinguishable with motion fully disabled.

## 5. Prohibitions

No parallax. No spinners inside tables (skeletons instead). No count-up money animations. No glow on more than one element per viewport region. No motion loops besides the approval badge. No 3D where it does not encode product meaning (the emblem may rotate 30° on the marketing hero only, reduced-motion safe).
