import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  isAddress,
  keccak256,
  toBytes,
  type Abi,
  type Address,
} from "viem";
import { canonical } from "./canonical";
export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export type PairToken = {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
};
export type Deployment = {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  assets: { path: string; sha256: string }[];
  poolKey?: PoolKey;
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: string[];
    pairToken?: PairToken;
    otherPairTokens?: PairToken[];
    uniswapV4?: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
      extendedSwapParams?: boolean;
    };
  };
  walletAddChain?: {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
};
export function safePath(value: string) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("..") &&
    /^[a-zA-Z0-9_./-]+$/.test(value)
  );
}
export async function loadDeployment() {
  const response = await fetch("./imd-deployment.json", { cache: "no-cache" });
  if (!response.ok)
    throw new Error(
      "Deployment configuration could not load. Reload the page to retry.",
    );
  const manifest = (await response.json()) as Deployment;
  const keys = [
    "version",
    "launchId",
    "chainId",
    "sourceCommit",
    "attestationHash",
    "contracts",
    "assets",
    "poolKey",
    "network",
    "walletAddChain",
  ];
  if (
    Object.keys(manifest).some((k) => !keys.includes(k)) ||
    manifest.version !== 1 ||
    !manifest.network ||
    manifest.chainId !== manifest.network.chainId ||
    !Number.isSafeInteger(manifest.chainId)
  )
    throw new Error(
      "Deployment configuration is invalid. Transactions are unavailable.",
    );
  if (
    !manifest.network.rpcUrls.length ||
    manifest.network.rpcUrls.some((url) => !url.startsWith("https://"))
  )
    throw new Error("No valid public RPC is configured.");
  const abis: Record<string, Abi> = {};
  for (const entry of manifest.contracts) {
    if (!safePath(entry.abiPath) || !isAddress(entry.address))
      throw new Error("Invalid contract configuration.");
    const abiResponse = await fetch(`./${entry.abiPath}`);
    if (!abiResponse.ok)
      throw new Error(`Could not load ${entry.name} interface.`);
    const abi = await abiResponse.json();
    if (
      !Array.isArray(abi) ||
      keccak256(toBytes(canonical(abi))).slice(2) !== entry.abiHash
    )
      throw new Error(
        `${entry.name} interface verification failed. Transactions are unavailable.`,
      );
    abis[entry.name] = abi;
  }
  const token = manifest.contracts.find((c) => c.name === "LaunchToken");
  const drone = manifest.contracts.find((c) => c.name === "PulseDrone");
  if (!token || !drone) throw new Error("The PULSE deployment is incomplete.");
  const chain = defineChain({
    id: manifest.chainId,
    name: manifest.network.name,
    nativeCurrency: manifest.network.nativeCurrency,
    rpcUrls: { default: { http: manifest.network.rpcUrls } },
    blockExplorers: {
      default: { name: "Explorer", url: manifest.network.explorer },
    },
  });
  const client = createPublicClient({
    chain,
    transport: fallback(
      manifest.network.rpcUrls.map((url) =>
        http(url, { timeout: 12000, retryCount: 1 }),
      ),
      { rank: false, retryCount: 0 },
    ),
  });
  return { manifest, abis, token, drone, chain, client };
}
export type Runtime = Awaited<ReturnType<typeof loadDeployment>>;
