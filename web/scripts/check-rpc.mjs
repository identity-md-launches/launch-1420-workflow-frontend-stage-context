import { readFile, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  http,
  fallback,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
import { poolAbi, poolKeyType, erc20Abi } from "../src/protocol.ts";
const manifest = JSON.parse(
  await readFile(new URL("../../dist/imd-deployment.json", import.meta.url)),
);
const client = createPublicClient({
  transport: fallback(
    manifest.network.rpcUrls.map((url) =>
      http(url, { timeout: 15000, retryCount: 0 }),
    ),
    { rank: false },
  ),
});
const report = {
  checkedAt: new Date().toISOString(),
  mode: "read-only; no wallet or transactions",
  expectedChainId: manifest.chainId,
  actualChainId: await client.getChainId(),
  contracts: [],
};
for (const contract of manifest.contracts) {
  const code = await client.getBytecode({ address: contract.address });
  const abi = JSON.parse(
    await readFile(new URL(`../../dist/${contract.abiPath}`, import.meta.url)),
  );
  const state = {};
  for (const functionName of contract.name === "PulseDrone"
    ? ["pulseToken", "totalMinted", "totalStaked"]
    : ["name", "symbol", "decimals", "totalSupply"])
    state[functionName] = await client.readContract({
      address: contract.address,
      abi,
      functionName,
    });
  report.contracts.push({
    name: contract.name,
    address: contract.address,
    codeBytes: code ? (code.length - 2) / 2 : 0,
    state,
  });
}
report.protocol = [];
for (const [name, address] of Object.entries(manifest.network.uniswapV4).filter(
  ([, a]) => typeof a === "string",
)) {
  const code = await client.getBytecode({ address });
  report.protocol.push({
    name,
    address,
    codeBytes: code ? (code.length - 2) / 2 : 0,
  });
}
const id = keccak256(
  encodeAbiParameters(parseAbiParameters(poolKeyType), [manifest.poolKey]),
);
report.poolId = id;
report.poolSlot0 = await client.readContract({
  address: manifest.network.uniswapV4.stateView,
  abi: poolAbi,
  functionName: "getSlot0",
  args: [id],
});
report.pairToken = {
  symbol: await client.readContract({
    address: manifest.network.pairToken.address,
    abi: erc20Abi,
    functionName: "symbol",
  }),
  decimals: await client.readContract({
    address: manifest.network.pairToken.address,
    abi: erc20Abi,
    functionName: "decimals",
  }),
};
const block = await client.getBlock();
report.blockNumber = block.number;
report.blockTimestamp = block.timestamp;
if (
  report.actualChainId !== manifest.chainId ||
  report.contracts.some((c) => c.codeBytes === 0) ||
  report.protocol.some((c) => c.codeBytes === 0)
)
  throw new Error("RPC deployment check failed");
const json =
  JSON.stringify(
    report,
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  ) + "\n";
await writeFile(
  new URL("../../docs/frontend/rpc-validation.json", import.meta.url),
  json,
);
console.log(json);
