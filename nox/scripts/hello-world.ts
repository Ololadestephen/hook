import { createViemHandleClient, type Handle } from "@iexec-nox/handle";
import { network } from "hardhat";
import { setTimeout as sleep } from "node:timers/promises";

const DEPOSIT_AMOUNT = 42n;

const { viem } = await network.connect();
const [walletClient] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();

console.log(`Wallet: ${walletClient.account.address}`);
console.log(`Deploying ConfidentialPiggyBank on chain ${await publicClient.getChainId()}`);

const { contract: piggyBank, deploymentTransaction } =
  await viem.sendDeploymentTransaction("ConfidentialPiggyBank");
const deploymentReceipt = await publicClient.waitForTransactionReceipt({
  hash: deploymentTransaction.hash,
});
console.log(`Contract: ${piggyBank.address}`);
console.log(`Deployment transaction: ${deploymentReceipt.transactionHash}`);

const handleClient = await createViemHandleClient(walletClient);
const encryptedDeposit = await handleClient.encryptInput(
  DEPOSIT_AMOUNT,
  "uint256",
  piggyBank.address,
);

const depositHash = await piggyBank.write.deposit([
  encryptedDeposit.handle,
  encryptedDeposit.handleProof,
]);
const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });
console.log(`Deposit transaction: ${depositReceipt.transactionHash}`);
const balanceHandle = (await piggyBank.read.balance()) as Handle<"uint256">;
console.log(`Encrypted balance handle: ${balanceHandle}`);

let decryptedBalance: Awaited<ReturnType<typeof handleClient.decrypt>> | undefined;
let lastError: unknown;
for (let attempt = 1; attempt <= 12; attempt += 1) {
  try {
    decryptedBalance = await handleClient.decrypt(balanceHandle);
    break;
  } catch (error) {
    lastError = error;
    console.log(`Waiting for Nox gateway synchronization (${attempt}/12)`);
    await sleep(5_000);
  }
}
if (!decryptedBalance) throw lastError;

if (decryptedBalance.value !== DEPOSIT_AMOUNT) {
  throw new Error(
    `Unexpected decrypted balance: ${decryptedBalance.value}; expected ${DEPOSIT_AMOUNT}`,
  );
}

console.log("NOX_HELLO_WORLD_RESULT");
console.log(
  JSON.stringify(
    {
      network: "Ethereum Sepolia",
      chainId: await publicClient.getChainId(),
      wallet: walletClient.account.address,
      contract: piggyBank.address,
      deploymentTransaction: deploymentReceipt.transactionHash,
      depositTransaction: depositReceipt.transactionHash,
      encryptedBalanceHandle: balanceHandle,
      decryptedBalance: decryptedBalance.value.toString(),
      status: "completed",
    },
    null,
    2,
  ),
);
