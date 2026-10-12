# PULSE frontend

A static React + TypeScript interface for the deployed PULSE token, soulbound PulseDrone, and attested PULSE/IMD Uniswap v4 pool. The delivered `../dist/` is the publishable site and belongs in the same commit as the frontend source. No backend, private key, API key, WalletConnect project ID, or contract deployment is required.

## Run and rebuild

Use Node.js 24 (the worker used 24.21.0) and npm. Run from the repository root:

```sh
npm ci --prefix web
npm --prefix web run typecheck
npm --prefix web run build
npm --prefix web run verify
npm --prefix web run preview
```

Vite's preview command prints its local URL. `npm --prefix web run dev` runs the development server; run a production build first so the static deployment manifest and ABIs exist, the Vite development middleware serves that same manifest and those ABIs. Use production preview for release validation. The production export uses `base: './'`, relative file URLs, and hash anchors, and can be served below a gateway path without rewrites. Publish **the contents of `dist/`**, including `imd-deployment.json`, ABI files, fonts and notices. The publisher does not need to rebuild it.

For a bounded subpath preview used by worker inspection:

```sh
node web/scripts/preview.mjs
```

It serves `/preview/` on a printed loopback URL, stops on Ctrl-C, and closes after 15 minutes. The browser test manages and closes its own server.

## Deployment configuration and provenance

The browser fetches `dist/imd-deployment.json`, then the ABI files named by that manifest. That is the only runtime deployment/address/chain/RPC map. `src/config.ts` validates the configuration and each ABI's canonical Keccak hash before creating a client. Generic ERC-20 and Uniswap protocol interfaces live in `src/protocol.ts`; protocol addresses always come from the manifest's unchanged network block.

`deployment/handoff.json` and `deployment/network.json` are retained copies of the assignment's pinned inputs, used **only by the export script**. They are not imported into the JavaScript bundle and must not be edited independently of a new attested deployment. During this assignment the script also compares those copies against `.imd/reads/` when those inputs exist.

`npm run build` runs typechecking and Vite, then `scripts/export.mjs`:

1. Reads `docs/abi/LaunchToken.json` and `docs/abi/PulseDrone.json` with `git show` at the handoff's exact deployed source commit. Git history containing that commit is therefore needed when rebuilding.
2. Verifies `keccak256(UTF8(canonical JSON ABI))` against each handoff hash. Canonical JSON sorts object keys recursively and preserves array order; hashes omit `0x`.
3. Copies the original ABI bytes into `dist/abi/`.
4. Copies the exact launch ID, source commit, chain, attestation, contract names/addresses/ABI hashes, pool key, network and wallet-add-chain data into the runtime manifest. No extra top-level keys are emitted.
5. Inventories every final exported file except the manifest itself with lowercase SHA-256, enforcing asset count and size bounds.

`npm run verify` independently recomputes that inventory and checks the existing manifest without modifying it. Never edit export files manually; rebuild and verify after source changes. Deployment source and all original contract files remain unchanged.

## Implemented flows

- EIP-6963 browser wallet discovery and a legacy injected-wallet fallback. The UI shows a selector when multiple wallets announce themselves. No connection is requested on page load. Account and chain changes clear personal state. A missing chain is added using the exact supplied `walletAddChain`, then switched again.
- Public RPC fallback in the configured order. If those reads fail, a connected wallet on the right chain can explicitly supply its RPC; a public-RPC recovery button is then available. Signing always stays with the wallet.
- Live code/chain checks, immutable `pulseToken` binding, token symbol/decimals checks, and Uniswap pool/contract checks. Transaction controls fail closed on errors or stale data. Mint/beat/stake/unstake can remain available when only pool checks fail.
- Free mint (gas applies), actual onchain `tokenURI` artwork, 20-hour cooldown, inclusive 48-hour alive boundary, a warning inside the last six hours, revival, stored/best streaks, total beats, rank, wallet balance and staked PULSE.
- Exact PULSE approval to PulseDrone, staking and instant unstaking. All rank thresholds use bigint minor units. Staking pays no rewards and never renews a heartbeat.
- Buy and sell PULSE using the exact handoff pool. Quotes are simulated calls, expire after 60 seconds, and are invalidated by amount, direction, slippage, account or chain changes. The visitor chooses 0.1–5% slippage. The UI displays rate, pool fee and minimum received. IMD/PULSE amounts use their verified decimals; no USD price is fabricated.
- ERC-20-to-Permit2 approval and Permit2-to-Universal-Router approval are separate, explicit transactions, requested only when the current allowance is insufficient (or its expiration is too close). Both request the entered amount, with a 30-minute Permit2 spending expiry. ERC-20 swaps send zero ETH. Native input encoding is supported and unit tested, though this deployment uses IMD.
- The router receives `0x10` and a V4 action sequence of `0x060c0f`; the exact-input parameters are encoded as **one dynamic tuple**, followed by settle-all and take-all parameters. The network's optional `extendedSwapParams` flag selects the six-field tuple; otherwise the five-field tuple is used. Swap deadline is 20 minutes. The router call is simulated before the wallet opens.
- PULSE transfer has address/amount validation and a separate full-recipient review. Soulbound Drone transfers and approvals are explained as unavailable.
- Hive reads use block-pinned `getDrones` batches of 128. Global counts and top-50 leaderboards appear only after a complete snapshot. Gallery rendering is paginated by 12, and actual artwork reads are lazy. Filters cover Alive/Dormant and all four Castes. Active-streak ranking excludes Dormant Drones; staking ranking includes them.
- Persistent feedback per action covers simulation, signing, pending receipt, confirmation and error. A global lock prevents overlapping wallet actions without relabeling unrelated buttons as pending. Confirmed actions refresh allowances/state before unlocking. Receipt uncertainty retains the lock and offers a manual confirmation check after the automatic wait ends. Transaction replacements are followed; cancellations are not called successful actions. Activity retains the signing account and explorer link across account changes.

Reads refresh every 30 seconds while the page is visible. UI countdowns interpolate from the latest block timestamp every second. Snapshot time, block number, connection state and read source remain visible. All-state reads are bounded by the contract's 4,096-Drone limit; a slow RPC may take longer to complete the full Hive scan. A snapshot older than 90 seconds disables writes until refreshed. Simulation remains authoritative for cooldown and eligibility.

## Validation

```sh
npm --prefix web test
npm --prefix web run test:browser
npm --prefix web run check:rpc
npm --prefix web run verify
```

`node web/scripts/check-dev.mjs` checks the development server. `node web/scripts/check-submission.mjs` creates and verifies a complete size-check Git bundle in the disposable scratch area using the pinned public source repository, then checks the allowed path set and 8 MiB budget. The original `.git` mount is read-only on this worker; it is not modified.

`test` checks timing boundaries, amount precision, rank thresholds, the five/six-field router wire formats, currency directions, native transaction value, wallet switching, and pinned ABI integrity. `test:browser` serves the actual production export at `/preview/` and exercises it in Chromium with deterministic mocked RPC/wallet responses. **It never broadcasts transactions.** It writes its report and screenshots to `docs/frontend/evidence/`.

The browser script defaults to the worker's installed Chromium binary. On another machine set `PULSE_CHROMIUM_PATH` to a Chromium executable, or install Playwright Chromium and supply its executable path. `check:rpc` makes read-only requests to the handoff's public RPCs and writes `docs/frontend/rpc-validation.json`.

See [validation and limitations](../docs/frontend/VALIDATION.md) and the [implemented design](../docs/DESIGN.md). Screenshots use mock fixtures except files explicitly labeled as live public reads. They are worker evidence, not independent certification.

## Scope and limitations

The contract binds PULSE immutably and has no `owner()` or `setPulseToken()`, so no admin panel or guessed owner is present. ENS resolution is not configured because the network handoff supplies no ENS resolver; the app uses checksummed addresses, full-address links, and copy controls. WalletConnect is not configured without a supplied public project ID. Open Graph title/description and favicon are included; absolute deployment URL/social-image metadata await the publisher's final domain.

No live mint, heartbeat, approval, stake, unstake, transfer or swap was authorized or broadcast during validation. Real wallet extension/mobile-wallet behavior and real liquidity execution require later authorized testing. USD context is explicitly unavailable without a configured price source. The UI deliberately uses the requested dark theme; there is no theme switch or localization system.

The task's overriding write budget permits only `web/**`, `dist/**`, `docs/**`, and explicitly `web/.gitignore`. Consequently the requested root `DESIGN.md` is delivered as `docs/DESIGN.md`; protected root files were not changed. `web/.gitignore` uses the explicit allowance to exclude nested frontend dependency/cache/test-output directories. There are no vendored npm archives or submodules.

## Attribution

Design/review guidance: Jakub Krehel's Better Interface (MIT, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`); documentation method: Paul Bakaus's Impeccable (Apache-2.0, `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`); Ethereum UX guidance: Austin Griffith's ethskills (MIT, `06ea4efa08076ff04f6ca4945ef4a2ca881115b0`). Retained licenses are under `docs/licenses/`. Runtime library and font notices ship in `dist/THIRD-PARTY.txt` from `web/public/THIRD-PARTY.txt`.

The router tuple layout was cross-checked against the primary [Uniswap calldata decoder](https://github.com/Uniswap/v4-periphery/blob/main/src/libraries/CalldataDecoder.sol) and [Universal Router command reference](https://developers.uniswap.org/docs/protocols/universal-router/concepts/commands). The supplied network metadata controls which deployed tuple variant is used.
