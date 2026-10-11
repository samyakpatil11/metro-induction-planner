# Design System: Metro Induction Planner

Design specifications, tokens, and style guidelines for the **Nagpur Metro (NMRCL) Induction Planner** application.

---

## 1. Overview & Brand Rationale

The Metro Induction Planner UI is built around an authentic transport-operations aesthetic:
- **Palette**: Deep spruce/slate grounds paired with vibrant Nagpur Metro orange accents, emerald green service indicators, and high-visibility status tokens.
- **Form & Density**: Crisp bordered containers, high-contrast readable typography, and micro-elevation shadows tailored for high-stakes night-shift depot decisions.
- **Accessibility & Contrast**: Built to meet WCAG AA standards across daytime and nighttime depot control environments.

---

## 2. Color Palette

### 2.1 Core Neutral & Background Scale (`slate`)

The neutral palette utilizes deep slate/spruce tones for text, borders, and dark control surfaces:

| Token | Hex Value | Role & Usage |
|---|---|---|
| `slate-50` | `#F5F2EA` | App canvas background, warm off-white surface |
| `slate-100` | `#E9EFEC` | Subtle container fill, secondary pill background, standby chip fill |
| `slate-200` | `#D0DED8` | Primary dividers, table borders, card outlines |
| `slate-300` | `#BCCDC6` | Muted borders, track indicators, standby chip borders |
| `slate-400` | `#95AAA2` | Inactive icons, subtle helper labels |
| `slate-500` | `#57716A` | Secondary text, timestamps, captions, meta info |
| `slate-600` | `#3F5E58` | Subheadings, muted button text |
| `slate-700` | `#294C47` | Standby text, dark secondary elements |
| `slate-800` | `#1D403C` | Primary text, body copy, active labels |
| `slate-900` | `#183A37` | Headings, toast background, hero contrast text |
| `slate-950` | `#102B29` | Deepest dark surface, control-panel hero base |

### 2.2 Accent & Brand Scale (`orange`)

Primary action color representing Nagpur Metro Line 1, active operations, and primary CTAs:

| Token | Hex Value | Role & Usage |
|---|---|---|
| `orange-50` | `#FFF3EB` | Pill backgrounds, active badge tints, row hover gradient |
| `orange-100` | `#FFE5D5` | Highlight borders, selection backgrounds |
| `orange-200` | `#FFD0B5` | Text selection fill (`::selection`), hero subtitle text |
| `orange-300` | `#FFB28E` | Subtle focus rings, input highlight tints |
| `orange-400` | `#F58B60` | Signal live pulse, rail status indicator |
| `orange-500` | `#EE8158` | Nagpur Metro brand orange, primary action buttons |
| `orange-600` | `#F18B62` | Interactive button fill, route indicator, active hover |
| `orange-700` | `#BD4828` | High-contrast accent text, icon accents |
| `orange-800` | `#963B25` | Dark badge label text (`INDUCTION PLANNER`) |
| `orange-900` | `#793422` | Deep accent text on light backgrounds |
| `orange-950` | `#41190E` | High-contrast dark accent shade |

### 2.3 Status & Operational Tokens

#### In Service / Low Risk (`emerald`)
- **Background**: `emerald-100` (`#D9EBDF`) / `emerald-50` (`#EDF6F0`)
- **Border**: `emerald-200` (`#B8D9C4`)
- **Bar / Indicator**: `emerald-500` (`#478C61`)
- **Button Fill**: `emerald-600` (`#34734C`)
- **Text**: `emerald-700` (`#295B3D`) / `emerald-800` (`#234A34`)

#### Maintenance / Caution (`amber`)
- **Background**: `amber-100` (`#FEF3C7`) / `amber-50` (`#FFFBEB`)
- **Border**: `amber-200` (`#FDE68A`)
- **Bar / Indicator**: `amber-500` (`#F59E0B`)
- **Text**: `amber-700` (`#B45309`) / `amber-800` (`#92400E`)

#### Critical / High Risk / Expired (`rose`)
- **Background**: `rose-50` (`#FFF1F2`)
- **Border**: `rose-200` (`#FECDD3`) / `rose-300` (`#FDA4AF`)
- **Bar / Indicator**: `rose-500` (`#F43F5E`)
- **Toast Fill / Error**: `rose-600` (`#E11D48`)
- **Text**: `rose-700` (`#BE123C`) / `rose-800` (`#9F1239`)

#### Standby / Neutral / Line 2 (`aqua` / `slate`)
- **Aqua Line 2 Track**: `#89D0C1`
- **Standby Fill**: `slate-100` (`#E9EFEC`)
- **Standby Text**: `slate-700` (`#294C47`)

---

## 3. Typography Scales

### 3.1 Font Stacks
- **Body & UI**: `'DM Sans', 'Aptos', 'Segoe UI', -apple-system, sans-serif`
- **Headings & Display**: `'Space Grotesk', 'Aptos Display', 'Segoe UI', sans-serif`
- **Numerical & Code**: `'IBM Plex Mono', 'JetBrains Mono', 'Fira Code', monospace`

### 3.2 Type Scale

| Level | Size (px / rem) | Line Height | Tracking | Recommended Weight | Usage |
|---|---|---|---|---|---|
| **Micro / Tag** | 11px / 0.6875rem | 1.2 | `0.14em` - `0.16em` | Bold (`700`) | Status labels, uppercase chips, section badges |
| **Caption / XS** | 12px / 0.75rem | 1.33 | Normal | Semibold (`600`) | Table metadata, helper text, status chips |
| **Small / SM** | 14px / 0.875rem | 1.4 | Normal | Regular / Semibold (`400`/`600`) | Secondary descriptions, button text, form labels |
| **Base** | 15px / 0.9375rem | 1.5 | Normal | Regular / Medium (`400`/`500`) | Standard body copy, table cell content |
| **Large / LG** | 18px / 1.125rem | 1.4 | `-0.01em` | Bold (`700`) | Card subheadings, modal titles, summary rows |
| **XL** | 20px / 1.25rem | 1.35 | `-0.02em` | Bold / Black (`700`/`900`) | Section titles, panel headers, tab headers |
| **2XL** | 24px / 1.5rem | 1.25 | `-0.02em` | Bold (`700`) | KPI stat metrics (`23`, `16`, `05:30`) |
| **3XL** | 30px / 1.875rem | 1.2 | `-0.02em` | Bold (`700`) | Main page headers, welcome headlines |
| **Display / Hero** | 36px–60px / 2.25–3.75rem | 1.08 | `-0.025em` | Bold (`700`) | Login hero statement, marketing hero |

---

## 4. Border Radiuses

The interface utilizes structured corner roundness that transitions from sharp interactive controls to gentle containment cards:

| Token | Radius Value | Visual Role & Component Usage |
|---|---|---|
| `rounded-none` | `0px` | Full-width divider lines, sharp edges |
| `rounded-sm` | `2px` (`0.125rem`) | Track notches, progress indicators |
| `rounded-md` | `6px` (`0.375rem`) | Table badges, small toggles |
| `rounded-lg` | `8px` (`0.5rem`) | Standard buttons (`Btn`), text input fields, dropdown selects |
| `rounded-xl` | `12px` (`0.75rem`) | Sub-tab buttons, toast notifications, logo container frames |
| `rounded-2xl` | `12px / 16px` (`0.75rem`) | Main panels (`Card`), login form container, modal dialogs |
| `rounded-full` | `9999px` / `50%` | Status chips (`StatusChip`, `RiskChip`), signal pulse dots, avatar icons |

### 4.1 Card Borders & Edge Highlight Gradients
Cards across the application utilize refined layered surface strokes rather than solid opaque borders:
- **Card Perimeter Border**: `1px solid rgba(255, 255, 255, 0.08)` (`border border-white/[0.08]`)
- **Top-Edge Highlight**: `rgba(255, 255, 255, 0.15)` (`border-t-white/15`) simulating a subtle top-lit dimensional highlight.
- **Hover Enhancement**: Transitions to `hover:border-white/20` alongside `hover:shadow-md`.

---

## 5. Shadow Styles & Elevation

All elevations are calibrated using tinted slate undertones (`rgb(24 58 55 / ...)` or `rgb(16 43 41 / ...)`) rather than flat neutral blacks, maintaining harmony with the deep spruce brand palette:

| Token / Layer | Shadow Specification | Usage |
|---|---|---|
| **Shadow SM** | `0 2px 10px rgb(24 58 55 / 5%)` | Flat card default, persistent header border elevation |
| **Shadow MD** | `0 8px 28px rgb(24 58 55 / 5%), 0 1px 2px rgb(24 58 55 / 4%)` | Hover state for interactive cards, dashboard panels |
| **Shadow LG** | `0 10px 25px rgb(24 58 55 / 12%)` | Floating toast messages, popovers, dropdown menus |
| **Shadow XL** | `0 24px 70px rgb(16 43 41 / 22%)` | Modal confirmation overlays (`Confirm` dialog) |
| **Login Card** | `0 28px 90px rgb(24 58 55 / 13%), 0 4px 18px rgb(24 58 55 / 5%)` | Login container elevated backdrop |
| **Action CTA** | `0 8px 18px rgb(223 96 57 / 22%)` | Primary orange button elevation |
| **Asset Dropshadow** | `drop-shadow(0 5px 4px rgb(24 58 55 / 16%))` | Metro loader train SVG graphic |
| **Focus Ring** | `outline: 3px solid rgb(241 139 98 / 65%); outline-offset: 2px` | Accessible focus state on buttons, inputs, links |
| **Signal Pulse** | `0 0 0 8px rgb(233 117 75 / 0%)` (keyframes) | Live night-shift active indicator |

---

## 6. Layout & Surface Patterns

1. **Planner Canvas**:
   - Background linear blend from `#F8F5EE` to `#F0F3ED` and `#F5F0E7`.
   - Subtle radial lighting overlays: top-right illumination (`rgb(255 255 255 / 95%)`) and bottom-left aqua glow (`rgb(199 224 214 / 72%)`).

2. **Control Panel / Dark Hero**:
   - Angular gradient: `linear-gradient(145deg, #102B29 0%, #183A37 48%, #22534C 100%)`.
   - Atmospheric accents: Radial orange bloom (`rgb(241 139 98 / 28%)`) and subtle circular contour lines (`border: 1px solid rgb(255 255 255 / 9%)`).

3. **Motion Guidelines**:
   - Interactive hover transitions: `150ms ease`.
   - Page enter animations: `260ms cubic-bezier(.2, .75, .25, 1)`.
   - Drawer slide-ins: `240ms cubic-bezier(.2, .75, .25, 1)`.
   - Full reduced-motion compliance via `@media (prefers-reduced-motion: reduce)`.
