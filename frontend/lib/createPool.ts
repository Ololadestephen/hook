import { encodeAbiParameters, isAddress, keccak256, type Address, type Hex } from "viem";
import { hookFlowDeployment, hookFlowSelfServeDeployment } from "./contracts";

export const DYNAMIC_FEE_FLAG = 8_388_608;
export const DEFAULT_TICK_SPACING = 60;
export const DEFAULT_SQRT_PRICE_X96 = BigInt("1446501726624926496477173928747177");

export const hookFlowPoolManagerAbi = [
  {
    type: "function",
    name: "initialize",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" }
        ]
      },
      { name: "sqrtPriceX96", type: "uint160" }
    ],
    outputs: [{ name: "tick", type: "int24" }]
  }
] as const;

export const hookFlowHookAbi = [
  {
    type: "function",
    name: "applySafePreset",
    stateMutability: "nonpayable",
    inputs: [
      { name: "poolId", type: "bytes32" },
      { name: "preset", type: "uint8" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "applyPreset",
    stateMutability: "nonpayable",
    inputs: [
      { name: "poolId", type: "bytes32" },
      { name: "preset", type: "uint8" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

export const erc20ApprovalAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

export const erc20MetadataAbi = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
  }
] as const;

export const hookFlowLiquidityRouterAbi = [
  {
    type: "event",
    name: "PoolLaunched",
    inputs: [
      { name: "creator", type: "address", indexed: true },
      { name: "poolId", type: "bytes32", indexed: true },
      { name: "hook", type: "address", indexed: true },
      { name: "preset", type: "uint8", indexed: false },
      { name: "sqrtPriceX96", type: "uint160", indexed: false }
    ]
  },
  {
    type: "function",
    name: "createPoolAndAddLiquidity",
    stateMutability: "payable",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" }
        ]
      },
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "preset", type: "uint8" },
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "liquidityDelta", type: "int256" },
          { name: "salt", type: "bytes32" }
        ]
      },
      { name: "amount0Max", type: "uint256" },
      { name: "amount1Max", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "hookData", type: "bytes" }
    ],
    outputs: [{ name: "delta", type: "int256" }]
  },
  {
    type: "function",
    name: "modifyLiquidity",
    stateMutability: "payable",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" }
        ]
      },
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "liquidityDelta", type: "int256" },
          { name: "salt", type: "bytes32" }
        ]
      },
      { name: "amount0Max", type: "uint256" },
      { name: "amount1Max", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "hookData", type: "bytes" }
    ],
    outputs: [{ name: "delta", type: "int256" }]
  }
] as const;

export const hookFlowStateViewAbi = [
  {
    type: "function",
    name: "getSlot0",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" }
    ]
  },
  {
    type: "function",
    name: "getPositionInfo",
    stateMutability: "view",
    inputs: [
      { name: "poolId", type: "bytes32" },
      { name: "owner", type: "address" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "salt", type: "bytes32" }
    ],
    outputs: [
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" }
    ]
  }
] as const;

export const presetOptions = [
  { label: "Stable Pair", value: 0, description: "Correlated assets" },
  { label: "Volatile Pair", value: 1, description: "Active markets" },
  { label: "Launch Pool", value: 2, description: "New pools" },
  { label: "Long Tail Pool", value: 3, description: "Thin liquidity" }
] as const;

export const verifiedHookDefaults = {
  token0: hookFlowSelfServeDeployment.token0 as Address,
  token1: hookFlowSelfServeDeployment.token1 as Address,
  hook: hookFlowSelfServeDeployment.hook as Address,
  poolManager: hookFlowSelfServeDeployment.poolManager as Address,
  liquidityRouter: hookFlowSelfServeDeployment.liquidityRouter as Address,
  poolId: hookFlowSelfServeDeployment.poolId as Hex,
  sqrtPriceX96: DEFAULT_SQRT_PRICE_X96,
  tickSpacing: DEFAULT_TICK_SPACING
} as const;

export function sortTokenAddresses(first: string, second: string) {
  if (!isAddress(first) || !isAddress(second)) return null;
  const a = first as Address;
  const b = second as Address;
  const numericA = BigInt(a);
  const numericB = BigInt(b);
  if (numericA === numericB) return null;
  return numericA < numericB ? { token0: a, token1: b } : { token0: b, token1: a };
}

export function poolKeyFor(token0: Address, token1: Address, tickSpacing = DEFAULT_TICK_SPACING) {
  return {
    currency0: token0,
    currency1: token1,
    fee: DYNAMIC_FEE_FLAG,
    tickSpacing,
    hooks: verifiedHookDefaults.hook
  } as const;
}

export function poolIdFor(token0: Address, token1: Address, tickSpacing = DEFAULT_TICK_SPACING) {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "currency0", type: "address" },
        { name: "currency1", type: "address" },
        { name: "fee", type: "uint24" },
        { name: "tickSpacing", type: "int24" },
        { name: "hooks", type: "address" }
      ],
      [token0, token1, DYNAMIC_FEE_FLAG, tickSpacing, verifiedHookDefaults.hook]
    )
  );
}

export function txUrl(hash: string) {
  return `${hookFlowDeployment.explorerBaseUrl}/tx/${hash}`;
}

function decimalFraction(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const denominator = BigInt(10) ** BigInt(fraction.length);
  return { numerator: BigInt(`${whole}${fraction}`), denominator };
}

function integerSqrt(value: bigint) {
  if (value < BigInt(0)) throw new Error("square root of a negative value");
  if (value < BigInt(2)) return value;
  let x = value;
  let y = (x + BigInt(1)) / BigInt(2);
  while (y < x) {
    x = y;
    y = (x + value / x) / BigInt(2);
  }
  return x;
}

/** Converts a human token1-per-token0 price into Uniswap's raw Q64.96 price. */
export function sqrtPriceX96FromHumanPrice(price: string, decimals0: number, decimals1: number) {
  const fraction = decimalFraction(price);
  if (!fraction || fraction.numerator === BigInt(0)) return null;
  const numerator =
    fraction.numerator * BigInt(10) ** BigInt(decimals1) * (BigInt(2) ** BigInt(192));
  const denominator = fraction.denominator * BigInt(10) ** BigInt(decimals0);
  return integerSqrt(numerator / denominator);
}

function sqrtRatioAtTick(tick: number) {
  if (!Number.isInteger(tick) || tick < -887_272 || tick > 887_272) return null;
  const absoluteTick = Math.abs(tick);
  let ratio = absoluteTick & 0x1
    ? BigInt("0xfffcb933bd6fad37aa2d162d1a594001")
    : BigInt("0x100000000000000000000000000000000");
  const factors: Array<[number, bigint]> = [
    [0x2, BigInt("0xfff97272373d413259a46990580e213a")],
    [0x4, BigInt("0xfff2e50f5f656932ef12357cf3c7fdcc")],
    [0x8, BigInt("0xffe5caca7e10e4e61c3624eaa0941cd0")],
    [0x10, BigInt("0xffcb9843d60f6159c9db58835c926644")],
    [0x20, BigInt("0xff973b41fa98c081472e6896dfb254c0")],
    [0x40, BigInt("0xff2ea16466c96a3843ec78b326b52861")],
    [0x80, BigInt("0xfe5dee046a99a2a811c461f1969c3053")],
    [0x100, BigInt("0xfcbe86c7900a88aedcffc83b479aa3a4")],
    [0x200, BigInt("0xf987a7253ac413176f2b074cf7815e54")],
    [0x400, BigInt("0xf3392b0822b70005940c7a398e4b70f3")],
    [0x800, BigInt("0xe7159475a2c29b7443b29c7fa6e889d9")],
    [0x1000, BigInt("0xd097f3bdfd2022b8845ad8f792aa5825")],
    [0x2000, BigInt("0xa9f746462d870fdf8a65dc1f90e061e5")],
    [0x4000, BigInt("0x70d869a156d2a1b890bb3df62baf32f7")],
    [0x8000, BigInt("0x31be135f97d08fd981231505542fcfa6")],
    [0x10000, BigInt("0x9aa508b5b7a84e1c677de54f3e99bc9")],
    [0x20000, BigInt("0x5d6af8dedb81196699c329225ee604")],
    [0x40000, BigInt("0x2216e584f5fa1ea926041bedfe98")],
    [0x80000, BigInt("0x48a170391f7dc42444e8fa2")]
  ];

  for (const [mask, factor] of factors) {
    if (absoluteTick & mask) ratio = (ratio * factor) >> BigInt(128);
  }
  if (tick > 0) ratio = ((BigInt(1) << BigInt(256)) - BigInt(1)) / ratio;

  const remainderMask = (BigInt(1) << BigInt(32)) - BigInt(1);
  return (ratio >> BigInt(32)) + (ratio & remainderMask ? BigInt(1) : BigInt(0));
}

/** Calculates the largest in-range liquidity supported by both user maxima. */
export function liquidityForAmounts(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  amount0Max: bigint,
  amount1Max: bigint
) {
  const sqrtLower = sqrtRatioAtTick(tickLower);
  const sqrtUpper = sqrtRatioAtTick(tickUpper);
  const q96 = BigInt(2) ** BigInt(96);
  if (!sqrtLower || !sqrtUpper || sqrtLower >= sqrtPriceX96 || sqrtPriceX96 >= sqrtUpper) return null;

  const liquidity0 = (amount0Max * sqrtPriceX96 * sqrtUpper) / (q96 * (sqrtUpper - sqrtPriceX96));
  const liquidity1 = (amount1Max * q96) / (sqrtPriceX96 - sqrtLower);
  const liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
  return liquidity > BigInt(0) ? liquidity : null;
}
