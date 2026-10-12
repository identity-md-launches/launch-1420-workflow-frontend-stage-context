import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decodeAbiParameters,
  parseAbiParameters,
  zeroAddress,
  keccak256,
  toBytes,
} from "viem";
import {
  amountOf,
  timing,
  rankProgress,
  units,
  type Drone,
} from "../src/domain";
import { canonical } from "../src/canonical";
import { poolKeyType, swapPayload } from "../src/protocol";
import { safePath, type Deployment } from "../src/config";
import { switchNetwork, type BrowserProvider } from "../src/wallet";
const manifest = JSON.parse(
  readFileSync(
    new URL("../../dist/imd-deployment.json", import.meta.url),
    "utf8",
  ),
) as Deployment;
const base = { lastBeatAt: 100000n } as Drone;
test("exact 20-hour cooldown and inclusive 48-hour alive boundary", () => {
  assert.equal(timing(base, 171999).canBeat, false);
  assert.equal(timing(base, 172000).canBeat, true);
  assert.equal(timing(base, 272800).alive, true);
  assert.equal(timing(base, 272801).alive, false);
  assert.equal(timing(base, 251200).warning, false);
  assert.equal(timing(base, 251201).warning, true);
});
test("exact decimal amounts reject precision loss, notation, negative and zero values", () => {
  assert.equal(amountOf("1.000000000000000001", 18), 1000000000000000001n);
  for (const value of [
    "0",
    "-1",
    "1e18",
    ".1",
    "1.0000000000000000001",
    "NaN",
    "1,000",
  ])
    assert.throws(() => amountOf(value, 18));
  assert.equal(units(1n), "<0.0001");
});
test("rank boundaries and fractional progress preserve bigint precision", () => {
  assert.equal(rankProgress(999n * 10n ** 18n).rank, "Larva");
  assert.equal(rankProgress(1000n * 10n ** 18n).rank, "Worker");
  assert.equal(rankProgress(100000n * 10n ** 18n).rank, "Guard");
  assert.equal(rankProgress(1000000n * 10n ** 18n).rank, "Royal Guard");
  assert.equal(rankProgress(10000000n * 10n ** 18n).rank, "Queen’s Guard");
  assert.equal(rankProgress(10000000n * 10n ** 18n).percent, 100);
});
test("five- and six-field swap tuples encode the exact pool and both currency directions", () => {
  for (const extended of [false, true])
    for (const input of [
      manifest.poolKey!.currency0,
      manifest.poolKey!.currency1,
    ]) {
      const key = manifest.poolKey!;
      const payload = swapPayload(key, input, 1000n, 900n, extended);
      assert.equal(payload.commands, "0x10");
      assert.equal(payload.value, 0n);
      const [actions, params] = decodeAbiParameters(
        parseAbiParameters("bytes,bytes[]"),
        payload.inputs[0],
      );
      assert.equal(actions, "0x060c0f");
      const [decoded] = decodeAbiParameters(
        parseAbiParameters(
          `(${poolKeyType},bool,uint128,uint128,${extended ? "uint256," : ""}bytes)`,
        ),
        params[0],
      );
      // Independent wire-format assertions: dynamic tuple offset, body size and hookData offset.
      const words = params[0].slice(2).match(/.{64}/g)!;
      assert.equal(BigInt(`0x${words[0]}`), 32n);
      assert.equal(words.length, extended ? 12 : 11);
      assert.equal(
        BigInt(`0x${words[extended ? 10 : 9]}`),
        BigInt(extended ? 320 : 288),
      );
      assert.equal(BigInt(`0x${words.at(-1)}`), 0n);
      assert.deepEqual(
        Object.fromEntries(
          Object.entries(decoded[0]).map(([k, v]) => [
            k,
            typeof v === "string" ? v.toLowerCase() : v,
          ]),
        ),
        Object.fromEntries(
          Object.entries(key).map(([k, v]) => [
            k,
            typeof v === "string" ? v.toLowerCase() : v,
          ]),
        ),
      );
      assert.equal(decoded[1], input === key.currency0);
      assert.equal(decoded[2], 1000n);
      assert.equal(decoded[3], 900n);
      assert.equal(decoded[extended ? 5 : 4], "0x");
      if (extended) assert.equal(decoded[4], 0n);
      const [settle, amount] = decodeAbiParameters(
        parseAbiParameters("address,uint256"),
        params[1],
      );
      const [take, minimum] = decodeAbiParameters(
        parseAbiParameters("address,uint256"),
        params[2],
      );
      assert.equal(settle.toLowerCase(), input);
      assert.equal(amount, 1000n);
      assert.equal(
        take.toLowerCase(),
        input === key.currency0 ? key.currency1 : key.currency0,
      );
      assert.equal(minimum, 900n);
    }
});
test("native input sends value; token input sends none; invalid swap amounts fail", () => {
  const key = { ...manifest.poolKey!, currency0: zeroAddress };
  assert.equal(swapPayload(key, zeroAddress, 100n, 90n).value, 100n);
  assert.equal(swapPayload(key, key.currency1, 100n, 90n).value, 0n);
  assert.throws(() => swapPayload(key, key.currency1, 2n ** 128n, 90n));
  assert.throws(() => swapPayload(key, key.currency1, 100n, 0n));
});
test("unknown chain offers exact add-chain parameters then switches again", async () => {
  const requests: unknown[] = [];
  let count = 0;
  const provider = {
    async request(args: { method: string }) {
      requests.push(args);
      if (args.method === "wallet_switchEthereumChain" && count++ === 0)
        throw { code: 4902 };
    },
  } as unknown as BrowserProvider;
  await switchNetwork(provider, manifest);
  assert.deepEqual(requests, [
    { method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] },
    { method: "wallet_addEthereumChain", params: [manifest.walletAddChain] },
    { method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] },
  ]);
});
test("wallet rejection does not trigger add-chain", async () => {
  const requests: string[] = [];
  const provider = {
    async request(args: { method: string }) {
      requests.push(args.method);
      throw { code: 4001 };
    },
  } as unknown as BrowserProvider;
  await assert.rejects(() => switchNetwork(provider, manifest));
  assert.deepEqual(requests, ["wallet_switchEthereumChain"]);
});
test("pinned ABI hashes match canonical export; paths reject traversal and URLs", () => {
  for (const contract of manifest.contracts) {
    const abi = JSON.parse(
      readFileSync(
        new URL(`../../dist/${contract.abiPath}`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(keccak256(toBytes(canonical(abi))).slice(2), contract.abiHash);
  }
  for (const path of [
    "../abi/a.json",
    "/a.json",
    "https://example.com/a",
    "x/../../a",
    "x%2f.json",
  ])
    assert.equal(safePath(path), false);
  assert.equal(safePath("abi/PulseDrone.json"), true);
});
