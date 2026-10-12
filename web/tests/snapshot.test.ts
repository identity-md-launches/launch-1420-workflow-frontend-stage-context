import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPublicClient, custom, defineChain, type Abi } from "viem";
import { readSnapshot } from "../src/chain";
import type { Runtime } from "../src/config";
import { makeMock, manifest, account, otherAccount } from "./mock-rpc.mjs";
function fixture(count = 4096) {
  const mock = makeMock();
  mock.state.populate(count);
  let reorg = false;
  let wrongChain = false;
  const client = createPublicClient({
    transport: custom({
      async request(request) {
        const result = await mock.rpc(request);
        if (request.method === "eth_chainId" && wrongChain) return "0x2";
        if (request.method === "eth_getBlockByNumber" && reorg)
          return { ...result, hash: `0x${"ab".repeat(32)}` };
        return result;
      },
    }),
  });
  const chain = defineChain({
    id: manifest.chainId,
    name: manifest.network.name,
    nativeCurrency: manifest.network.nativeCurrency,
    rpcUrls: { default: { http: manifest.network.rpcUrls } },
  });
  const runtime: Runtime = {
    manifest,
    abis: Object.fromEntries(
      manifest.contracts.map((c) => [
        c.name,
        JSON.parse(
          readFileSync(
            new URL(`../../dist/${c.abiPath}`, import.meta.url),
            "utf8",
          ),
        ) as Abi,
      ]),
    ),
    token: manifest.contracts.find((c) => c.name === "LaunchToken"),
    drone: manifest.contracts.find((c) => c.name === "PulseDrone"),
    chain,
    client,
  };
  const reset = () => {
    mock.state.calls.length = 0;
  };
  const scans = () =>
    mock.state.calls.filter((c) => c.functionName === "getDrones").length;
  return {
    mock,
    runtime,
    reset,
    scans,
    reorg: () => {
      reorg = true;
    },
    wrongChain: () => {
      wrongChain = true;
    },
  };
}
const progress = () => {};
test("unchanged 4,096-Drone poll uses three public RPC requests and no Hive batches", async () => {
  const f = fixture();
  const initial = await readSnapshot(f.runtime, undefined, progress);
  assert.equal(f.scans(), 32);
  f.reset();
  const next = await readSnapshot(
    f.runtime,
    undefined,
    progress,
    f.runtime.client,
    initial,
  );
  assert.equal(f.scans(), 0);
  assert.equal(next.drones, initial.drones);
  assert.equal(
    f.mock.state.calls.filter((c) => c.method !== "contract").length,
    3,
  );
  assert.deepEqual(
    f.mock.state.calls
      .filter((c) => c.method !== "contract")
      .map((c) => c.method),
    ["eth_getBlockByNumber", "eth_call", "eth_chainId"],
  );
});
test("unchanged connected poll refreshes stateOf, balances and allowance without a Hive scan", async () => {
  const f = fixture();
  f.mock.state.own = 1n;
  const initial = await readSnapshot(f.runtime, account, progress);
  f.reset();
  // Changed fixture values prove these fields are read, not copied from the cache.
  f.mock.state.balance = 123n;
  f.mock.state.allowance.set(`${f.mock.token}|${f.mock.drone}`, 7n);
  f.mock.state.drones[0].totalBeats++;
  const next = await readSnapshot(
    f.runtime,
    account,
    progress,
    f.runtime.client,
    initial,
  );
  assert.equal(f.scans(), 0);
  assert.equal(next.balance, 123n);
  assert.equal(next.allowance, 7n);
  assert.equal(next.own?.totalBeats, initial.own!.totalBeats + 1n);
  for (const name of ["balanceOf", "allowance", "droneOf", "stateOf"])
    assert.ok(f.mock.state.calls.some((c) => c.functionName === name));
  assert.ok(f.mock.state.calls.some((c) => c.method === "eth_getBalance"));
});
test("manual refresh still performs all 32 batches at the same block", async () => {
  const f = fixture();
  await readSnapshot(f.runtime, undefined, progress);
  f.reset();
  await readSnapshot(f.runtime, undefined, progress);
  assert.equal(f.scans(), 32);
});
for (const change of [
  "new block",
  "supply",
  "reorg",
  "account",
  "unverified",
] as const) {
  test(`${change} invalidates the Hive cache`, async () => {
    const f = fixture(129);
    const initial = await readSnapshot(f.runtime, account, progress);
    f.reset();
    if (change === "new block") f.mock.state.block++;
    if (change === "supply") f.mock.state.populate(130);
    if (change === "reorg") f.reorg();
    if (change === "unverified") initial.verified = false;
    const next = await readSnapshot(
      f.runtime,
      change === "account" ? otherAccount : account,
      progress,
      f.runtime.client,
      initial,
    );
    assert.equal(f.scans(), 2);
    assert.equal(next.drones.length, change === "supply" ? 130 : 129);
  });
}
test("cached polling checks the RPC chain ID and fails closed", async () => {
  const f = fixture(1);
  const initial = await readSnapshot(f.runtime, undefined, progress);
  f.wrongChain();
  await assert.rejects(
    () =>
      readSnapshot(f.runtime, undefined, progress, f.runtime.client, initial),
    /wrong network/,
  );
});
