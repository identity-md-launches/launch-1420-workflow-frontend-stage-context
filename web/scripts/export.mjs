import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { keccak256, toBytes } from "viem";
import { canonical } from "../src/canonical.ts";
const root = fileURLToPath(new URL("../../", import.meta.url));
const out = path.join(root, "dist");
const read = async (p) =>
  JSON.parse(await readFile(path.join(root, p), "utf8"));
const handoff = await read("web/deployment/handoff.json");
const network = await read("web/deployment/network.json");
// When pinned inputs are available, compare the retained build inputs to them too.
for (const [pin, copy] of [
  ["deployment", handoff],
  ["network", network],
]) {
  try {
    assert.deepEqual(await read(`.imd/reads/${pin}.json`), copy);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
assert.equal(handoff.version, 1);
assert.equal(network.network.chainId, handoff.chainId);
assert.equal(Number(network.walletAddChain.chainId), handoff.chainId);
assert.match(handoff.sourceCommit, /^[0-9a-f]{40}$/);
assert.match(handoff.attestationHash, /^[0-9a-f]{64}$/);
const check = process.argv.includes("--check");
const contracts = [];
for (const contract of handoff.contracts) {
  assert.match(contract.name, /^[A-Za-z][A-Za-z0-9_]*$/);
  const bytes = execFileSync(
    "git",
    ["show", `${handoff.sourceCommit}:docs/abi/${contract.name}.json`],
    { cwd: root },
  );
  const abi = JSON.parse(bytes);
  assert.ok(Array.isArray(abi), "ABI must be a raw array");
  assert.equal(
    keccak256(toBytes(canonical(abi))).slice(2),
    contract.abiHash,
    `${contract.name} pinned ABI hash`,
  );
  const abiPath = `abi/${contract.name}.json`;
  if (!check) {
    await mkdir(path.join(out, "abi"), { recursive: true });
    await writeFile(path.join(out, abiPath), bytes);
  }
  assert.deepEqual(
    await readFile(path.join(out, abiPath)),
    bytes,
    "Export must preserve pinned ABI bytes",
  );
  contracts.push({
    name: contract.name,
    address: contract.address,
    abiHash: contract.abiHash,
    abiPath,
  });
}
const assets = [];
let total = 0;
async function walk(dir = "") {
  for (const name of (await readdir(path.join(out, dir))).sort()) {
    const relative = path.posix.join(dir, name);
    const info = await stat(path.join(out, relative));
    if (info.isDirectory()) {
      await walk(relative);
      continue;
    }
    if (relative === "imd-deployment.json") continue;
    assert.ok(info.size <= 8388608);
    assert.ok(!relative.includes("..") && !relative.includes("node_modules"));
    total += info.size;
    assets.push({
      path: relative,
      sha256: createHash("sha256")
        .update(await readFile(path.join(out, relative)))
        .digest("hex"),
    });
  }
}
await walk();
assert.ok(assets.length <= 128 && total < 24 * 1024 * 1024);
assert.ok(assets.some((a) => a.path === "index.html"));
const manifest = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts,
  assets,
  ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}),
  network: network.network,
  ...(network.walletAddChain ? { walletAddChain: network.walletAddChain } : {}),
};
if (check)
  assert.deepEqual(
    await read("dist/imd-deployment.json"),
    manifest,
    "Manifest differs from final assets or handoff",
  );
else
  await writeFile(
    path.join(out, "imd-deployment.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
console.log(
  `${check ? "Verified" : "Exported"} ${contracts.length} pinned ABIs, ${assets.length} assets, ${total.toLocaleString()} asset bytes; exact handoff/network/pool key and all hashes match.`,
);
