# PULSE implemented design

This document records the final frontend in `web/src/`. It lives under `docs/` because the assignment's overriding path budget prohibits creating a root `DESIGN.md`.

## Overview

PULSE is a mobile-first companion for a soulbound onchain Drone. The requested near-black, amber/gold identity is expressed with open spacing, a single large headline, fine structural lines, a hexagonal specimen illustration, and a quiet heartbeat trace. Live contract information and financial controls sit on solid, slightly lighter surfaces. The interface is deliberately dark-only.

The reading order is hero and global counters, personal Drone, staking and swapping, Hive and rankings, then the project and contracts. The hero illustration is explicitly labeled “Illustration.” Minted artwork is loaded from the actual contract's `tokenURI`; no fixture art or fabricated statistics ship in the app.

## Colors

The source of truth is `web/src/styles.css:17`. Primitive hex values feed role tokens; the implemented colors are all sRGB.

| Role token | Value | Use |
| --- | --- | --- |
| `--page` | `#10110e` | Page, fields and inset surfaces |
| `--surface` | `#181a15` | Primary cards |
| `--surface-raised` | `#1e211a` | Secondary surface/progress track |
| `--text` | `#eeeee5` | Headings, body and enabled controls |
| `--muted` | `#a6ad9b` | Descriptions, secondary labels and addresses |
| `--border` | `#454a3e` | Field/control outlines and structural divisions |
| `--accent` | `#e7b85a` | Primary action fills, brand, heartbeat trace and highlighted values |
| `--accent-hover`, `--focus` | `#f4cd80` | Hover fill and focus outline |
| `--on-accent` | `#10110e` | Text on amber buttons |
| `--alive` | `#b4cd83` | Alive status and connection indicator |
| `--error` | `#f3a99a` | Persistent error text and border |

Additional structural border values `#34372d` and `#363a2e` divide noninteractive sections/cards; selected segments use `#34382b`. Warnings use amber plus explicit text, errors use coral plus explanatory copy, and life state always has a word or symbol rather than color alone. Art keeps the contract's own palettes.

Measured rendered color pairs are in `docs/frontend/evidence/browser-validation.json`; none of those measurements are inferred from a screenshot. Decorative gradients and the contract artwork are not claimed as text-contrast coverage.

## Typography

- **Manrope Variable**, local Latin WOFF2, weights 200–800 available, is the body/display family. Sans-serif fallback. Implemented body/control weights are 400–700, primarily 500/550/600/650. Base body is 1rem with 1.6 unitless line height.
- **IBM Plex Mono**, local Latin WOFF2 at weight 400, is used for call signs, time, counters, compact labels and addresses. Monospace fallback. `font-synthesis: none` prevents manufactured faces; numeric emphasis primarily uses size/color.
- Display heading: `clamp(2.8rem, 4.65vw, 4.15rem)`, 1.12 line height, weight 500, `-.065em` tracking, with a constrained measure and intentional line break. Smaller widths change the clamp.
- Section headings: `clamp(1.75rem, 3.1vw, 2.5rem)`, 1.2 line height, weight 600. Card titles: 1.5rem/1.3. Headings use balanced wrapping.
- Body descriptions generally use .8125–.9375rem. Captions and compact labels have a .75rem floor. Eyebrows use uppercase styling and .14em tracking; stored copy remains normal text.
- Changing numbers use tabular figures. Long amounts and addresses can wrap. Full addresses remain available through links and copy controls, and exact amounts use bigint before display formatting.
- Inputs are at least 1rem; amount entry is 1.5rem. Body text uses pretty wrapping and bounded measure (typically 44–65 characters). No remote font request is required.

Font files enter Vite through the two `@font-face` declarations at `styles.css:1`; their OFL notices ship with the export.

## Layout

`.container` caps main content at 1280px. Desktop margins are 3rem per side; the header is allowed up to 1400px. Repeated spacing uses .5/1/1.5/2/2.5rem steps. Within-card grouping is tighter than the 5.5rem desktop section separation.

The hero uses an approximately 1.15:1 two-column grid, the personal panel .85:1.15, and financial cards two equal columns. The Hive uses four columns and loads another 12 cards on request. Counters use a four-cell strip; the last cell is explanatory copy rather than a metric. The document stays in normal flow, so no fixed header or footer covers transaction controls.

| Breakpoint | Implemented changes |
| --- | --- |
| 72rem | 2rem outer margins, more compact header and panels |
| 57rem | Navigation moves to a second row; counter note disappears; Hive becomes three columns; About stacks |
| 43rem | 1.25rem outer margins; hero, personal, and finance grids become one column; unminted decorative panel is omitted; Hive becomes two columns; filters and leaderboard controls wrap; secondary table Caste column is hidden |
| 23rem | 1rem margins; tighter card padding; Hive becomes one column |

The owner call sign, account link, controls and warnings remain visible on mobile. Long tables have a local horizontal overflow wrapper; the page itself showed no horizontal overflow at 320, 390, 768 or 1440 CSS pixels. These widths were rendered in Chromium; native-device and native browser zoom checks are separate limitations in validation.

## Elevation & depth

The site is mostly flat. Solid tonal layers distinguish page, inset, and card surfaces. Subtle 1px borders carry structure. The hero uses a decorative radial glow and a gold shell gradient. There are no dropdown overlays, modal dialogs, backdrop filters or page-wide shadows. Onchain images have a neutral white 10% outline. The skip link sits above the header when focused.

## Shapes

The repeating brand motif is a hexagon, expressed in the logo, hero specimen and Drone artwork. Financial controls remain rectangular for predictable hit areas. Panels use 10px corner radii with 6px inset groups; ordinary controls use 4px, and gallery/image frames use 8px. There are no clipped hit targets. Buttons and major controls are at least 44–48px tall.

## Components

| Source | Pattern and implemented states |
| --- | --- |
| `components.tsx` — `PulseMark`, `SectionHeading` | Repeated brand SVG and section eyebrow/title/description hierarchy |
| `components.tsx` — `Gate`, `ConnectButton` | Connect, wrong chain, unverified/read-error, and ready states; a single global switch-network control appears before transaction gates |
| `components.tsx` — `ActionButton`, `TxFeedback` | Primary/outline actions; disabled and busy states; per-action simulation/signing/receipt/error/confirmation feedback with explorer links and the signing account when it differs from the connected one |
| `components.tsx` — `AddressView` | Checksummed full/compact addresses, explorer link, native copy button and copy failure text |
| `components.tsx` — `DroneArt` | Lazy contract artwork, loading shell, retry state, isolated SVG image, static SVG variant when motion is paused or reduced |
| `DronePanel.tsx` | Mint/reveal, actual Drone statistics, countdown/warning/dormancy, rank progress, exact approval/stake/unstake and reviewed token transfer |
| `SwapPanel.tsx` | Buy/sell segmented controls, labeled amount/slippage fields, quote/minimum/rate, explicit approvals, simulation and persistent result feedback |
| `Hive.tsx` | Status and Caste filters, progressive gallery, no-matches recovery, empty Hive, and top-50 table with two ranking modes |
| `styles.css` | Shared `.panel`, `.button`, `.segmented`, `.amount-field`, `.data-row`, `.notice`, `.status` and `.tag` patterns |

Native buttons, links, selects, `details`, `progress` and tables provide semantics. Inputs have visible associated labels; validation uses inline error text and alert regions. Every keyboard target uses a 2px gold `:focus-visible` outline with 5px offset, with a system-color override in forced-colors mode. The first focusable element is a skip link targeting the programmatically focusable main landmark. Reduced motion disables decorative CSS animation and removes SVG animation nodes from displayed contract images. The visible pause control also freezes the hero trace and artwork. Motion is decorative; status is always stated in text.

Buttons have 150ms background/border/transform transitions only when motion is permitted. Press scale is .96. The heartbeat trace runs a six-second low-amplitude cycle, and a spinner indicates pending work without replacing the status text. Hover styles are restricted to hover-capable pointers.

## Do's and don'ts

- Reuse role tokens, shared controls and the existing section/card structure. A new section should use `SectionHeading`, the `.container` reading edges and the existing responsive grids.
- Keep contract state, eligibility and amount precision in the data layer; let `Gate` and `ActionButton` enforce prerequisites. Never bypass simulation or add another address map in a component.
- Use amber-filled buttons for the primary action in each independent task panel. Peer controls use outlines or neutral segments. Keep transaction consequences next to the action.
- Preserve persistent, actionable errors and receipt links. Do not turn failures into temporary toasts or make unavailable controls appear active.
- Keep externally supplied artwork isolated in an image and retain motion alternatives. Do not replace actual minted artwork with the hero illustration.
- Keep long IDs and financial values reachable; do not trade accuracy for a shorter label. Do not invent USD prices, admin powers, sample balances or deployment addresses.

The design was reviewed using the pinned Better Interface six-domain guide. Findings, repairs, rendered evidence and explicit limitations are in `docs/frontend/VALIDATION.md`. Guidance attribution and original licenses are retained under `docs/licenses/`.
