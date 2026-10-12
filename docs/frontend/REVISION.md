# PULSE revision validation

This revision evaluates the nine reopened findings against the previously accepted frontend. All nine reproduced and were fixed within the frontend/documentation scope. The authoritative per-finding answers are in root `.imd-responses.json`, explicitly requested for this revision. Git ignores that worker-response file, so it remains at the requested root path for the review service; only `web/`, `dist/` and `docs/` delivery files are committed. The deployment, contract source, ABI exports, network addresses and write flows were preserved. No transaction was broadcast or site published.

## Reproduction and rendered recheck

The cited `.imd/reads/skills/design-critic/scripts/taste.mjs` was not supplied. Instead, a Chromium/Playwright probe loaded the original committed export under `/preview/`, measured real DOM text/styles/geometry at 1440 and 390px, captured screenshots, and accelerated its timer against a 4,096-Drone RPC fixture. The baseline is retained in [revision-before.json](evidence/revision-before.json). These are worker observations, not independent certification.

The repeatable final recheck is `web/tests/revision.mjs`; its measurements and seven read-scheduling scenarios are in [revision-validation.json](evidence/revision-validation.json). It checks 1440, 768, 390 and 320px widths. The separate existing browser suite tests connected workflows, keyboard behavior, 200% text enlargement and accessibility.

| Finding | Current source | Reproduced cause, fix and recheck |
| --- | --- | --- |
| `f6d1d221` | `web/src/styles.css:203`, `web/src/components.tsx:22` | Repeated uppercase, tracked mono kickers and uneven counter baselines. Removed heading kickers/section numbers; retained natural 13px counter/Caste labels. Shared grid rows align the values at all four widths. At 390px two longer labels wrap to two lines; forcing one line would require a different column layout or smaller text. |
| `1a716a6d` | `web/src/App.tsx:185`, `web/src/styles.css:416` | Hero slogan stack. Kept the exact required headline, one plain description and factual mint line; removed decorative copy and stats slogan. Counters share three equal columns. |
| `8e337a4b` | `web/src/styles.css:44`, `:128`, `:349` | Six weights and many overlapping sizes. Consolidated to six size steps, at most three weights, and a 600-weight H1. Exactly six computed sizes occur at each tested width; no page overflow. |
| `26eba641` | `web/src/App.tsx:207`, `web/src/styles.css:1437` | At 390px the decorative image was 426px tall and counters started at 1212.58px. Removed specimen captions and hide the illustration at 43rem and below. Counters now span 684.05–804.42px, entirely inside the 390×844 first screen. |
| `074ac302` | `web/index.html:17`, `web/scripts/social-card.mjs` | No sharing image. Rendered the existing vector Drone and local font to `web/public/og.png`, exported it, and added OG/Twitter large-image metadata. Production image request succeeds and PNG dimensions are 1200×630. Absolute URLs and actual platform unfurls require the publisher's future domain. |
| `5923544e` | `web/index.html:11`, `web/src/DronePanel.tsx:228` | Em dashes in title and staking prose. Replaced with a colon and plain sentences/comma; rendered text checked. Unavailable-value placeholders remain. |
| `b06e3786` | `web/src/styles.css:679` | Nested rank surface. Removed background, radius and padding at every breakpoint. Computed background is transparent and padding/radius zero; progress and staking controls remain usable. |
| `5e2f2624` | `web/src/chain.ts:111`, `web/src/store.tsx:70`, `:128` | Every timer tick scanned the full Hive. Timer-only reuse now requires the same block number, block hash, supply and account, plus a complete verified prior snapshot. Refreshes personal state and checks RPC chain ID; manual/confirmed-action reads remain full. Errors and account/RPC changes invalidate the cache. New block, same-height reorg, changed supply/account, verification failure/recovery, and confirmed-heartbeat rechecks pass. |
| `e1e9fc0c` | `web/src/components.tsx:41`, `:79`, `web/src/App.tsx:198` | The external-link glyph also appeared on in-page links and wallet buttons. Removed it from those controls, including quote/transfer-review buttons. Zero internal/button arrows remain; external links keep their glyphs. |

At full supply, the original unchanged-block poll made **32 Hive batches / 52 full-page RPC requests**. The final unchanged-block poll makes **zero Hive batches / 5 full-page RPC requests** disconnected, and 11 requests connected. The snapshot itself makes three public requests (block, supply, chain ID); the unchanged swap panel also reads paired-token metadata. Personal state, balances and allowance are freshly read when connected. Full manual refresh still makes 32 batches.

This deliberately implements the reported unchanged-block optimization. Ethereum normally advances between 30-second ticks, so new blocks still require a full Hive read to preserve exact global counts/rankings. Event-indexed or incrementally maintained global state is outside this bounded revision; no claim is made that those ongoing full-supply costs were eliminated.

## Better Interface review

The pinned workflow, six core domains and documentation guidance were read and applied. Existing palette, brand, contract actions and responsive structure were preserved. Final tokens and components are documented in [DESIGN.md](../DESIGN.md).

| Domain | Coverage in this revision |
| --- | --- |
| Accessibility | Checked native control names, heading semantics, focus/skip link, keyboard connect/mint/approve/stake, reduced motion and disabled prerequisites via the existing browser suite. Automated axe scan has zero violations in its scanned connected state. Screen-reader and physical-device sessions remain unperformed. |
| Layout | Checked screenshots and overflow at 1440, 768, 390 and 320px, aligned live counters, mobile hero priority, and flat rank layout. Root-font 200% enlargement passes; native browser zoom and RTL/localized layouts remain untested (English-only, dark-only product). |
| Writing | Removed repeated hero/kicker copy, retained required wording and transaction consequences, corrected title/stake punctuation and link glyph semantics. Existing error/approval explanations remain. |
| Typography | Rendered six-step scale at all four widths, headline weight 600, natural labels, local fonts and normal input sizes. Checked wrapping in full connected captures and 320px staking details. No speculative single-line claim is made for the long counter label. |
| Colors | Kept the established semantic palette. Existing browser harness remeasures seven rendered text/background pairs; all exceed its 4.5:1 threshold. Decorative artwork/gradient contrast is not included in that claim. |
| UI | Checked removal of nested rank chrome, consistent external-link glyphs, action loading/pending/error/confirmation states, and pausable/reduced motion. Animation-panel replay at 10% speed remains unperformed. |

The browser MCP could not launch because it expected Chromium under `/home/node/.cache/ms-playwright/`. Rendered checks and screenshot inspection were performed with the installed Chromium at `/opt/ms-playwright/chromium-1247/chrome-linux64/chrome` through the Playwright harness. No unavailable MCP observation is claimed.

## Commands and evidence

Environment: Node 22.23.2, npm 10.9.8; existing locked dependencies installed with `npm ci --prefix web --no-audit --no-fund`.

```sh
npm --prefix web run typecheck
npm --prefix web run build
npm --prefix web test
PULSE_CHROMIUM_PATH=/opt/ms-playwright/chromium-1247/chrome-linux64/chrome npm --prefix web run test:browser
PULSE_CHROMIUM_PATH=/opt/ms-playwright/chromium-1247/chrome-linux64/chrome npm --prefix web run test:revision
node web/scripts/check-dev.mjs
npm --prefix web run check:rpc
npm --prefix web run verify
node web/scripts/check-submission.mjs
```

- Typecheck/build and manifest/ABI verification pass. Export uses relative assets and the same runtime manifest/ABI configuration. The manifest includes the new share image and every final exported file.
- 17 unit tests pass: the existing eight plus nine cache/read-scheduling cases. The existing 22 production-browser scenarios pass, along with the focused revision recheck. No uncaught application exceptions or failed static resources occurred in successful mock runs.
- The first focused revision run assumed three whole-page RPC requests; it measured five because the unchanged swap panel also reads IMD symbol/decimals. The assertion was corrected to distinguish three snapshot calls from full-page traffic; the application was not changed to hide those calls.
- Live desktop (1440×1000) and mobile (390×844) captures were also refreshed against the public RPC at block 26,177,039, with zero page/resource errors and no overflow; see [live-browser-validation.json](evidence/live-browser-validation.json).
- Live verification is read-only. [rpc-validation.json](rpc-validation.json) records chain ID, contract code/binding, token metadata and pool reads. It is not evidence of a successful live swap.
- [Mobile first screen](evidence/revision-390-hero.png), [desktop first screen](evidence/revision-1440-hero.png), and the refreshed existing connected/component screenshots show the final design. The two revision hero images use an empty mocked Hive; connected screenshots use clearly documented fixtures.
- [Build log](evidence/build-validation.txt), [browser report](evidence/browser-validation.json), [revision report](evidence/revision-validation.json), and [package check](evidence/submission-validation.json) record the performed checks. The bundle check includes the accepted frontend's existing history as well as the revision, verifies the complete bundle and clones it back for pinned ABI inspection. A local-only bundle initially failed on promised historical tree object `9437deae`; the check now fetches the pinned deployed-source history into its disposable clone before packing, preserving the accepted frontend history and leaving the original Git configuration untouched.

Complete for the stated revision scope. No live mint, heartbeat, approval, stake, unstake, transfer or swap was authorized or sent. Real wallet extension/hardware/mobile signing, actual liquidity execution, social-platform unfurls, screen readers and non-Chromium engines remain untested. Publication URLs, IPFS pinning and named-entrypoint checks belong to the publisher and are not claimed here. The root design-document request remains superseded by the explicit write budget; `docs/DESIGN.md` is the delivered design reference.
