import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  type Abi,
  type Address,
  type Hash,
  type PublicClient,
} from "viem";
import { loadDeployment, type Runtime } from "./config";
import { errorMessage } from "./domain";
import { readSnapshot, type Snapshot } from "./chain";
import { useWallet } from "./wallet";
export type TxState = {
  phase: "simulating" | "wallet" | "pending" | "success" | "error";
  message: string;
  hash?: Hash;
  account?: Address;
  canCheck?: boolean;
};
export type Write = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};
function usePulseState() {
  const wallet = useWallet();
  const [runtime, setRuntime] = useState<Runtime>();
  const [configError, setConfigError] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [readError, setReadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [client, setClient] = useState<PublicClient>();
  const [source, setSource] = useState("Public RPC");
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [txs, setTxs] = useState<Record<string, TxState>>({});
  const [locked, setLocked] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const inflight = useRef(false);
  const snapshotRef = useRef<Snapshot | undefined>(undefined);
  const accountRef = useRef(wallet.account);
  accountRef.current = wallet.account;
  useEffect(() => {
    let active = true;
    loadDeployment()
      .then((r) => {
        if (active) {
          setRuntime(r);
          setClient(r.client);
        }
      })
      .catch((e) => active && setConfigError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, []);
  const refresh = useCallback(
    async (mode: "full" | "poll" = "full") => {
      if (!runtime || inflight.current) return;
      inflight.current = true;
      const ticket = generation.current;
      setLoading(true);
      try {
        const data = await readSnapshot(
          runtime,
          wallet.account,
          (loaded, total) =>
            ticket === generation.current && setProgress({ loaded, total }),
          client ?? runtime.client,
          mode === "poll" ? snapshotRef.current : undefined,
        );
        if (
          ticket === generation.current &&
          wallet.account === accountRef.current
        ) {
          snapshotRef.current = data;
          setSnapshot(data);
          setNow(data.timestamp);
          setReadError("");
        }
      } catch (error) {
        if (ticket === generation.current) {
          snapshotRef.current = undefined;
          setReadError(errorMessage(error));
        }
      } finally {
        inflight.current = false;
        if (ticket === generation.current) setLoading(false);
      }
    },
    [runtime, wallet.account, client],
  );
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    generation.current++;
    snapshotRef.current = undefined;
    setSnapshot(undefined);
    setReadError("");
    setLoading(false);
    // Cancel the result of a previous account's read; retry as soon as it finishes.
    const retry = window.setInterval(() => {
      if (!inflight.current) {
        clearInterval(retry);
        void refresh();
      }
    }, 100);
    return () => {
      clearInterval(retry);
      generation.current++;
    };
  }, [refresh, wallet.chainId]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && !lock.current) void refresh("poll");
    }, 30000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const useWalletRpc = async () => {
    if (
      !runtime ||
      !wallet.provider ||
      wallet.chainId !== runtime.manifest.chainId
    )
      return;
    const provider = wallet.provider;
    const transport = custom(
      {
        async request(args) {
          if (
            Number(await provider.request({ method: "eth_chainId" })) !==
            runtime.manifest.chainId
          )
            throw new Error(
              "Switch back to the configured network to use wallet reads.",
            );
          return provider.request(
            args as Parameters<typeof provider.request>[0],
          );
        },
      },
      { retryCount: 0 },
    );
    setClient(createPublicClient({ chain: runtime.chain, transport }));
    setSource("Wallet RPC");
  };
  const usePublicRpc = () => {
    if (runtime) {
      setClient(runtime.client);
      setSource("Public RPC");
    }
  };
  const safe =
    !!runtime &&
    !!snapshot?.verified &&
    !readError &&
    !!wallet.account &&
    wallet.chainId === runtime.manifest.chainId &&
    Date.now() - snapshot.loadedAt < 90000;
  const setTx = (id: string, tx: TxState) =>
    setTxs((prev) => ({
      ...prev,
      [id]: { ...tx, account: tx.account ?? prev[id]?.account },
    }));
  const write = async (
    id: string,
    label: string,
    request: Write,
  ): Promise<boolean> => {
    if (
      lock.current ||
      !safe ||
      !runtime ||
      !client ||
      !wallet.provider ||
      !wallet.account
    )
      return false;
    lock.current = true;
    setLocked(true);
    const provider = wallet.provider;
    const account = wallet.account;
    let hash: Hash | undefined;
    let confirmed = false;
    let replacementReason: string | undefined;
    try {
      const assertWallet = async () => {
        const [chain, accounts] = await Promise.all([
          provider.request({ method: "eth_chainId" }),
          provider.request({ method: "eth_accounts" }),
        ]);
        if (
          Number(chain) !== runtime.manifest.chainId ||
          accounts[0]?.toLowerCase() !== account.toLowerCase() ||
          accountRef.current !== account
        )
          throw new Error(
            "Wallet account or network changed. Review the action and try again.",
          );
      };
      setTx(id, {
        phase: "simulating",
        account,
        message: `Checking ${label.toLowerCase()}…`,
      });
      await assertWallet();
      const simulation = await client.simulateContract({
        ...request,
        account,
        chain: runtime.chain,
      });
      await assertWallet();
      setTx(id, {
        phase: "wallet",
        message: `Confirm ${label.toLowerCase()} in your wallet. A network fee applies.`,
      });
      hash = await createWalletClient({
        account,
        chain: runtime.chain,
        transport: custom(provider),
      }).writeContract(simulation.request);
      setTx(id, {
        phase: "pending",
        message: `${label} submitted. Waiting for confirmation…`,
        hash,
      });
      const receipt = await client.waitForTransactionReceipt({
        hash,
        timeout: 180000,
        onReplaced: (replacement) => {
          replacementReason = replacement.reason;
          hash = replacement.transaction.hash;
          setTx(id, {
            phase: "pending",
            message: "Following the replacement transaction…",
            hash,
          });
        },
      });
      confirmed = true;
      if (replacementReason && replacementReason !== "repriced")
        throw new Error(
          "This transaction was cancelled or replaced in your wallet. Review its explorer record and refresh your state.",
        );
      if (receipt.status !== "success")
        throw new Error(
          `${label} reverted onchain. The network fee may still have been charged.`,
        );
      // Refresh allowances and ownership before unlocking subsequent actions.
      while (inflight.current)
        await new Promise((resolve) => setTimeout(resolve, 100));
      await refreshRef.current();
      setTx(id, { phase: "success", message: `${label} confirmed.`, hash });
      return true;
    } catch (error) {
      if (hash && !confirmed)
        setTx(id, {
          phase: "pending",
          message:
            "Confirmation could not be checked. Do not submit again. Check the transaction status below.",
          canCheck: true,
          hash,
        });
      else setTx(id, { phase: "error", message: errorMessage(error), hash });
      return false;
    } finally {
      if (!hash || confirmed) {
        lock.current = false;
        setLocked(false);
      }
    }
  };
  const checkPending = async (id: string) => {
    const tx = txs[id];
    if (!tx?.hash || !tx.canCheck || !client) return;
    try {
      const receipt = await client.getTransactionReceipt({ hash: tx.hash });
      while (inflight.current)
        await new Promise((resolve) => setTimeout(resolve, 100));
      await refreshRef.current();
      setTx(id, {
        phase: receipt.status === "success" ? "success" : "error",
        message:
          receipt.status === "success"
            ? "Transaction confirmed. Review the refreshed state before continuing."
            : "Transaction reverted. No contract changes were applied.",
        hash: tx.hash,
      });
      lock.current = false;
      setLocked(false);
    } catch {
      setTx(id, {
        ...tx,
        message:
          "Still awaiting confirmation. Check again or open the explorer.",
      });
    }
  };
  return {
    wallet,
    runtime,
    client,
    configError,
    snapshot,
    readError,
    loading,
    progress,
    source,
    now,
    refresh,
    useWalletRpc,
    usePublicRpc,
    safe,
    txs,
    locked,
    write,
    checkPending,
  };
}
type PulseState = ReturnType<typeof usePulseState>;
const Context = createContext<PulseState | null>(null);
export function PulseProvider({ children }: { children: ReactNode }) {
  return (
    <Context.Provider value={usePulseState()}>{children}</Context.Provider>
  );
}
export function usePulse() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing application context");
  return value;
}
