# ORZARYN — Brand Guidelines (Stage 5)

## 1. Brand essence

**ORZARYN** is the control plane for controlled agent autonomy. The brand communicates six properties (per directive): financial precision, security, controlled autonomy, technological sophistication, transparency, commercial trust.

- **Positioning line:** "Authority, bounded. Settlement, proven."
- **Voice:** precise, declarative, never promotional. Numbers are stated exactly (never "around", "roughly"). Limitations are stated plainly — the brand's honesty is part of its identity.

## 2. Wordmark

- Uppercase `ORZARYN`, tracking +0.08em, weight 600, display typeface (Space Grotesk).
- Construction: the initial **O** is replaced by the emblem ring at display sizes ≥ 32px; at small sizes the plain glyph is used.
- Minimum clear space: half the cap-height on all sides. Never stretch, outline, recolour, or add effects beyond the defined luminous accents.

## 3. Emblem ("Bounded Orbit")

A regular hexagon (the mandate: six explicit sides = six permission facets) containing a centred node (the agent) held by a partial orbital ring that stops at the hexagon's edge (authority bounded by policy). Geometry is monoline, 2px stroke at 24px, rounded caps.

- **Horizontal lockup:** emblem + wordmark on one baseline.
- **Stacked lockup:** emblem above centred wordmark for avatars and covers.
- **Application icon:** emblem only on `bg-canvas` tile, corner radius 22%.
- **Favicon:** 32px emblem, mint node on dark.

Variants: dark (default), light, monochrome (single-colour contexts), luminous (marketing hero only — never inside financial surfaces).

## 4. Colour system

| Token | Dark value | Light value | Use |
| --- | --- | --- | --- |
| `canvas` | `#070908` | `#F6F7F6` | App background |
| `surface` | `#0D100F` | `#FFFFFF` | Cards, panels |
| `surface-raised` | `#121614` | `#FAFBFA` | Popovers, dialogs |
| `border` | `#1E2422` | `#E2E6E4` | Hairlines |
| `text-primary` | `#E8ECEA` | `#10140F` | Primary text |
| `text-muted` | `#9AA5A0` | `#5A6660` | Secondary text |
| `accent` (mint) | `#3DF0B2` | `#0B7A55` | Primary actions, live states, focus |
| `accent-dim` | `#1E7A5A` | `#D7F5E9` | Accent fills, badges |
| `amber` | `#E8B44A` | `#8A6410` | Pending, approval required |
| `red` | `#F26D6D` | `#B3261E` | Denial, revocation, disputes |
| `violet` (data) | `#9D8CFF` | `#5A48C8` | Charts/identity only — never actions |

Rules: blue/indigo are excluded from the palette (distinctiveness + the ledger's "red/green" money semantics stay unambiguous). The mint accent is **restrained**: glow (`box-shadow: 0 0 24px rgba(61,240,178,.18)`) is reserved for live/authorised states and the primary action; at most one luminous element per viewport region.

## 5. Typography

- **Display/headers:** Space Grotesk (600/500). Tight tracking (-0.01em) below 24px, +0.08em for the wordmark.
- **Body/UI:** Inter (400/500/600).
- **Numerals/amounts/IDs:** JetBrains Mono — **tabular numerals are mandatory for every financial figure**, right-aligned in tables.
- Scale: 12 / 13 / 14 (base) / 16 / 20 / 24 / 32 / 44. Line height 1.5 body, 1.15 display.

## 6. Shape, surface, depth

- Corner radius: 8px controls, 12px cards, 16px dialogs. Data-dense tables use 6px.
- Borders are 1px hairlines; elevation is expressed by border + subtle inner glow on hover, not heavy shadows.
- Signature surface treatment: **ledger grid** — a faint 24px background grid on canvas areas only (never behind text blocks), evoking an engineer's ledger.
- Status colours always pair with text labels; colour is never the sole signal (accessibility + precision).

## 7. Asset implementation

Assets ship as inline SVG components (`src/components/brand/`) so they inherit theme tokens: `Emblem`, `Wordmark`, `LogoHorizontal`, `LogoStacked`, `AppIcon`; `public/favicon.svg` + generated `icon.svg` for the browser tab. All variants meet WCAG contrast on both themes.

## 8. Prohibitions

No stock 3D coin imagery. No rainbow gradients. No marketing claims on financial surfaces. No decorative transaction confirmations. No fake dashboards. Motion and glow must always encode state (see `MOTION_SYSTEM.md`).
