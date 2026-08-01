import {
  decodeFunctionData,
  encodePacked,
  keccak256,
  type Address,
  type Hex,
  type PublicClient
} from "viem";
import { hookFlowDeployment, hookFlowDeploymentBlocks, sepoliaContracts } from "./contracts";
import {
  erc20MetadataAbi,
  hookFlowLiquidityRouterAbi,
  hookFlowStateViewAbi,
  presetOptions
} from "./createPool";

export type ManagedPoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

export type ManagedPool = {
  blockNumber: bigint;
  decimals0: number;
  decimals1: number;
  key: ManagedPoolKey;
  liquidity: bigint;
  poolId: Hex;
  preset: number;
  presetLabel: string;
  salt: Hex;
  sqrtPriceX96: bigint;
  symbol0: string;
  symbol1: string;
  tick: number;
  tickLower: number;
  tickUpper: number;
  transactionHash: Hex;
};

type LaunchArguments = readonly [
  ManagedPoolKey,
  bigint,
  number,
  { tickLower: number; tickUpper: number; liquidityDelta: bigint; salt: Hex },
  bigint,
  bigint,
  bigint,
  Hex
];

function fallbackSymbol(address: Address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

async function tokenMetadata(client: PublicClient, address: Address) {
  const fallback = { decimals: 18, symbol: fallbackSymbol(address) };
  try {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address, abi: erc20MetadataAbi, functionName: "symbol" }),
      client.readContract({ address, abi: erc20MetadataAbi, functionName: "decimals" })
    ]);
    return { symbol, decimals: Number(decimals) };
  } catch {
    return fallback;
  }
}

export function positionSalt(address: Address) {
  return keccak256(encodePacked(["address"], [address]));
}

export async function getManagedPools(client: PublicClient, creator: Address): Promise<ManagedPool[]> {
  const logs = await client.getLogs({
    address: hookFlowDeployment.liquidityRouter,
    event: hookFlowLiquidityRouterAbi[0],
    args: { creator },
    fromBlock: hookFlowDeploymentBlocks.liquidityRouter,
    toBlock: "latest"
  });
  const salt = positionSalt(creator);

  const pools = await Promise.all(logs.map(async (log) => {
    if (!log.transactionHash || !log.args.poolId || log.args.preset === undefined) return null;
    const transaction = await client.getTransaction({ hash: log.transactionHash });
    const decoded = decodeFunctionData({ abi: hookFlowLiquidityRouterAbi, data: transaction.input });
    if (decoded.functionName !== "createPoolAndAddLiquidity" || !decoded.args) return null;

    const [key, , , params] = decoded.args as LaunchArguments;
    const [position, slot0, metadata0, metadata1] = await Promise.all([
      client.readContract({
        address: sepoliaContracts.stateView,
        abi: hookFlowStateViewAbi,
        functionName: "getPositionInfo",
        args: [log.args.poolId, hookFlowDeployment.liquidityRouter, params.tickLower, params.tickUpper, salt]
      }),
      client.readContract({
        address: sepoliaContracts.stateView,
        abi: hookFlowStateViewAbi,
        functionName: "getSlot0",
        args: [log.args.poolId]
      }),
      tokenMetadata(client, key.currency0),
      tokenMetadata(client, key.currency1)
    ]);

    const preset = Number(log.args.preset);
    return {
      blockNumber: log.blockNumber,
      decimals0: metadata0.decimals,
      decimals1: metadata1.decimals,
      key,
      liquidity: position[0],
      poolId: log.args.poolId,
      preset,
      presetLabel: presetOptions.find((option) => option.value === preset)?.label ?? "Custom",
      salt,
      sqrtPriceX96: slot0[0],
      symbol0: metadata0.symbol,
      symbol1: metadata1.symbol,
      tick: slot0[1],
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
      transactionHash: log.transactionHash
    } satisfies ManagedPool;
  }));

  return pools
    .filter((pool): pool is ManagedPool => pool !== null)
    .sort((a, b) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1));
}

export function compactLiquidity(value: bigint) {
  if (value === BigInt(0)) return "0";
  const raw = value.toString();
  return raw.length > 12 ? `${raw.slice(0, 6)}…${raw.slice(-4)}` : raw;
}
