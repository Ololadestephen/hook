import { createViemHandleClient, type Handle } from "@iexec-nox/handle";
import { network } from "hardhat";
import { setTimeout as sleep } from "node:timers/promises";
import {
  getAddress,
  isAddress,
  parseAbi,
  zeroHash,
  type Address,
  type Hex,
} from "viem";

const DYNAMIC_FEE_FLAG = 8_388_608;
const INTENT_AMOUNT = 125n * 10n ** 6n;
const MAX_PUBLIC_CLIP = 20n * 10n ** 6n;

function requiredAddress(name: string): Address {
  const value = process.env[name];
  if (!value || !isAddress(value)) throw new Error(`${name} must be a valid Ethereum address`);
  return getAddress(value);
}

const phantomAddress = requiredAddress("PHANTOM_BATCH_ADDRESS");
const swapRouterAddress = requiredAddress("HOOKFLOW_SWAP_ROUTER_ADDRESS");
const hookAddress = requiredAddress("HOOKFLOW_HOOK_ADDRESS");
const token0 = requiredAddress("HOOKFLOW_TOKEN0");
const token1 = requiredAddress("HOOKFLOW_TOKEN1");

const swapRouterAbi = parseAbi([
  "function swapExactInput((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,bool zeroForOne,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96,uint256 deadline,bytes hookData) returns (uint256 amountOut)",
]);

const { viem } = await network.connect();
const [walletClient] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();
const phantom = await viem.getContractAt("PhantomBatch", phantomAddress);
const handleClient = await createViemHandleClient(walletClient);

const batchId = await phantom.read.currentBatchId();
const collectingBatch = await phantom.read.batches([batchId]);
if (Number(collectingBatch[3]) !== 0) throw new Error(`Batch ${batchId} is not collecting`);
if (BigInt(Math.floor(Date.now() / 1_000)) >= collectingBatch[1]) {
  throw new Error(`Batch ${batchId} has expired; run refresh:sepolia first`);
}

const existingReceipt = await phantom.read.receipts([batchId, walletClient.account.address]);
if (existingReceipt[2]) throw new Error(`Wallet already submitted to batch ${batchId}`);

console.log(`Encrypting ${INTENT_AMOUNT} token0 units with a ${MAX_PUBLIC_CLIP} public clip`);
const [encryptedSell0, encryptedSell1, encryptedClip] = await Promise.all([
  handleClient.encryptInput(INTENT_AMOUNT, "uint256", phantomAddress),
  handleClient.encryptInput(0n, "uint256", phantomAddress),
  handleClient.encryptInput(MAX_PUBLIC_CLIP, "uint256", phantomAddress),
]);

const intentHash = await phantom.write.submitIntent([
  encryptedSell0.handle,
  encryptedSell0.handleProof,
  encryptedSell1.handle,
  encryptedSell1.handleProof,
  encryptedClip.handle,
  encryptedClip.handleProof,
]);
await publicClient.waitForTransactionReceipt({ hash: intentHash });
console.log(`Encrypted intent: ${intentHash}`);

const sealHash = await phantom.write.sealBatch();
await publicClient.waitForTransactionReceipt({ hash: sealHash });
console.log(`Batch sealed: ${sealHash}`);

const sealedBatch = await phantom.read.batches([batchId]);
const matchedHandle = sealedBatch[6] as Handle<"uint256">;
const route0Handle = sealedBatch[11] as Handle<"uint256">;
const route1Handle = sealedBatch[12] as Handle<"uint256">;
const routeCodeHandle = sealedBatch[15] as Handle<"uint16">;

async function publicDecryptWithGatewayWait<T extends "uint16" | "uint256">(
  handle: Handle<T>,
  label: string,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    try {
      return await handleClient.publicDecrypt(handle);
    } catch (error) {
      lastError = error;
      console.log(`Waiting for ${label} (${attempt}/15)`);
      await sleep(5_000);
    }
  }
  throw lastError;
}

const [matched, route0, route1, routeCode] = await Promise.all([
  publicDecryptWithGatewayWait(matchedHandle, "matched volume"),
  publicDecryptWithGatewayWait(route0Handle, "token0 route"),
  publicDecryptWithGatewayWait(route1Handle, "token1 route"),
  publicDecryptWithGatewayWait(routeCodeHandle, "route code"),
]);

const disclosedRoute0 = route0.value as bigint;
const disclosedRoute1 = route1.value as bigint;
const disclosedRouteCode = routeCode.value as bigint;
let swapHash: Hex = zeroHash;

if (disclosedRouteCode !== 0n) {
  if ((disclosedRoute0 === 0n) === (disclosedRoute1 === 0n)) {
    throw new Error("Nox disclosed an invalid two-sided public route");
  }
  const zeroForOne = disclosedRoute0 > 0n;
  const amountIn = zeroForOne ? disclosedRoute0 : disclosedRoute1;
  const deadline = BigInt(Math.floor(Date.now() / 1_000) + 600);
  const key = {
    currency0: token0,
    currency1: token1,
    fee: DYNAMIC_FEE_FLAG,
    tickSpacing: 60,
    hooks: hookAddress,
  } as const;

  const simulation = await publicClient.simulateContract({
    account: walletClient.account,
    address: swapRouterAddress,
    abi: swapRouterAbi,
    functionName: "swapExactInput",
    args: [key, zeroForOne, amountIn, 1n, 0n, deadline, "0x"],
  });
  swapHash = await walletClient.writeContract(simulation.request);
  await publicClient.waitForTransactionReceipt({ hash: swapHash });
  console.log(`HookFlow swap: ${swapHash}`);
}

const markHash = await phantom.write.markExecuted([
  routeCode.decryptionProof as Hex,
  route0.decryptionProof as Hex,
  route1.decryptionProof as Hex,
  swapHash,
]);
await publicClient.waitForTransactionReceipt({ hash: markHash });
console.log(`Execution recorded: ${markHash}`);

const nextBatchHash = await phantom.write.openNextBatch([3_600n]);
await publicClient.waitForTransactionReceipt({ hash: nextBatchHash });
const nextBatchId = await phantom.read.currentBatchId();

console.log("PHANTOM_HOOKFLOW_LIVE_RESULT");
console.log(
  JSON.stringify(
    {
      batchId: batchId.toString(),
      intentAmount: INTENT_AMOUNT.toString(),
      maxPublicClip: MAX_PUBLIC_CLIP.toString(),
      matchedVolume: (matched.value as bigint).toString(),
      routeCode: disclosedRouteCode.toString(),
      route0: disclosedRoute0.toString(),
      route1: disclosedRoute1.toString(),
      intentTransaction: intentHash,
      sealTransaction: sealHash,
      swapTransaction: swapHash,
      markExecutedTransaction: markHash,
      nextBatchTransaction: nextBatchHash,
      nextBatchId: nextBatchId.toString(),
    },
    null,
    2,
  ),
);
