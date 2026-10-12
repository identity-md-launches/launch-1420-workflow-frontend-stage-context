# PULSE frontend validation

## Scope and result

**Source, static export and worker validation are complete within the allowed write scope.** The in-place Git commit is blocked by the environment: `git add -- web/.gitignore` failed with `Unable to create .../.git/index.lock: Read-only file system`. The source, lockfile, export and evidence are left in the working tree for the submission service to collect. No attempt was made to change the protected Git mount or root configuration.

The approved PULSE workflow and both pinned handoffs were read before implementation. The deployed implementation binds PULSE in its constructor and has no owner or setter, so the conditional admin panel is inapplicable. A token and pool are supplied, so buy/sell controls are included. No owner, deployment address, pool hook, router, RPC credential or WalletConnect ID was invented.

The overriding path budget prohibits root files. The design document is therefore `docs/DESIGN.md`, instead of root `DESIGN.md`. The explicit `web/.gitignore` allowance is used only for nested frontend dependencies/caches and transient test output. Contract source, original ABI exports, `foundry.toml`, root README/build configuration, `lib/`, and `launch.json` are unchanged.

## Commands and evidence

Worker environment: Node 24.21.0, npm 11.19.0, Vite 7.3.1, TypeScript 5.9.3, React 19.2.4, viem 2.47.6. Playwright uses the worker's installed Chromium binary. All commands below ran locally.

| Check | Result |
| --- | --- |
| `npm install --prefix web --cache /tmp/pulse-npm-cache --no-audit --no-fund` | Dependencies installed; exact versions and npm lockfile retained under `web/` |
| `npm --prefix web run typecheck` and the typecheck inside the final build | Passed |
| `npm --prefix web run build` | Passed after final application changes; Vite static export followed by ABI copying and manifest generation |
| `npm --prefix web test` | 8 tests passed, including boundary/precision, ABI provenance and independent router byte-offset assertions |
| `npm --prefix web run test:browser` | 22 production-browser scenarios passed; see machine-readable report |
| `node web/scripts/check-dev.mjs` | Development HTML/transformed TS entrypoint, manifest and byte-identical ABI responses passed; managed server closed cleanly |
| `npm --prefix web run check:rpc` | Read-only mainnet chain/code/binding/token/pool checks passed; no signer or transactions |
| `npm --prefix web run verify` | Exact handoff/network/pool key and every final asset/ABI hash verified |
| `git diff ... -- src lib foundry.toml launch.json README.md scripts test ':!test/scratch'` | No deployed-source or protected-file changes |
| `node web/scripts/check-submission.mjs` | Complete scratch Git bundle checked against 8,388,608-byte limit; original checkout's read-only Git metadata is not modified |

A complete scratch Git bundle, including the source history and this frontend/export/evidence, was 3,479,237 bytes in the recorded packaging run (under 8,388,608 bytes). It was verified and cloned into a second scratch checkout, and the pinned ABI was read back successfully. The public handoff repository supplied an older history object absent from the read-only local object store; the original checkout was not altered. A final size check is repeated after documentation changes.

The final asset inventory has 10 files (639,525 bytes before the manifest), including both ABI arrays, HTML, two local WOFF2 fonts, JS/CSS, favicon and third-party notices. The manifest is excluded from its own inventory. There are no sourcemaps, vendored registry archives, `node_modules`, package-manager caches or submodules in the delivery file set. See the manifest itself for exact final SHA-256 values. Re-run `verify` after any export change.

The definitive automated browser evidence is [browser-validation.json](evidence/browser-validation.json). It records each executed scenario, viewport, console/resource errors, forced-colors focus and measured contrast. The latest successful run supersedes failed/interrupted development runs; no failure screenshot is retained as final evidence.

## Interaction coverage

The production export was served at `/preview/`, not just at `/`. Wallet and RPC responses were mocked for every state-changing flow; the harness decodes the actual ABI calldata and checks targets, token units and router parameters. No private keys are present. No transaction was broadcast.

The browser scenarios cover:

- Relative static resources, runtime configuration and ABI loading; public Hive reads; missing-wallet guidance; wallet rejection recovery; EIP-6963 multiple-wallet discovery and provider selection.
- Wrong-chain gating and exactly one switch control; 4902 triggers the exact supplied add-chain parameters, followed by another switch.
- Mint simulation, zero transaction value, pending/receipt locking, duplicate-click protection, actual metadata decoding and artwork reveal; cooldown gating, decoded custom revert, confirmation, six-hour warning, dormancy and revival/reset.
- Positive amount validation; exact staking allowance; approval rejection/retry; separate approval and deposit; rank progression; immediate withdrawal.
- Buying with IMD and selling PULSE; both allowance layers; correct quote/router/Permit2 addresses; current pool key/hook and currency order; zero ETH for ERC-20 swaps; rate/minimum output; decimal and slippage validation; simulation failure without signing; changed-input invalidation; sufficient-allowance skip behavior; 60-second expiry.
- PULSE transfer recipient validation, full-address review and separate confirmation.
- Alive/Dormant/Caste filters, empty-match recovery, active-streak versus stake rankings, global counts over 130 mocked Drones, batch starts 1 and 129 with counts ≤256, lazy gallery expansion and all 50 leaderboard rows.
- Account/chain changes, public-RPC failure and explicit wallet-RPC fallback, missing contract code, immutable-token mismatch, ABI tamper rejection, and an account switch while a receipt is pending. The previous account's Drone is never restored into the new account's view.
- Keyboard activation through connect, mint, exact approval and stake; first-tab skip link and focus transfer to main; desktop/mobile reflow; reduced CSS motion and removal of embedded SVG animation; a clean automated accessibility scan.

The eight pure tests additionally check exact 20-hour and inclusive 48-hour boundaries, the six-hour warning edge, all rank thresholds, bigint amount precision, five- and six-field dynamic router tuple offsets/body sizes, native-input value, token-input zero value, both currency directions, add-chain/rejection behavior, path validation and canonical ABI hashes. These tests are independent of any live funds.

## Rendered review and six Better Interface domains

The pinned Better Interface workflow, all six core domains, documentation section, Ethereum UX adapter/reference and retained licenses were read and applied during implementation. Dark-only English is the requested supported variant. No theme switch, localization system, modal overlay or notification permission was added.

| Domain | Coverage and observed result |
| --- | --- |
| Accessibility — Checked | Native controls/landmarks/labels; first-tab skip link; visible focus screenshot; keyboard connect/mint/approve/stake; disabled prerequisites; status/error announcements in markup; touch targets; reduced motion including SVGs; forced-colors keyboard focus is a solid 2px outline. Axe WCAG 2 A/AA, 2.1 AA and 2.2 AA tags report zero violations in the scanned connected state. No screen-reader session was performed. |
| Layout — Checked | Production renders at 1440×1000, 768×1024, 390×844 and 320×900; `scrollWidth` equals viewport width in each. 200% root-font text enlargement at 1440px also produces no page overflow. Gallery, card, filters, values and controls were visually inspected in screenshots. Native browser zoom and physical devices were not tested. |
| Writing — Checked | Actions name their effect; free mint also explains gas; staking disclaims rewards; beat versus stake meaning is clear; dormant recovery is described; USD absence is explicit; approvals name amount/spender; reviewed transfers show the recipient; persistent errors offer recovery. |
| Typography — Checked | Local font faces, actual weights, heading hierarchy, tabular numbers, bounded measure and long-address wrapping reviewed. Small UI copy was raised to a 12px floor. Inputs stay at least 16px. Desktop and narrow component screenshots show legible wrapping without clipped controls. |
| Colors — Checked | Semantic roles inspected; seven representative rendered foreground/background pairs measured from computed colors. All exceed 4.5:1. Labels/icons supplement status colors. Gradient/art text contrast is outside this measurement coverage; no light theme is claimed. |
| UI — Checked | Normal, selected, hover definitions, focus, disabled, pending, confirmed, error, empty and recovery states reviewed. Motion is restrained, pausable and reduced-motion aware. Artwork loading/retry, read-source feedback, timestamps, transaction links and field validation are implemented. Ten-percent-speed replay in an animations panel was not performed. |

Measured pairs from the browser:

| Pair | Ratio |
| --- | ---: |
| Muted hero/nav text on page | 8.18:1 |
| Dark primary-button text on amber | 10.29:1 |
| Muted card text on card surface | 7.58:1 |
| Selected segment text on selected surface | 10.30:1 |
| Entered amount text on input background | 16.23:1 |
| Alive text on card surface | 10.02:1 |

These are the actual pairs recorded by the harness, not a claim about every decorative pixel. The automated accessibility scan is not a claim of full accessibility compliance.

## Findings, corrections and rechecks

| Severity | Source location | Finding, fix and evidence |
| --- | --- | --- |
| High | `web/src/protocol.ts:52` | Initial router encoding flattened a dynamic struct. Independent review against Uniswap's calldata decoder found the missing leading tuple offset. The encoder now uses one struct argument; tests assert the leading 32-byte offset, total word count, hook-data offset, exact pool and settlement fields for both tuple variants and both directions. Corrected buy/sell interactions pass. |
| High | `web/src/store.tsx:69`, `:97`, `:259` | A receipt could call a refresh closure from the previous connected account. Refresh results now also compare the current account, and receipts use the current refresh reference. A dedicated pending-mint/account-change browser scenario verifies that the old Drone is not restored. |
| Medium | `web/src/components.tsx:145`, `web/src/store.tsx:282` | Manual receipt checks could race the still-running automatic waiter. The manual control is now exposed only after the automatic wait cannot establish confirmation; the pending lock remains held. Browser checks confirm the early manual control is absent. Long provider-outage/replacement behavior is source-reviewed, not live-tested. |
| Medium | `web/src/wallet.ts:75` | A legacy injected provider could be dropped when a second EIP-6963 provider announced. Matching entries now upgrade their metadata in place while distinct providers remain selectable. The multiple-wallet browser scenario selects and connects the second provider. |
| Medium | `web/src/domain.ts:102` | A broad “network” text match obscured a missing-contract-code diagnostic. Matching is now limited to actual transport/timeout patterns. Browser tests distinguish missing code, binding mismatch and transport failure while keeping writes disabled. |
| Medium | `web/src/styles.css:201` and responsive overrides | Early micro-labels were too small. UI caption/label sizes now have a 12px floor. Desktop/mobile rendered checks and the 320px staking screenshot pass without overflow. |
| Medium | `web/src/App.tsx:103`, `web/src/styles.css:104` | The skip target needed an explicit focus destination. Main has `tabIndex=-1`, and keyboard checks verify first-tab skip visibility and focus transfer. Forced-colors focus also passes. |
| Low | `web/src/styles.css:1` | Initial font imports included unused scripts and WOFF fallbacks. The final export contains only the required two Latin WOFF2 faces; local resource checks pass and licenses remain included. |
| Medium | `web/vite.config.ts:11` | Vite development serving needed access to the generated runtime configuration. Restricted JSON middleware now serves the same final manifest/ABIs from `dist/`; the development smoke test checks exact equality and TS entry transformation. |

A test-only focus assertion initially used programmatic focus after mouse input, so it did not activate `:focus-visible`; the test now establishes keyboard input first. The initial short development smoke test closed Vite during dependency scanning; it now awaits the scan and entry transformation before closing. These were harness fixes, not silent application failures.

## Visual evidence

- [Live desktop](evidence/live-desktop.png) and [live mobile](evidence/live-mobile.png): inspected through the available browser tool against the configured public RPC, with no wallet. The deployed Hive had zero mints at inspection. Console reported zero errors/warnings; resource checks found no failures; no page overflow was observed.
- [Desktop disconnected](evidence/desktop-disconnected.png), [desktop connected](evidence/desktop-connected.png), [tablet](evidence/tablet-connected.png), [mobile](evidence/mobile-connected.png), [320px](evidence/narrow-connected.png): deterministic mocked contract/wallet state.
- [Drone controls](evidence/drone-detail.png), [staking and swapping](evidence/finance-detail.png), [320px staking](evidence/narrow-stake.png), [keyboard focus](evidence/keyboard-focus.png): inspected detail captures from the production-browser harness.

Mock SVG responses are derived from the implementation's checked-in artwork preview and adjusted for fixture labels; they are not screenshots of newly minted mainnet NFTs. Production artwork comes only from the configured contract.

## Live-chain evidence and remaining limitations

[Read-only RPC report](rpc-validation.json) records Ethereum chain ID 1, nonempty LaunchToken/PulseDrone and all configured Uniswap contract code, PULSE name/symbol/18 decimals/fixed supply, the exact immutable PULSE binding, IMD symbol/decimals, and initialized slot0 at the attested pool ID. At block 26,176,675, `totalMinted` and `totalStaked` were zero. Mainnet RPC results were not used as proof of successful wallet transactions.

No live mint, heartbeat, token approval, stake, unstake, transfer, swap or liquidity transaction was sent. Real extension signing, real pool liquidity execution, transaction replacement/cancellation on a live chain, hardware wallets, WalletConnect, Safari/Firefox, physical mobile devices, screen readers and native 200% browser zoom remain untested. Error and wallet paths were tested with mocks. The 200% check was text enlargement, not native zoom. ENS lookup is omitted because the handoff has no resolver configuration; addresses remain checksummed, copyable and linked. USD prices and final absolute social-preview/domain metadata are unavailable inputs and are described as such.

The publisher's IPFS pin, named endpoint, immutable/named HTTP hash checks and configured-RPC publication checks have not run here. Their success is not claimed. No site was published and no contract redeployed. This document is worker evidence and carries no independent certification authority.
