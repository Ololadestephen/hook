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

const LOG_BLOCK_SPAN = BigInt(2_000);
const RPC_ATTEMPTS = 3;

async function withRpcRetry<T>(request: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RPC_ATTEMPTS; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (attempt < RPC_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

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
  const latestBlock = await withRpcRetry(() => client.getBlockNumber());
  const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  let toBlock = latestBlock;

  while (toBlock >= hookFlowDeploymentBlocks.liquidityRouter) {
    const fromBlock = toBlock - hookFlowDeploymentBlocks.liquidityRouter + BigInt(1) > LOG_BLOCK_SPAN
      ? toBlock - LOG_BLOCK_SPAN + BigInt(1)
      : hookFlowDeploymentBlocks.liquidityRouter;
    ranges.push({ fromBlock, toBlock });
    if (fromBlock === hookFlowDeploymentBlocks.liquidityRouter) break;
    toBlock = fromBlock - BigInt(1);
  }

  const logChunks = [];
  for (let index = 0; index < ranges.length; index += 3) {
    const batch = ranges.slice(index, index + 3);
    const results = await Promise.all(batch.map(({ fromBlock, toBlock: rangeEnd }) =>
      withRpcRetry(() => client.getLogs({
        address: hookFlowDeployment.liquidityRouter,
        event: hookFlowLiquidityRouterAbi[0],
        args: { creator },
        fromBlock,
        toBlock: rangeEnd
      }))
    ));
    logChunks.push(...results);
  }

  const logs = logChunks.flat();
  const salt = positionSalt(creator);

  const poolResults = await Promise.allSettled(logs.map(async (log) => {
    if (!log.transactionHash || !log.args.poolId || log.args.preset === undefined) return null;
    const transactionHash = log.transactionHash;
    const poolId = log.args.poolId;
    const launchPreset = log.args.preset;
    const transaction = await withRpcRetry(() => client.getTransaction({ hash: transactionHash }));
    const decoded = decodeFunctionData({ abi: hookFlowLiquidityRouterAbi, data: transaction.input });
    if (decoded.functionName !== "createPoolAndAddLiquidity" || !decoded.args) return null;

    const [key, , , params] = decoded.args as LaunchArguments;
    const [position, slot0, metadata0, metadata1] = await withRpcRetry(() => Promise.all([
      client.readContract({
        address: sepoliaContracts.stateView,
        abi: hookFlowStateViewAbi,
        functionName: "getPositionInfo",
        args: [poolId, hookFlowDeployment.liquidityRouter, params.tickLower, params.tickUpper, salt]
      }),
      client.readContract({
        address: sepoliaContracts.stateView,
        abi: hookFlowStateViewAbi,
        functionName: "getSlot0",
        args: [poolId]
      }),
      tokenMetadata(client, key.currency0),
      tokenMetadata(client, key.currency1)
    ]));

    const preset = Number(launchPreset);
    return {
      blockNumber: log.blockNumber,
      decimals0: metadata0.decimals,
      decimals1: metadata1.decimals,
      key,
      liquidity: position[0],
      poolId,
      preset,
      presetLabel: presetOptions.find((option) => option.value === preset)?.label ?? "Custom",
      salt,
      sqrtPriceX96: slot0[0],
      symbol0: metadata0.symbol,
      symbol1: metadata1.symbol,
      tick: slot0[1],
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
      transactionHash
    } satisfies ManagedPool;
  }));

  const pools = poolResults.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
  const firstFailure = poolResults.find((result) => result.status === "rejected");
  if (pools.length === 0 && firstFailure?.status === "rejected") throw firstFailure.reason;

  return pools
    .sort((a, b) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1));
}

export function compactLiquidity(value: bigint) {
  if (value === BigInt(0)) return "0";
  const raw = value.toString();
  return raw.length > 12 ? `${raw.slice(0, 6)}…${raw.slice(-4)}` : raw;
}
