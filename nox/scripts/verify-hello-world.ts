import { createViemHandleClient, type Handle } from "@iexec-nox/handle";
import { network } from "hardhat";
import { setTimeout as sleep } from "node:timers/promises";
import { getAddress, isAddress } from "viem";

const configuredContract = process.env.HELLO_WORLD_CONTRACT;
if (!configuredContract || !isAddress(configuredContract)) {
  throw new Error("HELLO_WORLD_CONTRACT must be a valid Ethereum address");
}

const { viem } = await network.connect();
const [walletClient] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();
const contractAddress = getAddress(configuredContract);
const piggyBank = await viem.getContractAt("ConfidentialPiggyBank", contractAddress);
const handleClient = await createViemHandleClient(walletClient);
const balanceHandle = (await piggyBank.read.balance()) as Handle<"uint256">;

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

console.log("NOX_HELLO_WORLD_RESULT");
console.log(
  JSON.stringify(
    {
      network: "Ethereum Sepolia",
      chainId: await publicClient.getChainId(),
      wallet: walletClient.account.address,
      contract: contractAddress,
      encryptedBalanceHandle: balanceHandle,
      decryptedBalance: decryptedBalance.value.toString(),
      status: decryptedBalance.value === 42n ? "completed" : "unexpected-balance",
    },
    null,
    2,
  ),
);
