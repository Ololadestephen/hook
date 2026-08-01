import { isAddress, parseAbi, type Address } from "viem";

export const phantomBatchAbi = parseAbi([
  "function owner() view returns (address)",
  "function executor() view returns (address)",
  "function currentBatchId() view returns (uint256)",
  "function batches(uint256) view returns (uint64 openedAt, uint64 closesAt, uint32 intentCount, uint8 phase, bytes32 totalSell0, bytes32 totalSell1, bytes32 matchedVolume, bytes32 residual0, bytes32 residual1, bytes32 hookFlowExecutionRef, bytes32 routeCap, bytes32 publicRoute0, bytes32 publicRoute1, bytes32 deferred0, bytes32 deferred1, bytes32 routeCode, uint8 executedRoute, uint256 disclosedRoute0, uint256 disclosedRoute1, bool hasCarriedFlow)",
  "function receipts(uint256,address) view returns (bytes32 sell0, bytes32 sell1, bool submitted, bytes32 maxPublicClip)",
  "function submitIntent(bytes32 encryptedSell0, bytes sell0Proof, bytes32 encryptedSell1, bytes sell1Proof, bytes32 encryptedMaxPublicClip, bytes maxPublicClipProof)",
  "function sealBatch()",
  "function cancelBatch()",
  "function openNextBatch(uint64 duration) returns (uint256 batchId)",
  "event IntentSubmitted(uint256 indexed batchId, address indexed trader, uint32 intentCount)",
  "event BatchSealed(uint256 indexed batchId, uint32 intentCount, bytes32 matchedVolume, bytes32 routeCode, bytes32 publicRoute0, bytes32 publicRoute1)",
  "event BatchExecuted(uint256 indexed batchId, uint8 route, uint256 disclosedRoute0, uint256 disclosedRoute1, bytes32 indexed hookFlowExecutionRef)"
]);

const livePhantomBatchAddress = "0x6746265fD2B884096c6936ab27f07922f81f2596";
const configuredAddress = process.env.NEXT_PUBLIC_PHANTOM_BATCH_ADDRESS ?? livePhantomBatchAddress;

export const phantomBatchAddress: Address | undefined = isAddress(configuredAddress)
  ? configuredAddress
  : undefined;

export const phantomPhases = ["Collecting", "Sealed", "Executed", "Cancelled"] as const;
export const phantomRoutes = ["No public swap", "HookFlow direct", "HookFlow clipped"] as const;

export const liveConfidentialRouteProof = {
  batchId: BigInt(2),
  encryptedAmount: "125",
  disclosedClip: "20",
  route: "HookFlow clipped",
  intentTx: "0x4903c5e46186fc3c9447c295f2d7dcae4b6621531a283d773dc9bffd2e200ef4",
  swapTx: "0xb8b2a5580a1ea936d1b5527feb7fff24abe5d02f150651cfe1a04461c8b7ec99",
  executionTx: "0x029a83e557de930a3fc5655c30e42d7ff022834a7fc037db274ff6d3bb472966"
} as const;
