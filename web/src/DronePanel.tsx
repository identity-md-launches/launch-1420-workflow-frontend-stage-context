import { useState } from "react";
import { formatUnits, getAddress, isAddress, zeroAddress } from "viem";
import { usePulse } from "./store";
import {
  amountOf,
  callSign,
  castes,
  countdown,
  errorMessage,
  rankProgress,
  ranks,
  timing,
  units,
} from "./domain";
import {
  ActionButton,
  AddressView,
  DroneArt,
  Gate,
  PulseMark,
  SectionHeading,
  TxFeedback,
} from "./components";
export function DronePanel({ paused }: { paused: boolean }) {
  const { snapshot, runtime, now, write } = usePulse();
  const own = snapshot?.own;
  const clock = own ? timing(own, now) : undefined;
  return (
    <section id="my-drone" className="section">
      <SectionHeading
        number="01"
        title="Your place in the swarm"
        text="One wallet. One Drone. A connection that stays with you."
      />
      <div className="personal-grid">
        <div className="panel drone-preview">
          {own ? (
            <DroneArt drone={own} paused={paused} />
          ) : (
            <div className="unminted">
              <div className="empty-hex">
                <PulseMark />
              </div>
              <p className="eyebrow">A signal waiting to begin</p>
              <h3>Your Drone awaits.</h3>
              <p>
                Mint to reveal its Caste, color, and eyes.
                <br />
                Every trait lives onchain.
              </p>
              <span className="tag">Soulbound · Yours forever</span>
            </div>
          )}
        </div>
        <div className="panel personal-details">
          {own && clock ? (
            <>
              <div className="row">
                <span className="eyebrow">{castes[own.caste]} caste</span>
                <span className={`status ${clock.alive ? "alive" : ""}`}>
                  <span aria-hidden="true">●</span>{" "}
                  {clock.alive ? "Alive" : "Dormant"}
                </span>
              </div>
              <h3 className="drone-title mono">{callSign(own.tokenId)}</h3>
              <div className="metrics">
                <div>
                  <strong>{own.streak.toString()}</strong>
                  <span>Current streak</span>
                </div>
                <div>
                  <strong>{own.bestStreak.toString()}</strong>
                  <span>Best streak</span>
                </div>
                <div>
                  <strong>{own.totalBeats.toString()}</strong>
                  <span>Total beats</span>
                </div>
              </div>
              <div className="data-row">
                <span>Hive rank</span>
                <strong>{ranks[own.rank]}</strong>
              </div>
              <div className="data-row">
                <span>Staked PULSE</span>
                <strong title={formatUnits(own.staked, 18)}>
                  {units(own.staked)}
                </strong>
              </div>
              <div
                className={`heartbeat-box ${clock.warning ? "warning" : ""}`}
              >
                <div className="row">
                  <span>
                    {clock.canBeat
                      ? "Your next heartbeat"
                      : "Next heartbeat in"}
                  </span>
                  <strong className="mono">
                    {clock.canBeat ? "Ready" : countdown(clock.cooldown)}
                  </strong>
                </div>
                <p>
                  {clock.warning
                    ? `Less than 6 hours left. Keep your streak alive with a beat. Dormant in ${countdown(clock.remaining)}.`
                    : clock.alive
                      ? `Dormant in ${countdown(clock.remaining)}. A beat renews your 48-hour window.`
                      : "Your Drone is dormant. Send a beat to wake it up and restart at a streak of 1."}
                </p>
                <Gate>
                  <ActionButton
                    id="beat"
                    label="Beat"
                    disabled={!clock.canBeat}
                    onClick={() => {
                      if (runtime)
                        void write("beat", "Heartbeat", {
                          address: runtime.drone.address,
                          abi: runtime.abis.PulseDrone,
                          functionName: "beat",
                        });
                    }}
                  />
                </Gate>
                <TxFeedback id="beat" />
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow">Begin your first heartbeat</p>
              <h3>Meet your onchain companion.</h3>
              <p>
                There are only 4,096 Drones. Mint yours for free and its first
                heartbeat starts immediately.
              </p>
              <ul className="feature-list">
                <li>
                  <span>01</span> A unique Caste and fully onchain artwork
                </li>
                <li>
                  <span>02</span> A permanent bond with your wallet
                </li>
                <li>
                  <span>03</span> A place on the Hive’s leaderboard
                </li>
              </ul>
              <div className="mint-action">
                <Gate>
                  <ActionButton
                    id="mint"
                    label={
                      snapshot?.total === 4096n
                        ? "All Drones minted"
                        : "Mint your Drone"
                    }
                    disabled={snapshot?.total === 4096n}
                    onClick={() => {
                      if (runtime)
                        void write("mint", "Mint", {
                          address: runtime.drone.address,
                          abi: runtime.abis.PulseDrone,
                          functionName: "mint",
                        });
                    }}
                  />
                </Gate>
                <p className="small muted">
                  Free mint · Ethereum network fee applies · No ETH sent to the
                  contract
                </p>
                <TxFeedback id="mint" />
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
export function StakePanel() {
  const { runtime, snapshot, write, locked } = usePulse();
  const [mode, setMode] = useState<"stake" | "unstake">("stake");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const own = snapshot?.own;
  const progress = rankProgress(own?.staked ?? 0n);
  let parsed = 0n;
  try {
    parsed = amountOf(amount, snapshot?.decimals ?? 18);
  } catch {
    /* Validated beside input on submission. */
  }
  const approval = mode === "stake" && parsed > (snapshot?.allowance ?? 0n);
  const actionId = approval ? "stake-approve" : mode;
  const submit = async () => {
    setError("");
    try {
      if (!runtime || !snapshot || !own) return;
      const value = amountOf(amount, snapshot.decimals);
      if (value > (mode === "stake" ? snapshot.balance : own.staked))
        throw new Error(
          `This amount exceeds your ${mode === "stake" ? "wallet" : "staked"} PULSE balance.`,
        );
      if (approval)
        await write("stake-approve", "PULSE approval", {
          address: runtime.token.address,
          abi: runtime.abis.LaunchToken,
          functionName: "approve",
          args: [runtime.drone.address, value],
        });
      else if (
        await write(mode, mode === "stake" ? "Stake" : "Unstake", {
          address: runtime.drone.address,
          abi: runtime.abis.PulseDrone,
          functionName: mode,
          args: [value],
        })
      )
        setAmount("");
    } catch (e) {
      setError(errorMessage(e));
      document.getElementById("stake-amount")?.focus();
    }
  };
  return (
    <div className="panel" id="stake">
      <div className="card-heading">
        <span className="eyebrow">Build your standing</span>
        <h3>Stake. Rise through the Hive.</h3>
        <p>
          Staking sets your rank. It pays no rewards, and you can unstake at any
          time—even while dormant.
        </p>
      </div>
      <div className="rank-summary">
        <div className="row">
          <span className="rank-icon" aria-hidden="true">
            ⬡
          </span>
          <div>
            <span className="small muted">Current rank</span>
            <strong>{progress.rank}</strong>
          </div>
          <strong className="mono">
            {units(own?.staked ?? 0n)} <span className="small">PULSE</span>
          </strong>
        </div>
        <progress
          aria-label="Progress to next Hive rank"
          value={progress.percent}
          max="100"
        />
        <p className="small muted">
          {progress.target
            ? `${units(progress.target - (own?.staked ?? 0n))} PULSE to ${progress.next}`
            : "Highest Hive rank reached."}
        </p>
      </div>
      <div className="segmented" aria-label="Staking action">
        <button
          disabled={locked}
          aria-pressed={mode === "stake"}
          onClick={() => {
            setMode("stake");
            setError("");
          }}
        >
          Stake
        </button>
        <button
          disabled={locked}
          aria-pressed={mode === "unstake"}
          onClick={() => {
            setMode("unstake");
            setError("");
          }}
        >
          Unstake
        </button>
      </div>
      <label htmlFor="stake-amount">
        {mode === "stake" ? "Stake amount" : "Unstake amount"}
      </label>
      <div className="amount-field">
        <input
          disabled={locked}
          id="stake-amount"
          name="stake-amount"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          placeholder="0.00"
          onChange={(e) => {
            setAmount(e.target.value);
            setError("");
          }}
          aria-invalid={!!error}
          aria-describedby="stake-error stake-hint"
        />
        <span>PULSE</span>
        <button
          className="text-button"
          onClick={() =>
            setAmount(
              formatUnits(
                mode === "stake"
                  ? (snapshot?.balance ?? 0n)
                  : (own?.staked ?? 0n),
                snapshot?.decimals ?? 18,
              ),
            )
          }
        >
          Max
        </button>
      </div>
      <p className="small muted" id="stake-hint">
        {mode === "stake" ? "Wallet balance" : "Available to unstake"}:{" "}
        {snapshot
          ? units(mode === "stake" ? snapshot.balance : (own?.staked ?? 0n))
          : "—"}{" "}
        PULSE
      </p>
      <p className="field-error" id="stake-error" role="alert">
        {error}
      </p>
      <Gate>
        {own ? (
          <>
            <p className="small muted">
              {approval
                ? `Step 1 of 2: allow PulseDrone to spend exactly ${amount || "0"} PULSE. Then confirm the stake separately.`
                : mode === "stake"
                  ? "Deposit PULSE into your Drone. This does not renew its heartbeat."
                  : "Return the entered PULSE amount to this wallet. Your rank may decrease."}
            </p>
            <ActionButton
              id={actionId}
              label={
                approval
                  ? "Approve PULSE for staking"
                  : mode === "stake"
                    ? "Stake PULSE"
                    : "Unstake PULSE"
              }
              onClick={() => void submit()}
            />
          </>
        ) : (
          <p className="notice">Mint your Drone above to start staking.</p>
        )}
      </Gate>
      <TxFeedback id="stake-approve" />
      <TxFeedback id="stake" />
      <TxFeedback id="unstake" />
      <details className="rank-guide">
        <summary>See all Hive ranks</summary>
        <dl>
          <div>
            <dt>Larva</dt>
            <dd>Under 1,000 PULSE</dd>
          </div>
          <div>
            <dt>Worker</dt>
            <dd>1,000 PULSE</dd>
          </div>
          <div>
            <dt>Guard</dt>
            <dd>100,000 PULSE</dd>
          </div>
          <div>
            <dt>Royal Guard</dt>
            <dd>1,000,000 PULSE</dd>
          </div>
          <div>
            <dt>Queen’s Guard</dt>
            <dd>10,000,000 PULSE</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
export function SendPulse() {
  const { runtime, snapshot, wallet, write, locked } = usePulse();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const validate = () => {
    if (
      !isAddress(recipient.trim()) ||
      recipient.trim().toLowerCase() === zeroAddress
    )
      throw new Error("Enter a valid nonzero Ethereum recipient address.");
    const value = amountOf(amount, snapshot?.decimals ?? 18);
    if (value > (snapshot?.balance ?? 0n))
      throw new Error("This amount exceeds your PULSE balance.");
    return value;
  };
  return (
    <details className="send-panel">
      <summary>Send PULSE to another wallet</summary>
      <p className="small muted">
        PULSE tokens can be transferred. Your soulbound Drone always stays in
        this wallet.
      </p>
      <label htmlFor="recipient">Recipient address</label>
      <input
        disabled={locked}
        id="recipient"
        name="recipient"
        autoComplete="off"
        spellCheck={false}
        value={recipient}
        onChange={(e) => {
          setRecipient(e.target.value);
          setReview(false);
          setError("");
        }}
        placeholder="Ethereum address"
        aria-invalid={!!error}
        aria-describedby="send-error"
      />
      <label htmlFor="send-amount">Amount in PULSE</label>
      <input
        disabled={locked}
        id="send-amount"
        name="send-amount"
        autoComplete="off"
        inputMode="decimal"
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value);
          setReview(false);
          setError("");
        }}
        placeholder="0.00"
      />
      <p id="send-error" role="alert" className="field-error">
        {error}
      </p>
      <Gate>
        {!review ? (
          <button
            className="button"
            onClick={() => {
              try {
                validate();
                setReview(true);
              } catch (e) {
                setError(errorMessage(e));
                document.getElementById("recipient")?.focus();
              }
            }}
          >
            Review transfer <span aria-hidden="true">↗</span>
          </button>
        ) : (
          <div className="notice">
            <p>
              Send <strong>{amount} PULSE</strong> from{" "}
              {wallet.account?.slice(0, 8)}… to:
            </p>
            <AddressView
              address={getAddress(recipient.trim())}
              label="Recipient"
            />
            <p className="small">
              Transfers are permanent. Check the full address before confirming.
            </p>
            <ActionButton
              id="send"
              label="Confirm PULSE transfer"
              onClick={() => {
                try {
                  const value = validate();
                  if (runtime)
                    void write("send", "PULSE transfer", {
                      address: runtime.token.address,
                      abi: runtime.abis.LaunchToken,
                      functionName: "transfer",
                      args: [getAddress(recipient.trim()), value],
                    }).then((ok) => {
                      if (ok) {
                        setReview(false);
                        setAmount("");
                      }
                    });
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            />
          </div>
        )}
      </Gate>
      <TxFeedback id="send" />
    </details>
  );
}
