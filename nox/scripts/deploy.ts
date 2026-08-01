import { network } from "hardhat";
import { getAddress, isAddress } from "viem";

const { viem } = await network.connect();
const [deployer] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();
const configuredExecutor = process.env.PHANTOM_EXECUTOR ?? deployer.account.address;
if (!isAddress(configuredExecutor)) throw new Error("PHANTOM_EXECUTOR must be an Ethereum address");
const executor = getAddress(configuredExecutor);
const duration = BigInt(process.env.PHANTOM_BATCH_DURATION ?? "300");

console.log(`Deploying PhantomBatch from ${deployer.account.address}`);
console.log(`Executor: ${executor}; round duration: ${duration}s`);

const { contract: phantomBatch, deploymentTransaction } = await viem.sendDeploymentTransaction(
  "PhantomBatch",
  [executor, duration]
);
const receipt = await publicClient.waitForTransactionReceipt({
  hash: deploymentTransaction.hash
});

console.log(`PhantomBatch: ${phantomBatch.address}`);
console.log(`Deployment transaction: ${receipt.transactionHash}`);
