// Deterministic, in-memory wallet/RPC fixture. Never used by the production bundle.
import { readFileSync } from "node:fs";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  decodeAbiParameters,
  parseAbiParameters,
  toHex,
  zeroAddress,
} from "viem";
import {
  erc20Abi,
  permit2Abi,
  poolAbi,
  quoterAbi,
  routerAbi,
  poolKeyType,
} from "../src/protocol.ts";
export const manifest = JSON.parse(
  readFileSync(
    new URL("../../dist/imd-deployment.json", import.meta.url),
    "utf8",
  ),
);
const abis = Object.fromEntries(
  manifest.contracts.map((c) => [
    c.name,
    JSON.parse(
      readFileSync(new URL(`../../dist/${c.abiPath}`, import.meta.url), "utf8"),
    ),
  ]),
);
const token = manifest.contracts.find((c) => c.name === "LaunchToken").address;
const drone = manifest.contracts.find((c) => c.name === "PulseDrone").address;
const pair = manifest.network.pairToken.address;
const protocol = manifest.network.uniswapV4;
export const account = "0x1111111111111111111111111111111111111111";
export const otherAccount = "0x2222222222222222222222222222222222222222";
const recipient = "0x3333333333333333333333333333333333333333";
const hashOf = (n) => `0x${BigInt(n).toString(16).padStart(64, "0")}`;
const ONE = 10n ** 18n;
export function makeMock() {
  const state = {
    time: Math.floor(Date.now() / 1000),
    block: 20000000n,
    own: 0n,
    account,
    chainId: 1,
    needsAdd: false,
    calls: [],
    writes: [],
    drones: [],
    rejectNext: false,
    failSimulation: "",
    receiptHold: false,
    receipts: new Map(),
    allowance: new Map(),
    permit: new Map(),
    balance: 100000000n * ONE,
    pairBalance: 10000000n * ONE,
    offline: false,
    noCode: false,
    wrongBinding: false,
    maxSupply: false,
  };
  const makeDrone = (i, owner = otherAccount) => ({
    tokenId: BigInt(i),
    owner,
    seed: hashOf(i),
    caste: (i - 1) % 4,
    color: (i - 1) % 8,
    eyes: i % 6,
    alive: i % 3 !== 0,
    streak: BigInt(i * 7),
    bestStreak: BigInt(i * 8),
    totalBeats: BigInt(i * 9),
    lastBeatAt: BigInt(
      state.time - (i % 3 === 0 ? 180000 : i % 2 === 0 ? 165000 : 80000),
    ),
    staked: BigInt(i * 1000) * ONE,
    rank: 1,
  });
  state.populate = (count) => {
    state.drones = Array.from({ length: count }, (_, i) => makeDrone(i + 1));
    state.own = 0n;
  };
  state.populate(3);
  const key = (addr, spender) =>
    `${addr.toLowerCase()}|${spender.toLowerCase()}`;
  const abiFor = (address) =>
    address === token
      ? abis.LaunchToken
      : address === drone
        ? abis.PulseDrone
        : address === pair
          ? erc20Abi
          : address === protocol.permit2
            ? permit2Abi
            : address === protocol.quoter
              ? quoterAbi
              : address === protocol.stateView
                ? poolAbi
                : address === protocol.universalRouter
                  ? routerAbi
                  : null;
  const rank = (amount) =>
    amount >= 10000000n * ONE
      ? 4
      : amount >= 1000000n * ONE
        ? 3
        : amount >= 100000n * ONE
          ? 2
          : amount >= 1000n * ONE
            ? 1
            : 0;
  function contractCall(transaction, write = false) {
    const address = transaction.to.toLowerCase();
    const abi = abiFor(address);
    if (!abi) throw new Error(`Unhandled contract ${address}`);
    const decoded = decodeFunctionData({ abi, data: transaction.data });
    const { functionName, args = [] } = decoded;
    if (write)
      state.writes.push({
        address,
        functionName,
        args,
        value: BigInt(transaction.value ?? 0),
        data: transaction.data,
      });
    state.calls.push({
      method: "contract",
      address,
      functionName,
      args,
      write,
    });
    if (state.failSimulation === functionName && !write) {
      const data =
        functionName === "beat"
          ? encodeErrorResult({
              abi: abis.PulseDrone,
              errorName: "BeatTooSoon",
              args: [BigInt(state.time + 100)],
            })
          : encodeErrorResult({
              abi: routerAbi,
              errorName: "ExecutionFailed",
              args: [0n, "0x"],
            });
      throw { code: 3, message: "execution reverted", data };
    }
    let result;
    const own = state.drones.find((d) => d.tokenId === state.own);
    if (address === drone) {
      switch (functionName) {
        case "pulseToken":
          result = state.wrongBinding ? pair : token;
          break;
        case "totalMinted":
          result = BigInt(state.drones.length);
          break;
        case "totalStaked":
          result = state.drones.reduce((sum, d) => sum + d.staked, 0n);
          break;
        case "droneOf":
          result = args[0].toLowerCase() === account ? state.own : 0n;
          break;
        case "getDrones":
          result = state.drones
            .slice(Number(args[0]) - 1, Number(args[0]) - 1 + Number(args[1]))
            .map((d) => ({
              ...d,
              alive: state.time - Number(d.lastBeatAt) <= 172800,
            }));
          break;
        case "stateOf":
          result = {
            ...state.drones.find((d) => d.tokenId === args[0]),
            alive:
              state.time -
                Number(
                  state.drones.find((d) => d.tokenId === args[0]).lastBeatAt,
                ) <=
              172800,
          };
          break;
        case "tokenURI": {
          const d = state.drones.find((d) => d.tokenId === args[0]);
          const svg = readFileSync(
            new URL("../../docs/previews/alive.svg", import.meta.url),
            "utf8",
          )
            .replaceAll(
              "DRONE-0001",
              `DRONE-${String(d.tokenId).padStart(4, "0")}`,
            )
            .replaceAll(
              "Worker",
              ["Worker", "Scout", "Guard", "Builder"][d.caste],
            )
            .replace(
              "ALIVE / STREAK 30",
              `${state.time - Number(d.lastBeatAt) <= 172800 ? "ALIVE" : "DORMANT"} / STREAK ${d.streak}`,
            )
            .replace(
              /<g data-rank="[^"]+">[\s\S]*?<\/g>/,
              d.rank ? "<g/>" : "",
            );
          result = `data:application/json;base64,${Buffer.from(JSON.stringify({ name: `Drone ${args[0]}`, image: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` })).toString("base64")}`;
          break;
        }
        case "mint":
          result = BigInt(state.drones.length + 1);
          if (write) {
            state.own = result;
            state.drones.push({
              ...makeDrone(Number(result), account),
              lastBeatAt: BigInt(state.time),
              streak: 1n,
              bestStreak: 1n,
              totalBeats: 1n,
              staked: 0n,
              rank: 0,
              alive: true,
            });
          }
          break;
        case "beat":
          if (write) {
            own.streak =
              state.time - Number(own.lastBeatAt) <= 172800
                ? own.streak + 1n
                : 1n;
            own.bestStreak =
              own.streak > own.bestStreak ? own.streak : own.bestStreak;
            own.totalBeats++;
            own.lastBeatAt = BigInt(state.time);
            own.alive = true;
          }
          break;
        case "stake":
          if (write) {
            own.staked += args[0];
            own.rank = rank(own.staked);
            state.balance -= args[0];
            state.allowance.set(
              key(token, drone),
              (state.allowance.get(key(token, drone)) ?? 0n) - args[0],
            );
          }
          break;
        case "unstake":
          if (write) {
            own.staked -= args[0];
            own.rank = rank(own.staked);
            state.balance += args[0];
          }
          break;
        default:
          throw new Error(`Unhandled drone function ${functionName}`);
      }
    } else if (address === token || address === pair) {
      switch (functionName) {
        case "symbol":
          result = address === token ? "PULSE" : "IMD";
          break;
        case "decimals":
          result = 18;
          break;
        case "balanceOf":
          result = address === token ? state.balance : state.pairBalance;
          break;
        case "allowance":
          result = state.allowance.get(key(address, args[1])) ?? 0n;
          break;
        case "approve":
          result = true;
          if (write) state.allowance.set(key(address, args[0]), args[1]);
          break;
        case "transfer":
          result = true;
          if (write) state.balance -= args[1];
          break;
        default:
          throw new Error(`Unhandled token function ${functionName}`);
      }
    } else if (address === protocol.permit2) {
      if (functionName === "allowance") {
        const permit = state.permit.get(key(args[1], args[2])) ?? [0n, 0, 0];
        result = permit;
      } else if (functionName === "approve" && write)
        state.permit.set(key(args[0], args[1]), [args[2], args[3], 0]);
    } else if (address === protocol.stateView)
      result = [2n ** 96n, 0, 0, manifest.poolKey.fee];
    else if (address === protocol.quoter)
      result = [args[0].exactAmount * 2n, 90000n];
    else if (address === protocol.universalRouter) {
      if (args[0] !== "0x10") throw new Error("Wrong router command");
      const [actions, params] = decodeAbiParameters(
        parseAbiParameters("bytes,bytes[]"),
        args[1][0],
      );
      if (actions !== "0x060c0f") throw new Error("Wrong swap actions");
      const [[pool, direction, amountIn, minimum]] = decodeAbiParameters(
        parseAbiParameters(`(${poolKeyType},bool,uint128,uint128,bytes)`),
        params[0],
      );
      if (BigInt(params[0].slice(0, 66)) !== 32n)
        throw new Error("Missing dynamic tuple offset");
      if (
        pool.hooks.toLowerCase() !== manifest.poolKey.hooks ||
        pool.fee !== manifest.poolKey.fee ||
        minimum !== (amountIn * 2n * 9950n) / 10000n
      )
        throw new Error("Wrong hook, fee, or slippage");
      const input = direction
        ? pool.currency0.toLowerCase()
        : pool.currency1.toLowerCase();
      if (write) {
        if (input === token) {
          state.balance -= amountIn;
          state.pairBalance += amountIn * 2n;
        } else {
          state.pairBalance -= amountIn;
          state.balance += amountIn * 2n;
        }
        state.allowance.set(
          key(input, protocol.permit2),
          (state.allowance.get(key(input, protocol.permit2)) ?? 0n) - amountIn,
        );
        state.permit.set(key(input, protocol.universalRouter), [0n, 0, 0]);
      }
    }
    return encodeFunctionResult({ abi, functionName, result });
  }
  const block = () => ({
    number: toHex(state.block),
    timestamp: toHex(state.time),
    hash: hashOf(state.block),
    parentHash: hashOf(state.block - 1n),
    nonce: "0x0000000000000000",
    sha3Uncles: hashOf(0),
    logsBloom: `0x${"0".repeat(512)}`,
    transactionsRoot: hashOf(1),
    stateRoot: hashOf(2),
    receiptsRoot: hashOf(3),
    miner: zeroAddress,
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    size: "0x1",
    gasLimit: "0x1c9c380",
    gasUsed: "0x5208",
    baseFeePerGas: "0x1",
    mixHash: hashOf(4),
    transactions: [],
    uncles: [],
  });
  async function rpc({ method, params = [] }) {
    state.calls.push({ method, params });
    switch (method) {
      case "eth_chainId":
        return "0x1";
      case "eth_getCode":
        return state.noCode ? "0x" : "0x60006000f3";
      case "eth_getBlockByNumber":
        return block();
      case "eth_blockNumber":
        return toHex(++state.block);
      case "eth_getBalance":
        return toHex(100n * ONE);
      case "eth_call":
        return contractCall(params[0]);
      case "eth_getTransactionCount":
        return "0x1";
      case "eth_gasPrice":
        return "0x1";
      case "eth_estimateGas":
        return "0x186a0";
      case "eth_getTransactionReceipt":
        return state.receiptHold
          ? null
          : (state.receipts.get(params[0]) ?? null);
      case "eth_getTransactionByHash":
        return {
          hash: params[0],
          blockHash: hashOf(state.block),
          blockNumber: toHex(state.block),
          from: account,
          to: drone,
          value: "0x0",
          gas: "0x186a0",
          gasPrice: "0x1",
          input: "0x",
          nonce: "0x1",
          transactionIndex: "0x0",
          type: "0x0",
          v: "0x1b",
          r: hashOf(1),
          s: hashOf(1),
        };
      default:
        throw new Error(`Unhandled RPC ${method}`);
    }
  }
  async function walletRequest({ method, params = [] }) {
    state.calls.push({ method: `wallet:${method}`, params });
    if (
      state.rejectNext &&
      [
        "eth_requestAccounts",
        "eth_sendTransaction",
        "wallet_switchEthereumChain",
      ].includes(method)
    ) {
      state.rejectNext = false;
      throw { code: 4001, message: "User rejected the request." };
    }
    if (method === "eth_requestAccounts" || method === "eth_accounts")
      return [state.account];
    if (method === "eth_chainId") return toHex(state.chainId);
    if (method === "wallet_switchEthereumChain") {
      if (state.needsAdd) throw { code: 4902, message: "Unknown chain" };
      state.chainId = Number(params[0].chainId);
      return null;
    }
    if (method === "wallet_addEthereumChain") {
      state.needsAdd = false;
      return null;
    }
    if (method === "eth_sendTransaction") {
      contractCall(params[0], true);
      state.block++;
      const hash = hashOf(state.writes.length + 100);
      state.receipts.set(hash, {
        transactionHash: hash,
        transactionIndex: "0x0",
        blockHash: hashOf(state.block),
        blockNumber: toHex(state.block),
        from: account,
        to: params[0].to,
        cumulativeGasUsed: "0x5208",
        gasUsed: "0x5208",
        effectiveGasPrice: "0x1",
        contractAddress: null,
        logs: [],
        logsBloom: `0x${"0".repeat(512)}`,
        status: "0x1",
        type: "0x2",
      });
      return hash;
    }
    return rpc({ method, params });
  }
  return {
    state,
    rpc,
    walletRequest,
    account,
    otherAccount,
    recipient,
    token,
    drone,
    pair,
    protocol,
  };
}
export async function installMock(page, mock, wallet = true) {
  for (const url of manifest.network.rpcUrls)
    await page.route(`${url}/**`, async (route) => {
      if (mock.state.offline) {
        await route.abort("failed");
        return;
      }
      const input = route.request().postDataJSON();
      const handler = async (request) => {
        try {
          return {
            jsonrpc: "2.0",
            id: request.id,
            result: await mock.rpc(request),
          };
        } catch (e) {
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: { code: e.code ?? -32000, message: e.message, data: e.data },
          };
        }
      };
      const result = Array.isArray(input)
        ? await Promise.all(input.map(handler))
        : await handler(input);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(result),
      });
    });
  if (wallet) {
    await page.exposeFunction("mockWalletRequest", async (args) => {
      try {
        return { result: await mock.walletRequest(args) };
      } catch (e) {
        return { error: { code: e.code, message: e.message, data: e.data } };
      }
    });
    await page.addInitScript(() => {
      const listeners = {};
      window.ethereum = {
        request: async (args) => {
          const response = await window.mockWalletRequest(args);
          if (response.error)
            throw Object.assign(
              new Error(response.error.message),
              response.error,
            );
          return response.result;
        },
        on: (event, callback) => {
          (listeners[event] ??= []).push(callback);
        },
        removeListener: (event, callback) => {
          listeners[event] = (listeners[event] ?? []).filter(
            (c) => c !== callback,
          );
        },
      };
      window.walletTest = {
        emit: (event, data) =>
          (listeners[event] ?? []).forEach((cb) => cb(data)),
      };
    });
  }
}
