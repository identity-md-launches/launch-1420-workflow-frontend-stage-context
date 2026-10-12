import {
  BaseError,
  ContractFunctionRevertedError,
  formatUnits,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
export type Drone = {
  tokenId: bigint;
  owner: Address;
  seed: Hex;
  caste: number;
  color: number;
  eyes: number;
  alive: boolean;
  streak: bigint;
  bestStreak: bigint;
  totalBeats: bigint;
  lastBeatAt: bigint;
  staked: bigint;
  rank: number;
};
export const castes = ["Worker", "Scout", "Guard", "Builder"];
export const ranks = [
  "Larva",
  "Worker",
  "Guard",
  "Royal Guard",
  "Queen’s Guard",
];
export const thresholds = [0n, 1000n, 100000n, 1000000n, 10000000n].map(
  (v) => v * 10n ** 18n,
);
export const callSign = (id: bigint) =>
  `DRONE-${id.toString().padStart(4, "0")}`;
export function amountOf(text: string, decimals: number): bigint {
  const clean = text.trim();
  if (!/^(?:\d+)(?:\.\d+)?$/.test(clean))
    throw new Error(
      "Enter a positive amount using digits and a decimal point.",
    );
  if ((clean.split(".")[1]?.length ?? 0) > decimals)
    throw new Error(`Use at most ${decimals} decimal places.`);
  const amount = parseUnits(clean, decimals);
  if (amount <= 0n) throw new Error("Enter an amount greater than zero.");
  return amount;
}
export function units(value: bigint, decimals = 18, precision = 4) {
  const [whole, fraction] = formatUnits(value, decimals).split(".");
  const formatted = BigInt(whole).toLocaleString("en-US");
  const part = fraction?.slice(0, precision).replace(/0+$/, "");
  return value > 0n && BigInt(whole) === 0n && !part
    ? `<0.${"0".repeat(precision - 1)}1`
    : `${formatted}${part ? `.${part}` : ""}`;
}
export function countdown(seconds: number) {
  seconds = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function timing(drone: Drone, now: number) {
  const elapsed = now - Number(drone.lastBeatAt);
  return {
    alive: elapsed <= 172800,
    canBeat: elapsed >= 72000,
    remaining: Math.max(0, 172800 - elapsed),
    cooldown: Math.max(0, 72000 - elapsed),
    warning: elapsed > 151200 && elapsed <= 172800,
  };
}
export function rankProgress(staked: bigint) {
  const index = thresholds.reduce((best, t, i) => (staked >= t ? i : best), 0);
  const next = thresholds[index + 1];
  return {
    rank: ranks[index],
    next: ranks[index + 1],
    target: next,
    percent: next
      ? Number(
          ((staked - thresholds[index]) * 10000n) / (next - thresholds[index]),
        ) / 100
      : 100,
  };
}
const errors: Record<string, string> = {
  AlreadyHasDrone: "This wallet already has a Drone. Refresh to see it.",
  MaxSupplyReached: "All 4,096 Drones have been minted.",
  NoDrone: "Mint your Drone before sending a heartbeat or staking.",
  BeatTooSoon: "Your next heartbeat is not ready yet. Wait for the countdown.",
  ZeroAmount: "Enter an amount greater than zero.",
  InsufficientStake: "This amount exceeds your staked PULSE.",
  ERC20InsufficientBalance: "Your token balance is too low for this amount.",
  ERC20InsufficientAllowance: "Approve this amount before continuing.",
  Soulbound:
    "Drones stay with their original wallet and cannot be transferred.",
  TransactionDeadlinePassed: "This swap expired. Get a fresh quote.",
  ExecutionFailed:
    "The swap simulation reverted. Refresh the quote and check liquidity, balance, and approvals.",
};
export function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (
    /4001|user rejected|user denied|rejected the request/i.test(text) ||
    (error as { code?: number })?.code === 4001
  )
    return "Request declined in your wallet. Nothing was submitted. You can try again.";
  if (error instanceof BaseError) {
    const revert = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError;
    if (revert?.data?.errorName && errors[revert.data.errorName])
      return errors[revert.data.errorName];
    if (revert?.reason)
      return `Contract declined this action: ${revert.reason.slice(0, 180)}`;
  }
  if (/insufficient funds/i.test(text))
    return "You need enough ETH to pay the network fee.";
  if (
    /failed to fetch|fetch failed|network request|timeout|HTTP request/i.test(
      text,
    )
  )
    return "The network could not be reached. Check your connection and retry.";
  if (error instanceof BaseError)
    return `${error.shortMessage.slice(0, 220)} Refresh the data and try again.`;
  return text.slice(0, 260);
}
