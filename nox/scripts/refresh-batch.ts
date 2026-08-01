import { network } from "hardhat";
import { getAddress, isAddress } from "viem";

const configuredContract = process.env.PHANTOM_BATCH_ADDRESS;
if (!configuredContract || !isAddress(configuredContract)) {
  throw new Error("PHANTOM_BATCH_ADDRESS must be a valid Ethereum address");
}

const duration = BigInt(process.env.PHANTOM_BATCH_DURATION ?? "3600");
if (duration < 30n || duration > 3_600n) {
  throw new Error("PHANTOM_BATCH_DURATION must be between 30 and 3600 seconds");
}

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();
const phantom = await viem.getContractAt("PhantomBatch", getAddress(configuredContract));
const currentBatchId = await phantom.read.currentBatchId();
const current = await phantom.read.batches([currentBatchId]);
const phase = Number(current[3]);
const closesAt = Number(current[1]);
const now = Math.floor(Date.now() / 1_000);

if (phase === 0 && now < closesAt) {
  console.log(`Batch ${currentBatchId} is still collecting for ${closesAt - now}s; no refresh needed.`);
  process.exit(0);
}

if (phase === 0 || phase === 1) {
  const cancelHash = await phantom.write.cancelBatch();
  await publicClient.waitForTransactionReceipt({ hash: cancelHash });
  console.log(`Cancelled batch ${currentBatchId}: ${cancelHash}`);
}

const openHash = await phantom.write.openNextBatch([duration]);
await publicClient.waitForTransactionReceipt({ hash: openHash });
const nextBatchId = await phantom.read.currentBatchId();
console.log(`Opened batch ${nextBatchId} for ${duration}s: ${openHash}`);
