import { useCallback, useEffect, useState } from "react";
import {
  getAddress,
  numberToHex,
  type Address,
  type EIP1193Provider,
} from "viem";
import type { Deployment } from "./config";
import { errorMessage } from "./domain";
export type BrowserProvider = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => void;
};
type Wallet = { id: string; name: string; provider: BrowserProvider };
declare global {
  interface Window {
    ethereum?: BrowserProvider;
  }
}
export async function switchNetwork(
  provider: BrowserProvider,
  manifest: Deployment,
) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: numberToHex(manifest.chainId) }],
    });
  } catch (error) {
    const e = error as {
      code?: number;
      message?: string;
      data?: { originalError?: { code?: number } };
    };
    if (
      e.code !== 4902 &&
      e.data?.originalError?.code !== 4902 &&
      !/unknown chain|unrecognized chain|not added/i.test(e.message ?? "")
    )
      throw error;
    if (!manifest.walletAddChain)
      throw new Error(
        "Add this network in your wallet using the public configuration in About.",
      );
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [manifest.walletAddChain],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: numberToHex(manifest.chainId) }],
    });
  }
}
export function useWallet() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selected, setSelected] = useState("");
  const [provider, setProvider] = useState<BrowserProvider>();
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const announce = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          info: { uuid: string; name: string };
          provider: BrowserProvider;
        }>
      ).detail;
      if (!detail?.provider || !detail?.info) return;
      setWallets((prev) => {
        const announced = {
          id: detail.info.uuid,
          name: detail.info.name,
          provider: detail.provider,
        };
        const existing = prev.findIndex(
          (wallet) =>
            wallet.provider === detail.provider ||
            wallet.id === detail.info.uuid,
        );
        return existing < 0
          ? [...prev, announced]
          : prev.map((wallet, index) =>
              index === existing ? announced : wallet,
            );
      });
    };
    window.addEventListener("eip6963:announceProvider", announce);
    if (window.ethereum)
      setWallets([
        { id: "browser", name: "Browser wallet", provider: window.ethereum },
      ]);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () =>
      window.removeEventListener("eip6963:announceProvider", announce);
  }, []);
  useEffect(() => {
    if (!provider) return;
    const accountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setAccount(accounts.length ? getAddress(accounts[0]) : undefined);
      setError("");
    };
    const chainChanged = (...args: unknown[]) => setChainId(Number(args[0]));
    const disconnected = () => {
      setAccount(undefined);
      setChainId(undefined);
    };
    provider.on?.("accountsChanged", accountsChanged);
    provider.on?.("chainChanged", chainChanged);
    provider.on?.("disconnect", disconnected);
    return () => {
      provider.removeListener?.("accountsChanged", accountsChanged);
      provider.removeListener?.("chainChanged", chainChanged);
      provider.removeListener?.("disconnect", disconnected);
    };
  }, [provider]);
  const connect = useCallback(async () => {
    const wallet = wallets.find((w) => w.id === selected) ?? wallets[0];
    if (!wallet) {
      setError(
        "No browser wallet found. Open this site in a wallet browser or install a browser wallet, then reload.",
      );
      return;
    }
    setPending(true);
    setError("");
    try {
      const addresses = await wallet.provider.request({
        method: "eth_requestAccounts",
      });
      if (!addresses.length)
        throw new Error(
          "No wallet account was selected. Try connecting again.",
        );
      const chain = await wallet.provider.request({ method: "eth_chainId" });
      setProvider(wallet.provider);
      setChainId(Number(chain));
      setAccount(getAddress(addresses[0]));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }, [wallets, selected]);
  const switchChain = async (manifest: Deployment) => {
    if (!provider) return;
    setPending(true);
    setError("");
    try {
      await switchNetwork(provider, manifest);
      setChainId(Number(await provider.request({ method: "eth_chainId" })));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return {
    wallets,
    selected,
    setSelected,
    provider,
    account,
    chainId,
    pending,
    error,
    connect,
    switchChain,
    disconnect: () => {
      setAccount(undefined);
      setProvider(undefined);
      setChainId(undefined);
      setError("");
    },
  };
}
