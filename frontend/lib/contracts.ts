import { isAddress, zeroAddress, zeroHash, type Address, type Hex } from "viem";

function configuredAddress(value: string | undefined, fallback: Address): Address {
  return value && isAddress(value) ? value : fallback;
}

function configuredHash(value: string | undefined): Hex {
  return value && /^0x[0-9a-fA-F]{64}$/.test(value) ? (value as Hex) : zeroHash;
}

export const sepoliaContracts = {
  poolManager: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543" as Address,
  positionManager: "0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4" as Address,
  stateView: "0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c" as Address,
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address,
  usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address,
  weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as Address
} as const;

export const liveHookFlowContracts = {
  hook: "0x1652dd23c6253d855648F81A737fEf811Ab480c0" as Address,
  factory: "0xFffd73b95b0A72381ea60Fe6560Ce9d991eCA5af" as Address,
  liquidityRouter: "0x0c57E18D8eE175087EFc31c3E5855724d9ECa463" as Address,
  swapRouter: "0x7Ce373A874c5FF56959859d525315d263C1e33ac" as Address,
  phantomBatch: "0x6746265fD2B884096c6936ab27f07922f81f2596" as Address
} as const;

export const hookFlowDeploymentBlocks = {
  liquidityRouter: BigInt(11_388_613)
} as const;

export const hookFlowDemoMarket = {
  token0: "0x8602CdE617Aa06596b27A64a670aA94135c1Cf25" as Address,
  token1: "0xB0eAF5C5cBA516B6d7d7282d35C9C00eB90895c6" as Address,
  token0Symbol: "hfUSD-A",
  token1Symbol: "hfUSD-B",
  poolId: "0x219b1c64d5aafc7d0df414afeaeea244e21316af61475db81731669bcde286fe" as Hex,
  poolLaunchTx: "0xc1dc681f56cbf395c8d9f7fe1ad328fdd896009ecb5a4f743b7ed48976e084ef" as Hex,
  encryptedIntentTx: "0x4903c5e46186fc3c9447c295f2d7dcae4b6621531a283d773dc9bffd2e200ef4" as Hex,
  routedSwapTx: "0xb8b2a5580a1ea936d1b5527feb7fff24abe5d02f150651cfe1a04461c8b7ec99" as Hex,
  executionProofTx: "0x029a83e557de930a3fc5655c30e42d7ff022834a7fc037db274ff6d3bb472966" as Hex
} as const;

export const hookFlowDeployment = {
  chainName: "Ethereum Sepolia",
  chainId: 11_155_111,
  explorerBaseUrl: "https://sepolia.etherscan.io",
  hook: configuredAddress(process.env.NEXT_PUBLIC_HOOKFLOW_HOOK_ADDRESS, liveHookFlowContracts.hook),
  factory: configuredAddress(process.env.NEXT_PUBLIC_HOOKFLOW_FACTORY_ADDRESS, liveHookFlowContracts.factory),
  liquidityRouter: configuredAddress(
    process.env.NEXT_PUBLIC_HOOKFLOW_LIQUIDITY_ROUTER_ADDRESS,
    liveHookFlowContracts.liquidityRouter
  ),
  swapRouter: configuredAddress(
    process.env.NEXT_PUBLIC_HOOKFLOW_SWAP_ROUTER_ADDRESS,
    liveHookFlowContracts.swapRouter
  ),
  poolManager: sepoliaContracts.poolManager,
  token0: sepoliaContracts.usdc,
  token1: sepoliaContracts.weth,
  poolId: configuredHash(process.env.NEXT_PUBLIC_HOOKFLOW_DEFAULT_POOL_ID)
} as const;

export const hookFlowSelfServeDeployment = hookFlowDeployment;

export const isHookFlowConfigured =
  hookFlowDeployment.hook !== zeroAddress && hookFlowDeployment.liquidityRouter !== zeroAddress;

export const hookFlowState = {
  appliedFeePips: "Dynamic",
  toxicityScore: "Per pool",
  cooldown: "Automatic",
  preset: "Creator selected",
  sameDirectionCount: "Onchain",
  flowBias: "Measured after launch"
} as const;

export const deploymentProof = [
  {
    label: "Hook deployment",
    tx: process.env.NEXT_PUBLIC_HOOKFLOW_HOOK_DEPLOY_TX ??
      "0xfb433fe9abaa75fb631744892d22df1fa60b83879d1be49fddca75eb50a223ab"
  },
  {
    label: "Router deployment",
    tx: process.env.NEXT_PUBLIC_HOOKFLOW_ROUTER_DEPLOY_TX ??
      "0x4a5d59203735cf061f9552f68523cefb9332e10e2a932e91c2a6635303230ed8"
  }
].filter((item) => /^0x[0-9a-fA-F]{64}$/.test(item.tx));

export const behaviorProof = {
  chainName: hookFlowDeployment.chainName,
  explorerBaseUrl: hookFlowDeployment.explorerBaseUrl,
  hook: hookFlowDeployment.hook,
  poolId: hookFlowDeployment.poolId
} as const;

export const flowEvents: Array<{
  step: string;
  trigger: string;
  fee: string;
  bucket: string;
  score: string;
  mode: string;
  tx: string;
}> = [];
