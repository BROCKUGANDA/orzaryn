# ORZARYN — Responsive Guidelines (Stage 5)

## 1. Breakpoints (Tailwind defaults)

`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536. Design source order: mobile-first.

## 2. Layout behaviour

| Region | Mobile (<md) | Desktop (≥lg) |
| --- | --- | --- |
| Sidebar | Hidden; Sheet drawer via hamburger | Fixed 264px, collapsible to 64px icons |
| Top bar | 56px, org switcher icon + approval badge | 64px with breadcrumb + global actions |
| Dashboard | Single column stat stack | 12-col grid (4 stats, 2 panels) |
| Financial tables | Card-list fallback (<md): each row becomes a key/value card with the amount pinned top-right; horizontal scroll is a last resort and never for approval queues | Full table with sticky header, right-aligned mono amounts |
| Work-order detail | Stacked: timeline → money → evidence → actions | Two-column: left timeline/evidence, right terms/money/actions |
| Dialogs | Full-screen sheets (bottom) | Centred modal, max-w-lg/xl |

## 3. Rules

1. Touch targets ≥ 44px on all interactive elements at every breakpoint.
2. No horizontal page scroll on mobile; tables either transform to cards or scroll within their own container.
3. Money values must never truncate — wrap the label, keep the figure whole.
4. Sticky footer: root wrapper `min-h-screen flex flex-col`, `mt-auto` footer; safe-area inset padding on iOS (`env(safe-area-inset-bottom)`).
5. Approval actions remain one tap away on mobile (bottom action bar on detail views).
6. Focus visibility and hit-slop preserved in dense mode.
