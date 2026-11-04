# ORZARYN — Accessibility (Stage 5)

Target: **WCAG 2.1 AA** across the application.

## 1. Colour & contrast

- Text contrast ≥ 4.5:1 (normal), ≥ 3:1 (large text, UI components, graphical objects). Verified pairs: `#E8ECEA` on `#070908` (15.2:1), mint `#3DF0B2` on canvas (10.6:1) for large text/icons, amber/red adjusted on dark backgrounds.
- Status is **never colour-only**: every StateBadge pairs colour with a text label; BudgetMeter pairs colour with percentage + label; luminous effects are decorative only.

## 2. Semantics & ARIA

- Landmarks: `header` (top bar), `nav` (sidebar), `main` (view shell), `footer`.
- The internal view router sets `document.title` per view and moves focus to the `main` heading on navigation (focus management parity with page navigation).
- Tables: proper `<th scope>`, captions for financial tables; sortable headers use `aria-sort`.
- Dialogs/Sheets: focus trap, `aria-modal`, restore focus on close (shadcn defaults verified).
- Live regions: `aria-live="polite"` for toasts; `role="status"` for async save indicators; errors announced via `role="alert"`.
- Icons decorative → `aria-hidden`; icon-only buttons require `aria-label`.

## 3. Keyboard

- Full keyboard navigation; visible 2px accent focus ring everywhere (`:focus-visible`).
- Approval queue: `j/k` navigation optional; Enter opens, `a`/`r` act with confirm dialog — all actions also reachable by Tab.
- Modal stacking order managed by shadcn; Escape closes topmost layer.

## 4. Motion & vestibular safety

All animations honour `prefers-reduced-motion` (see MOTION_SYSTEM §4); no autoplaying video; the approval-badge breathing loop stops under reduced motion.

## 5. Forms & errors

Labels bound with `htmlFor`; required fields marked in text (not colour); validation errors reference the field, use `aria-describedby` + `aria-invalid`; financial confirmation dialogs restate exact amounts in words and figures.

## 6. Content

Plain-language error codes plus human messages; hashes/IDs have copy affordances with screen-reader-friendly announcements ("copied work order ID").
