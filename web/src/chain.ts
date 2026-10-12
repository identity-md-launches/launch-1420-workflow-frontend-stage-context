import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";
import type { Runtime } from "./config";
import type { Drone } from "./domain";
import { erc20Abi, poolAbi, poolKeyType } from "./protocol";
export type Snapshot = {
  total: bigint;
  totalStaked: bigint;
  drones: Drone[];
  own?: Drone;
  balance: bigint;
  allowance: bigint;
  nativeBalance: bigint;
  decimals: number;
  symbol: string;
  block: bigint;
  timestamp: number;
  verified: boolean;
  swapVerified: boolean;
  swapIssue?: string;
  loadedAt: number;
};
export async function verifyContracts(
  runtime: Runtime,
  client: PublicClient = runtime.client,
) {
  if ((await client.getChainId()) !== runtime.manifest.chainId)
    throw new Error(
      "The RPC returned the wrong network. Transactions are disabled.",
    );
  await Promise.all(
    runtime.manifest.contracts.map(async (contract) => {
      const code = await client.getBytecode({ address: contract.address });
      if (!code || code === "0x")
        throw new Error(
          `${contract.name} has no deployed code on this network. Transactions are disabled.`,
        );
    }),
  );
  const bound = (await client.readContract({
    address: runtime.drone.address,
    abi: runtime.abis.PulseDrone,
    functionName: "pulseToken",
  })) as Address;
  if (bound.toLowerCase() !== runtime.token.address.toLowerCase())
    throw new Error(
      "The Drone contract is bound to a different token. Transactions are disabled.",
    );
}
export async function verifyPool(
  runtime: Runtime,
  client: PublicClient = runtime.client,
) {
  const { poolKey, network } = runtime.manifest;
  const protocol = network.uniswapV4;
  if (!poolKey || !protocol)
    throw new Error(
      "A vetted pool is not configured. Swapping is unavailable.",
    );
  if (BigInt(poolKey.currency0) >= BigInt(poolKey.currency1))
    throw new Error("The attested pool currencies are not sorted.");
  if (
    ![
      poolKey.currency0.toLowerCase(),
      poolKey.currency1.toLowerCase(),
    ].includes(runtime.token.address.toLowerCase())
  )
    throw new Error("The attested pool does not contain PULSE.");
  const addresses = [
    protocol.poolManager,
    protocol.universalRouter,
    protocol.quoter,
    protocol.stateView,
    protocol.permit2,
    poolKey.hooks,
    poolKey.currency0,
    poolKey.currency1,
  ].filter((a) => a !== zeroAddress);
  await Promise.all(
    [...new Set(addresses)].map(async (address) => {
      const code = await client.getBytecode({ address });
      if (!code || code === "0x")
        throw new Error(
          "The pool or its swap contracts could not be verified. Swapping is unavailable.",
        );
    }),
  );
  const poolId = keccak256(
    encodeAbiParameters(parseAbiParameters(poolKeyType), [poolKey]),
  );
  const state = await client.readContract({
    address: protocol.stateView,
    abi: poolAbi,
    functionName: "getSlot0",
    args: [poolId],
  });
  if (state[0] === 0n)
    throw new Error(
      "The pool is not initialized yet. Swapping is unavailable.",
    );
}
export async function readSnapshot(
  runtime: Runtime,
  account: Address | undefined,
  onProgress: (loaded: number, total: number) => void,
  client: PublicClient = runtime.client,
): Promise<Snapshot> {
  await verifyContracts(runtime, client);
  const block = await client.getBlock();
  const call = (functionName: string, args?: readonly unknown[]) =>
    client.readContract({
      address: runtime.drone.address,
      abi: runtime.abis.PulseDrone,
      functionName,
      args,
      blockNumber: block.number,
    });
  const [
    total,
    totalStaked,
    decimals,
    symbol,
    balance,
    allowance,
    nativeBalance,
    ownId,
  ] = await Promise.all([
    call("totalMinted") as Promise<bigint>,
    call("totalStaked") as Promise<bigint>,
    client.readContract({
      address: runtime.token.address,
      abi: runtime.abis.LaunchToken,
      functionName: "decimals",
      blockNumber: block.number,
    }) as Promise<number>,
    client.readContract({
      address: runtime.token.address,
      abi: runtime.abis.LaunchToken,
      functionName: "symbol",
      blockNumber: block.number,
    }) as Promise<string>,
    account
      ? (client.readContract({
          address: runtime.token.address,
          abi: runtime.abis.LaunchToken,
          functionName: "balanceOf",
          args: [account],
          blockNumber: block.number,
        }) as Promise<bigint>)
      : 0n,
    account
      ? (client.readContract({
          address: runtime.token.address,
          abi: runtime.abis.LaunchToken,
          functionName: "allowance",
          args: [account, runtime.drone.address],
          blockNumber: block.number,
        }) as Promise<bigint>)
      : 0n,
    account
      ? client.getBalance({ address: account, blockNumber: block.number })
      : 0n,
    account ? (call("droneOf", [account]) as Promise<bigint>) : 0n,
  ]);
  if (total > 4096n || decimals !== 18 || symbol !== "PULSE")
    throw new Error(
      "Contract state does not match this deployment. Transactions are disabled.",
    );
  const drones: Drone[] = [];
  onProgress(0, Number(total));
  // Small pinned-block batches bound RPC payload size; no partial list is labeled global.
  for (let start = 1n; start <= total; start += 128n) {
    const batch = (await call("getDrones", [start, 128n])) as Drone[];
    drones.push(...batch);
    onProgress(drones.length, Number(total));
  }
  if (drones.length !== Number(total))
    throw new Error("The Hive snapshot is incomplete. Refresh to retry.");
  const own =
    ownId > 0n ? ((await call("stateOf", [ownId])) as Drone) : undefined;
  let swapVerified = false;
  let swapIssue: string | undefined;
  try {
    await verifyPool(runtime, client);
    swapVerified = true;
  } catch (error) {
    swapIssue =
      error instanceof Error ? error.message : "Pool verification failed.";
  }
  return {
    total,
    totalStaked,
    drones,
    own,
    balance,
    allowance,
    nativeBalance,
    decimals,
    symbol,
    block: block.number,
    timestamp: Number(block.timestamp),
    verified: true,
    swapVerified,
    swapIssue,
    loadedAt: Date.now(),
  };
}
export async function readPair(
  runtime: Runtime,
  account?: Address,
  client: PublicClient = runtime.client,
) {
  const key = runtime.manifest.poolKey;
  if (!key) throw new Error("No pool is configured.");
  const address =
    key.currency0.toLowerCase() === runtime.token.address.toLowerCase()
      ? key.currency1
      : key.currency0;
  if (address === zeroAddress)
    return {
      address,
      ...runtime.manifest.network.nativeCurrency,
      balance: account ? await client.getBalance({ address: account }) : 0n,
    };
  const match = [
    runtime.manifest.network.pairToken,
    ...(runtime.manifest.network.otherPairTokens ?? []),
  ].find((t) => t?.address.toLowerCase() === address.toLowerCase());
  if (!match)
    throw new Error(
      "The paired token is not in the vetted network configuration.",
    );
  const [decimals, symbol, balance] = await Promise.all([
    client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
    account
      ? client.readContract({
          address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        })
      : 0n,
  ]);
  if (decimals !== match.decimals || symbol !== match.symbol)
    throw new Error(
      "The paired token does not match the network configuration.",
    );
  return { ...match, balance };
}
