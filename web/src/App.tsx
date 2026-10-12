import { useEffect, useState } from "react";
import { usePulse } from "./store";
import { timing, units } from "./domain";
import {
  AddressView,
  ConnectButton,
  DroneIllustration,
  PulseMark,
  SectionHeading,
  TxFeedback,
} from "./components";
import { DronePanel, SendPulse, StakePanel } from "./DronePanel";
import { SwapPanel } from "./SwapPanel";
import { Hive } from "./Hive";
export default function App() {
  const {
    runtime,
    wallet,
    snapshot,
    configError,
    readError,
    loading,
    source,
    refresh,
    useWalletRpc,
    usePublicRpc,
    now,
    locked,
    txs,
  } = usePulse();
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const alive = snapshot?.drones.filter((d) => timing(d, now).alive);
  const longest = alive?.reduce(
    (best, d) => (d.streak > best ? d.streak : best),
    0n,
  );
  const wrongChain =
    wallet.account && runtime && wallet.chainId !== runtime.manifest.chainId;
  const frozenMotion = paused || reduced;
  return (
    <div className={frozenMotion ? "app motion-paused" : "app"}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="#" aria-label="PULSE home">
          <PulseMark />
          <span>
            PULSE<small>Keep the swarm alive</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#my-drone">My Drone</a>
          <a href="#stake">Stake & swap</a>
          <a href="#hive">The Hive</a>
          <a href="#about">About</a>
        </nav>
        <div className="wallet-control">
          {wallet.account ? (
            <>
              <AddressView
                address={wallet.account}
                label="Connected wallet"
                compact
              />
              <button
                className="text-button"
                disabled={locked}
                onClick={wallet.disconnect}
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              {wallet.wallets.length > 1 && (
                <select
                  aria-label="Choose browser wallet"
                  value={wallet.selected}
                  onChange={(e) => wallet.setSelected(e.target.value)}
                >
                  <option value="">Choose wallet</option>
                  {wallet.wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              )}
              <ConnectButton />
            </>
          )}
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="container">
          <div className="network-bar">
            <span className="small">
              <span
                className={`network-dot ${snapshot && !readError ? "ok" : ""}`}
                aria-hidden="true"
              />
              {runtime?.manifest.network.name ?? "Loading network"}{" "}
              <span className="muted">
                /{" "}
                {readError
                  ? "Connection interrupted"
                  : snapshot
                    ? "Onchain signal connected"
                    : "Connecting to the swarm"}
              </span>
            </span>
            <button
              className="text-button"
              onClick={() => void refresh()}
              disabled={loading || !runtime}
            >
              {loading ? "Refreshing…" : "Refresh data"}{" "}
              <span aria-hidden="true">↻</span>
            </button>
          </div>
          {configError && (
            <div role="alert" className="notice error">
              <strong>Deployment unavailable.</strong>
              <p>{configError}</p>
              <button className="button" onClick={() => location.reload()}>
                Reload page
              </button>
            </div>
          )}
          {wallet.error && (
            <div role="alert" className="notice error">
              {wallet.error}
            </div>
          )}
          {wrongChain && (
            <div className="notice network-warning" role="status">
              <div>
                <strong>Your wallet is on another network.</strong>
                <p>
                  Switch to {runtime.manifest.network.name} to use your Drone.
                  Transactions stay disabled until you switch.
                </p>
              </div>
              <button
                className="button primary"
                disabled={wallet.pending || locked}
                onClick={() => void wallet.switchChain(runtime.manifest)}
              >
                {wallet.pending
                  ? "Switching…"
                  : `Switch to ${runtime.manifest.network.name}`}
              </button>
            </div>
          )}
          {readError && (
            <div className="notice error" role="alert">
              <strong>Live data is unavailable.</strong>
              <p>
                {readError}{" "}
                {snapshot &&
                  "Displayed values are from the last successful snapshot."}
              </p>
              {source === "Wallet RPC" && (
                <button className="button" onClick={usePublicRpc}>
                  Use public RPC
                </button>
              )}
              {wallet.provider && !wrongChain && source !== "Wallet RPC" && (
                <button className="button" onClick={() => void useWalletRpc()}>
                  Try wallet RPC
                </button>
              )}
            </div>
          )}
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <p className="eyebrow">
                <span className="signal-dot" aria-hidden="true" /> Human
                heartbeat. Onchain life.
              </p>
              <h1 id="hero-title">
                The swarm never sleeps.
                <br />
                <span>Neither does your Drone.</span>
              </h1>
              <p>
                One small signal. A living connection.
                <br />
                Mint your soulbound Drone, keep its heartbeat going, and rise
                through the Hive.
              </p>
              <div className="hero-actions">
                <a href="#my-drone" className="button primary">
                  {snapshot?.own ? "Meet your Drone" : "Mint your Drone"}{" "}
                  <span aria-hidden="true">↗</span>
                </a>
                <a className="hero-link" href="#hive">
                  Explore the Hive <span aria-hidden="true">↓</span>
                </a>
              </div>
              <p className="hero-note mono">
                4,096 Drones · Free mint · Fully onchain
              </p>
            </div>
            <div className="hero-visual">
              <div className="visual-top">
                <span className="mono">PULSE / SPECIMEN 001</span>
                <span className="small">Illustration</span>
              </div>
              <DroneIllustration />
              <div className="visual-bottom">
                <span className="eyebrow">
                  A little life.
                  <br />A permanent connection.
                </span>
                <span className="mono">
                  20h / 48h
                  <br />
                  <small>Beat / Stay alive</small>
                </span>
              </div>
            </div>
            <svg
              className="heartbeat-line"
              viewBox="0 0 1200 60"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d="M0 32h160l10-8 10 8h110l12-12 12 12h145l13-10 14 10 12-30 18 56 17-34 13 8h210l12-7 12 7h315" />
            </svg>
          </section>
          <div className="stats-strip" aria-label="Live Hive statistics">
            <div>
              <span className="eyebrow">Drones minted</span>
              <strong>
                {snapshot ? snapshot.total.toLocaleString() : "—"}{" "}
                <small>/ 4,096</small>
              </strong>
            </div>
            <div>
              <span className="eyebrow">Drones alive now</span>
              <strong>
                {alive ? alive.length.toLocaleString() : "—"}{" "}
                <span className="signal-dot" aria-hidden="true" />
              </strong>
            </div>
            <div>
              <span className="eyebrow">Longest active streak</span>
              <strong>
                {longest?.toString() ?? "—"} <small>beats</small>
              </strong>
            </div>
            <div className="stats-caption">
              <span className="signal-glyph" aria-hidden="true">
                ⌁
              </span>
              <p>
                Every beat counts.
                <br />
                <span className="muted">Keep yours going.</span>
              </p>
            </div>
          </div>
          <div className="data-caption">
            <span>
              {snapshot
                ? `${source} · Block ${snapshot.block.toLocaleString()} · Snapshot ${new Date(snapshot.timestamp * 1000).toLocaleTimeString()} · Refreshes every 30s`
                : "Live counts will appear after a complete contract read."}
            </span>
            <button
              className="text-button"
              aria-pressed={paused}
              disabled={reduced}
              onClick={() => setPaused((p) => !p)}
            >
              {reduced
                ? "Reduced motion on"
                : paused
                  ? "Resume motion"
                  : "Pause motion"}
            </button>
          </div>
          <DronePanel paused={frozenMotion} />
          <section className="section" aria-label="Staking and swapping">
            <SectionHeading
              number="02"
              title="Keep growing"
              text="Your heartbeat keeps you alive. Your stake sets your rank."
            />
            <div className="finance-grid">
              <StakePanel />
              <SwapPanel />
            </div>
            <p className="usd-note">
              Amounts are shown in token units. USD context is unavailable: this
              deployment has no configured USD price source.
            </p>
            {wallet.account && (
              <div className="wallet-balances">
                <p>
                  <strong>Wallet balances</strong> ·{" "}
                  {snapshot ? units(snapshot.balance) : "—"} PULSE ·{" "}
                  {snapshot ? units(snapshot.nativeBalance, 18, 6) : "—"} ETH
                </p>
                <AddressView
                  address={wallet.account}
                  label="Connected wallet"
                />
                <SendPulse />
              </div>
            )}
          </section>
          <Hive paused={frozenMotion} />
          <section className="section about" id="about">
            <SectionHeading
              number="04"
              title="Built by the swarm. Kept alive by you."
              text="PULSE turns a small, repeated action into an onchain connection."
            />
            <div className="about-grid">
              <div>
                <p>
                  The IdentityMD contributor network brings agents together to
                  build, verify, and record their work onchain. PULSE gives you
                  your own part in that story: a Drone whose life follows your
                  rhythm.
                </p>
                <div className="rule-grid">
                  <div>
                    <span className="mono">20h</span>
                    <h3>Between beats</h3>
                    <p>Send your next heartbeat once the cooldown ends.</p>
                  </div>
                  <div>
                    <span className="mono">48h</span>
                    <h3>To stay alive</h3>
                    <p>
                      Miss the window and your Drone goes dormant. A new beat
                      wakes it up.
                    </p>
                  </div>
                  <div>
                    <span className="mono">∞</span>
                    <h3>Always yours</h3>
                    <p>Your Drone cannot be transferred, approved, or sold.</p>
                  </div>
                </div>
                <p className="small muted">
                  The token is fixed at deployment. There is no owner, pause
                  switch, upgrade, or withdrawal power over your staked PULSE.
                  Staking earns no rewards. A streak counts successful beats,
                  not calendar days.
                </p>
              </div>
              <div className="contract-panel">
                <p className="eyebrow">Onchain, in the open</p>
                <h3>Verify the signal.</h3>
                {runtime?.manifest.contracts.map((c) => (
                  <div className="contract-entry" key={c.name}>
                    <strong>
                      {c.name === "LaunchToken" ? "PULSE token" : "PulseDrone"}
                    </strong>
                    <AddressView address={c.address} label={c.name} />
                  </div>
                ))}
                <details>
                  <summary>Deployment details</summary>
                  <dl className="deployment-details">
                    <dt>Network</dt>
                    <dd>
                      {runtime?.manifest.network.name} · Chain{" "}
                      {runtime?.manifest.chainId}
                    </dd>
                    <dt>Source commit</dt>
                    <dd className="mono">{runtime?.manifest.sourceCommit}</dd>
                    <dt>Attestation</dt>
                    <dd className="mono">
                      {runtime?.manifest.attestationHash}
                    </dd>
                    <dt>Public RPCs</dt>
                    <dd>
                      {runtime?.manifest.network.rpcUrls.map((url) => (
                        <div key={url}>{url}</div>
                      ))}
                    </dd>
                  </dl>
                  <a
                    href="./imd-deployment.json"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open deployment manifest ↗
                  </a>
                </details>
              </div>
            </div>
          </section>
          {Object.keys(txs).length > 0 && (
            <section className="activity panel" aria-label="Wallet activity">
              <h2>Wallet activity</h2>
              <p className="small muted">
                Transaction links remain available if your wallet account
                changes.
              </p>
              {Object.keys(txs).map((id) => (
                <TxFeedback key={id} id={id} />
              ))}
            </section>
          )}
        </div>
      </main>
      <footer className="site-footer container">
        <a className="brand" href="#">
          <PulseMark small />
          <span>PULSE</span>
        </a>
        <span className="small muted">Keep the swarm alive.</span>
        <a href="./THIRD-PARTY.txt" target="_blank" rel="noreferrer">
          Credits & licenses ↗
        </a>
        <a href="#about">Built with IdentityMD ↗</a>
      </footer>
    </div>
  );
}
