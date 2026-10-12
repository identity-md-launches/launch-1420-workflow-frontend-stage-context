import {
  encodeAbiParameters,
  parseAbi,
  parseAbiParameters,
  zeroAddress,
  type Address,
} from "viem";
import type { PoolKey } from "./config";
// Protocol interfaces only. All protocol addresses come from the runtime manifest.
export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);
export const permit2Abi = parseAbi([
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
export const routerAbi = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
  "error ExecutionFailed(uint256 commandIndex,bytes message)",
  "error TransactionDeadlinePassed()",
]);
export const quoterAbi = parseAbi([
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
]);
export const poolAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)",
]);
export const poolKeyType =
  "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
export function swapPayload(
  poolKey: PoolKey,
  input: Address,
  amount: bigint,
  minimum: bigint,
  extended = false,
) {
  if (
    amount <= 0n ||
    amount >= 2n ** 128n ||
    minimum <= 0n ||
    minimum >= 2n ** 128n
  )
    throw new Error("Swap amount is outside the pool’s supported range.");
  const zeroForOne = input.toLowerCase() === poolKey.currency0.toLowerCase();
  if (!zeroForOne && input.toLowerCase() !== poolKey.currency1.toLowerCase())
    throw new Error("Input is outside the attested pool.");
  const output = zeroForOne ? poolKey.currency1 : poolKey.currency0;
  // Encode ONE dynamic struct; its leading offset word is required by V4Router.
  const params = extended
    ? encodeAbiParameters(
        parseAbiParameters(
          `(${poolKeyType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)`,
        ),
        [
          {
            poolKey,
            zeroForOne,
            amountIn: amount,
            amountOutMinimum: minimum,
            minHopPriceX36: 0n,
            hookData: "0x",
          },
        ],
      )
    : encodeAbiParameters(
        parseAbiParameters(
          `(${poolKeyType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`,
        ),
        [
          {
            poolKey,
            zeroForOne,
            amountIn: amount,
            amountOutMinimum: minimum,
            hookData: "0x",
          },
        ],
      );
  return {
    commands: "0x10" as const,
    inputs: [
      encodeAbiParameters(parseAbiParameters("bytes actions,bytes[] params"), [
        "0x060c0f",
        [
          params,
          encodeAbiParameters(parseAbiParameters("address,uint256"), [
            input,
            amount,
          ]),
          encodeAbiParameters(parseAbiParameters("address,uint256"), [
            output,
            minimum,
          ]),
        ],
      ]),
    ],
    value: input.toLowerCase() === zeroAddress ? amount : 0n,
  };
}
