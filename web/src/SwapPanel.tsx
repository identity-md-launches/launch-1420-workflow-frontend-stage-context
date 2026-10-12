import { useEffect, useRef, useState } from "react";
import { formatUnits, zeroAddress, type Address } from "viem";
import { usePulse } from "./store";
import { readPair } from "./chain";
import { amountOf, errorMessage, units } from "./domain";
import {
  erc20Abi,
  permit2Abi,
  quoterAbi,
  routerAbi,
  swapPayload,
} from "./protocol";
import { ActionButton, Gate, TxFeedback } from "./components";
type Quote = {
  amountIn: bigint;
  amountOut: bigint;
  minimum: bigint;
  created: number;
  key: string;
};
type Allowances = {
  erc20: bigint;
  permit: bigint;
  expiration: number;
  key: string;
};
export function SwapPanel() {
  const { runtime, snapshot, wallet, client, safe, now, write, locked } =
    usePulse();
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [pair, setPair] = useState<Awaited<ReturnType<typeof readPair>>>();
  const [pairError, setPairError] = useState("");
  const [quote, setQuote] = useState<Quote>();
  const [allowances, setAllowances] = useState<Allowances>();
  const [quoting, setQuoting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const preparingRef = useRef(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [allowanceRevision, setAllowanceRevision] = useState(0);
  const key = `${direction}|${amount}|${slippage}|${wallet.account}|${wallet.chainId}`;
  const currentKey = useRef(key);
  currentKey.current = key;
  const token = runtime
    ? {
        address: runtime.token.address,
        symbol: snapshot?.symbol ?? "PULSE",
        decimals: snapshot?.decimals ?? 18,
        balance: snapshot?.balance ?? 0n,
      }
    : undefined;
  const input = direction === "buy" ? pair : token;
  const output = direction === "buy" ? token : pair;
  const protocol = runtime?.manifest.network.uniswapV4;
  useEffect(() => {
    if (!runtime || !client || !snapshot?.swapVerified) return;
    let active = true;
    setPairError("");
    readPair(runtime, wallet.account, client)
      .then((value) => {
        if (active) setPair(value);
      })
      .catch((e) => {
        if (active) {
          setPair(undefined);
          setPairError(errorMessage(e));
        }
      });
    return () => {
      active = false;
    };
  }, [runtime, client, wallet.account, snapshot]);
  useEffect(() => {
    setQuote(undefined);
    setError("");
    setFieldError("");
  }, [key]);
  useEffect(() => {
    setAllowances(undefined);
    if (!wallet.account || !input || !protocol || !client || !safe) return;
    let active = true;
    const allowanceKey = `${input.address}|${wallet.account}`;
    if (input.address === zeroAddress) {
      setAllowances({
        erc20: 2n ** 256n - 1n,
        permit: 2n ** 160n - 1n,
        expiration: Number.MAX_SAFE_INTEGER,
        key: allowanceKey,
      });
      return;
    }
    Promise.all([
      client.readContract({
        address: input.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [wallet.account, protocol.permit2],
      }),
      client.readContract({
        address: protocol.permit2,
        abi: permit2Abi,
        functionName: "allowance",
        args: [wallet.account, input.address, protocol.universalRouter],
      }),
    ])
      .then(([erc20, permit]) => {
        if (active)
          setAllowances({
            erc20,
            permit: permit[0],
            expiration: permit[1],
            key: allowanceKey,
          });
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [
    wallet.account,
    input?.address,
    protocol,
    client,
    safe,
    snapshot?.block,
    allowanceRevision,
  ]);
  const getQuote = async () => {
    if (
      !runtime?.manifest.poolKey ||
      !input ||
      !output ||
      !protocol ||
      !client ||
      !safe ||
      !snapshot?.swapVerified
    )
      return;
    setError("");
    setFieldError("");
    setQuote(undefined);
    const ticket = key;
    let value: bigint;
    let bps: number;
    try {
      value = amountOf(amount, input.decimals);
      if (value >= 2n ** 128n)
        throw new Error("This amount is too large for a single swap.");
      if (value > input.balance)
        throw new Error(`This amount exceeds your ${input.symbol} balance.`);
      if (
        !/^\d+(\.\d{1,2})?$/.test(slippage) ||
        Number(slippage) < 0.1 ||
        Number(slippage) > 5
      )
        throw new Error(
          "Set slippage between 0.1% and 5%, with at most two decimal places.",
        );
      bps = Math.round(Number(slippage) * 100);
    } catch (e) {
      setFieldError(errorMessage(e));
      document.getElementById("swap-amount")?.focus();
      return;
    }
    setQuoting(true);
    try {
      const { result } = await client.simulateContract({
        address: protocol.quoter,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            poolKey: runtime.manifest.poolKey,
            zeroForOne:
              input.address.toLowerCase() ===
              runtime.manifest.poolKey.currency0.toLowerCase(),
            exactAmount: value,
            hookData: "0x",
          },
        ],
        account: wallet.account,
      });
      const minimum = (result[0] * BigInt(10000 - bps)) / 10000n;
      if (minimum <= 0n || minimum >= 2n ** 128n)
        throw new Error(
          "The quote has no usable output. Try another amount or wait for pool liquidity.",
        );
      if (currentKey.current === ticket) {
        setQuote({
          amountIn: value,
          amountOut: result[0],
          minimum,
          created: Date.now(),
          key: ticket,
        });
        setAllowanceRevision((n) => n + 1);
      }
    } catch (e) {
      if (currentKey.current === ticket) setError(errorMessage(e));
    } finally {
      setQuoting(false);
    }
  };
  const fresh = quote?.key === key && Date.now() - quote.created < 60000;
  const validAllowances =
    allowances?.key === `${input?.address}|${wallet.account}`;
  const stage =
    !quote || !validAllowances || !allowances
      ? "loading"
      : allowances.erc20 < quote.amountIn
        ? "token"
        : allowances.permit < quote.amountIn ||
            allowances.expiration <= now + 120
          ? "permit"
          : "swap";
  const id =
    stage === "token"
      ? "swap-token-approve"
      : stage === "permit"
        ? "swap-permit-approve"
        : "swap";
  const execute = async () => {
    if (
      preparingRef.current ||
      !runtime?.manifest.poolKey ||
      !protocol ||
      !input ||
      !quote ||
      !fresh ||
      !wallet.account ||
      !client ||
      !safe ||
      !snapshot?.swapVerified
    )
      return;
    preparingRef.current = true;
    setPreparing(true);
    setError("");
    try {
      // Read allowances again just before preparing any approval or swap.
      let ercAllowance = 2n ** 256n - 1n;
      let permitAllowance = 2n ** 160n - 1n;
      let expiry = Number.MAX_SAFE_INTEGER;
      if (input.address !== zeroAddress) {
        [ercAllowance, [permitAllowance, expiry]] = await Promise.all([
          client.readContract({
            address: input.address,
            abi: erc20Abi,
            functionName: "allowance",
            args: [wallet.account, protocol.permit2],
          }),
          client.readContract({
            address: protocol.permit2,
            abi: permit2Abi,
            functionName: "allowance",
            args: [wallet.account, input.address, protocol.universalRouter],
          }),
        ]);
      }
      if (
        quote.key !== currentKey.current ||
        Date.now() - quote.created >= 60000
      )
        throw new Error(
          "This quote expired or the input changed. Get a fresh quote.",
        );
      if (stage === "token" && ercAllowance < quote.amountIn) {
        await write(
          "swap-token-approve",
          `${input.symbol} approval to Permit2`,
          {
            address: input.address as Address,
            abi:
              input.address === runtime.token.address
                ? runtime.abis.LaunchToken
                : erc20Abi,
            functionName: "approve",
            args: [protocol.permit2, quote.amountIn],
          },
        );
      } else if (
        stage === "permit" &&
        ercAllowance >= quote.amountIn &&
        (permitAllowance < quote.amountIn || expiry <= now + 120)
      ) {
        await write("swap-permit-approve", "Router spending approval", {
          address: protocol.permit2,
          abi: permit2Abi,
          functionName: "approve",
          args: [
            input.address,
            protocol.universalRouter,
            quote.amountIn,
            now + 1800,
          ],
        });
      } else if (
        stage === "swap" &&
        ercAllowance >= quote.amountIn &&
        permitAllowance >= quote.amountIn &&
        expiry > now + 120
      ) {
        const payload = swapPayload(
          runtime.manifest.poolKey,
          input.address,
          quote.amountIn,
          quote.minimum,
          protocol.extendedSwapParams,
        );
        const ok = await write("swap", "Swap", {
          address: protocol.universalRouter,
          abi: routerAbi,
          functionName: "execute",
          args: [payload.commands, payload.inputs, BigInt(now + 1200)],
          value: payload.value,
        });
        if (ok) {
          setQuote(undefined);
          setAmount("");
        }
      } else
        setError(
          "Allowance changed. Review the updated step before continuing.",
        );
      setAllowanceRevision((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      preparingRef.current = false;
      setPreparing(false);
    }
  };
  const pairSymbol =
    pair?.symbol ??
    runtime?.manifest.network.pairToken?.symbol ??
    "paired token";
  return (
    <div className="panel" id="swap">
      <div className="card-heading">
        <span className="eyebrow">Fuel your next rank</span>
        <h3>Get PULSE.</h3>
        <p>
          Trade {pairSymbol} and PULSE in the launch’s Uniswap v4 pool. You’ll
          also need ETH for network fees.
        </p>
      </div>
      <div className="segmented" aria-label="Swap direction">
        <button
          disabled={locked || preparing}
          aria-pressed={direction === "buy"}
          onClick={() => setDirection("buy")}
        >
          Buy PULSE
        </button>
        <button
          disabled={locked || preparing}
          aria-pressed={direction === "sell"}
          onClick={() => setDirection("sell")}
        >
          Sell PULSE
        </button>
      </div>
      <label htmlFor="swap-amount">You pay</label>
      <div className="amount-field">
        <input
          disabled={locked || preparing}
          id="swap-amount"
          name="swap-amount"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          placeholder="0.00"
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={!!fieldError}
          aria-describedby="swap-field-error"
        />
        <span>{direction === "buy" ? pairSymbol : "PULSE"}</span>
      </div>
      <p className="small muted">
        Balance:{" "}
        {wallet.account && input ? units(input.balance, input.decimals) : "—"}{" "}
        {direction === "buy" ? pairSymbol : "PULSE"}
      </p>
      <div className="swap-arrow" aria-hidden="true">
        ↓
      </div>
      <div className="quote-output">
        <span className="small muted">You receive · estimated</span>
        <strong>
          {quote && output ? units(quote.amountOut, output.decimals, 6) : "—"}{" "}
          <span>{direction === "buy" ? "PULSE" : pairSymbol}</span>
        </strong>
      </div>
      <div className="slippage-row">
        <label htmlFor="slippage">Slippage tolerance</label>
        <div>
          <input
            disabled={locked || preparing}
            id="slippage"
            name="slippage"
            inputMode="decimal"
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            aria-describedby="swap-field-error"
          />
          <span>%</span>
        </div>
      </div>
      <p id="swap-field-error" role="alert" className="field-error">
        {fieldError}
      </p>
      {quote && output && input && (
        <div className="quote-detail">
          <div className="data-row">
            <span>Minimum received</span>
            <strong title={formatUnits(quote.minimum, output.decimals)}>
              {units(quote.minimum, output.decimals, 6)} {output.symbol}
            </strong>
          </div>
          <div className="data-row">
            <span>Exchange rate</span>
            <span>
              1 {input.symbol} ≈{" "}
              {units(
                (quote.amountOut * 10n ** BigInt(input.decimals)) /
                  quote.amountIn,
                output.decimals,
                6,
              )}{" "}
              {output.symbol}
            </span>
          </div>
          <div className="data-row">
            <span>Pool fee</span>
            <span>
              {runtime?.manifest.poolKey
                ? runtime.manifest.poolKey.fee / 10000
                : "—"}
              %
            </span>
          </div>
          <p className="small muted">
            {fresh
              ? `Quote expires in ${Math.max(0, Math.ceil((60000 - (Date.now() - quote.created)) / 1000))}s. Swap deadline: 20 minutes.`
              : "Quote expired. Refresh it before continuing."}
          </p>
        </div>
      )}
      <p className="field-error" role="alert">
        {error}
      </p>
      {!snapshot?.swapVerified && snapshot && (
        <p className="notice">{snapshot.swapIssue}</p>
      )}
      {pairError && <p className="notice">{pairError}</p>}
      <Gate>
        {!fresh ? (
          <button
            className="button primary"
            disabled={quoting || locked || !snapshot?.swapVerified || !pair}
            onClick={() => void getQuote()}
          >
            {quoting ? "Getting quote…" : quote ? "Refresh quote" : "Get quote"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        ) : (
          <>
            <ol className="swap-steps">
              <li className={stage === "token" ? "current" : ""}>
                Approve {input?.symbol} to Permit2
              </li>
              <li className={stage === "permit" ? "current" : ""}>
                Approve router spending · 30 minutes
              </li>
              <li className={stage === "swap" ? "current" : ""}>
                Simulate and confirm swap
              </li>
            </ol>
            {stage === "token" && (
              <p className="small muted">
                Allow Permit2 to spend exactly {amount} {input?.symbol}. This is
                a separate transaction.
              </p>
            )}
            {stage === "permit" && (
              <p className="small muted">
                Allow the configured Universal Router to use exactly {amount}{" "}
                {input?.symbol} through Permit2.
              </p>
            )}
            {stage === "swap" && (
              <p className="small muted">
                Spend {amount} {input?.symbol} for at least{" "}
                {units(quote!.minimum, output!.decimals, 6)} {output?.symbol}.
                The router will be simulated before signing.
              </p>
            )}
            <ActionButton
              id={id}
              label={
                preparing && !locked
                  ? "Checking swap step"
                  : stage === "token"
                    ? `Approve ${input?.symbol} to Permit2`
                    : stage === "permit"
                      ? "Approve router spending"
                      : stage === "loading"
                        ? "Checking allowances"
                        : "Confirm swap"
              }
              disabled={stage === "loading" || quoting || preparing}
              onClick={() => void execute()}
            />
            <button
              className="text-button"
              disabled={quoting || locked}
              onClick={() => void getQuote()}
            >
              Refresh quote
            </button>
          </>
        )}
      </Gate>
      <TxFeedback id="swap-token-approve" />
      <TxFeedback id="swap-permit-approve" />
      <TxFeedback id="swap" />
    </div>
  );
}
