import { strict as assert } from "node:assert";
import { after, describe, it } from "node:test";
import {
  HANDLE_GATEWAY_URL,
  NOX_COMPUTE_ADDRESS,
  RPC_URL,
  nox
} from "@iexec-nox/nox-hardhat-plugin";
import { createViemHandleClient, type Handle, type HandleClient } from "@iexec-nox/handle";
import { createWalletClient, defineChain, http, zeroHash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { waitForHandleResolved } from "../utils/handle-gateway.js";

const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TRADER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const noxLocal = defineChain({
  id: 31_337,
  name: "Nox Local",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: { default: { http: [RPC_URL] } }
});
const connectionPromise = nox.connect();

after(async () => {
  const connection = await connectionPromise;
  await connection.close();
});

async function localHandleClient(privateKey: Hex) {
  const walletClient = createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: noxLocal,
    transport: http(RPC_URL)
  });
  const handleClient = await createViemHandleClient(walletClient, {
    gatewayUrl: HANDLE_GATEWAY_URL,
    smartContractAddress: NOX_COMPUTE_ADDRESS,
    subgraphUrl: "https://example.com/subgraphs/id/none"
  });
  return { walletClient, handleClient };
}

async function encryptedIntent(
  handleClient: HandleClient,
  contract: `0x${string}`,
  sell0: bigint,
  sell1: bigint,
  maxPublicClip = 100n
) {
  const [side0, side1, routeCap] = await Promise.all([
    handleClient.encryptInput(sell0, "uint256", contract),
    handleClient.encryptInput(sell1, "uint256", contract),
    handleClient.encryptInput(maxPublicClip, "uint256", contract)
  ]);
  return [
    side0.handle,
    side0.handleProof,
    side1.handle,
    side1.handleProof,
    routeCap.handle,
    routeCap.handleProof
  ] as const;
}

describe("PhantomBatch end-to-end", () => {
  it("crosses encrypted intents and reveals only the selected HookFlow route", { timeout: 180_000 }, async () => {
    const { viem, handleClient } = await connectionPromise;
    const publicClient = await viem.getPublicClient();
    const [owner] = await viem.getWalletClients();
    const phantom = await viem.deployContract("PhantomBatch", [owner.account.address, 300n]);
    const [ownerLocal, traderLocal] = await Promise.all([
      localHandleClient(OWNER_KEY),
      localHandleClient(TRADER_KEY)
    ]);

    const traderPhantom = await viem.getContractAt("PhantomBatch", phantom.address, {
      client: { wallet: traderLocal.walletClient }
    });

    const first = await encryptedIntent(ownerLocal.handleClient, phantom.address, 125n, 0n);
    const second = await encryptedIntent(traderLocal.handleClient, phantom.address, 0n, 70n);
    await publicClient.waitForTransactionReceipt({ hash: await phantom.write.submitIntent(first) });
    await publicClient.waitForTransactionReceipt({ hash: await traderPhantom.write.submitIntent(second) });
    await publicClient.waitForTransactionReceipt({ hash: await phantom.write.sealBatch() });

    const batch = await phantom.read.batches([1n]);
    const matchedHandle = batch[6] as Handle<"uint256">;
    const route0Handle = batch[11] as Handle<"uint256">;
    const route1Handle = batch[12] as Handle<"uint256">;
    const routeCodeHandle = batch[15] as Handle<"uint16">;
    await Promise.all([
      waitForHandleResolved(matchedHandle),
      waitForHandleResolved(route0Handle),
      waitForHandleResolved(route1Handle),
      waitForHandleResolved(routeCodeHandle)
    ]);

    const [matched, route0, route1, routeCode] = await Promise.all([
      handleClient.publicDecrypt(matchedHandle),
      handleClient.publicDecrypt(route0Handle),
      handleClient.publicDecrypt(route1Handle),
      handleClient.publicDecrypt(routeCodeHandle)
    ]);

    assert.equal(matched.value, 70n);
    assert.equal(route0.value, 55n);
    assert.equal(route1.value, 0n);
    assert.equal(routeCode.value, 1n);
    assert.equal(batch[2], 2);
    assert.equal(batch[3], 1);
  });

  it("keeps each trader receipt decryptable without publishing the amount", { timeout: 180_000 }, async () => {
    const { viem, handleClient } = await connectionPromise;
    const publicClient = await viem.getPublicClient();
    const [owner] = await viem.getWalletClients();
    const phantom = await viem.deployContract("PhantomBatch", [owner.account.address, 300n]);

    const intent = await encryptedIntent(await createViemHandleClient(owner, {
      gatewayUrl: HANDLE_GATEWAY_URL,
      smartContractAddress: NOX_COMPUTE_ADDRESS,
      subgraphUrl: "https://example.com/subgraphs/id/none"
    }), phantom.address, 42n, 0n);
    await publicClient.waitForTransactionReceipt({ hash: await phantom.write.submitIntent(intent) });
    const receipt = await phantom.read.receipts([1n, owner.account.address]);
    const sell0Handle = receipt[0] as Handle<"uint256">;
    const routeCapHandle = receipt[3] as Handle<"uint256">;
    await Promise.all([waitForHandleResolved(sell0Handle), waitForHandleResolved(routeCapHandle)]);

    const [decrypted, routeCap] = await Promise.all([
      handleClient.decrypt(sell0Handle),
      handleClient.decrypt(routeCapHandle)
    ]);
    assert.equal(decrypted.value, 42n);
    assert.equal(routeCap.value, 100n);
    assert.equal(receipt[2], true);
  });

  it("rejects a second intent from the same address", { timeout: 180_000 }, async () => {
    const { viem } = await connectionPromise;
    const publicClient = await viem.getPublicClient();
    const [owner] = await viem.getWalletClients();
    const phantom = await viem.deployContract("PhantomBatch", [owner.account.address, 300n]);
    const trader = await localHandleClient(TRADER_KEY);
    const traderPhantom = await viem.getContractAt("PhantomBatch", phantom.address, {
      client: { wallet: trader.walletClient }
    });
    const intent = await encryptedIntent(trader.handleClient, phantom.address, 10n, 0n);
    await publicClient.waitForTransactionReceipt({ hash: await traderPhantom.write.submitIntent(intent) });
    await assert.rejects(traderPhantom.write.submitIntent(intent));
  });

  it("records the real HookFlow execution reference and rolls the batch", { timeout: 180_000 }, async () => {
    const { viem, handleClient } = await connectionPromise;
    const publicClient = await viem.getPublicClient();
    const [owner] = await viem.getWalletClients();
    const phantom = await viem.deployContract("PhantomBatch", [owner.account.address, 300n]);
    await publicClient.waitForTransactionReceipt({ hash: await phantom.write.sealBatch() });

    const sealedBatch = await phantom.read.batches([1n]);
    const route0Handle = sealedBatch[11] as Handle<"uint256">;
    const route1Handle = sealedBatch[12] as Handle<"uint256">;
    const routeCodeHandle = sealedBatch[15] as Handle<"uint16">;
    await Promise.all([
      waitForHandleResolved(route0Handle),
      waitForHandleResolved(route1Handle),
      waitForHandleResolved(routeCodeHandle)
    ]);
    const [route0, route1, routeCode] = await Promise.all([
      handleClient.publicDecrypt(route0Handle),
      handleClient.publicDecrypt(route1Handle),
      handleClient.publicDecrypt(routeCodeHandle)
    ]);

    await publicClient.waitForTransactionReceipt({
      hash: await phantom.write.markExecuted([
        routeCode.decryptionProof,
        route0.decryptionProof,
        route1.decryptionProof,
        zeroHash
      ])
    });
    await publicClient.waitForTransactionReceipt({ hash: await phantom.write.openNextBatch([60n]) });

    assert.equal(await phantom.read.currentBatchId(), 2n);
    const firstBatch = await phantom.read.batches([1n]);
    assert.equal(firstBatch[3], 2);
    assert.equal(firstBatch[9], zeroHash);
    assert.equal(firstBatch[16], 0);
  });

  it("clips a large residual and carries the hidden remainder into the next batch", { timeout: 180_000 }, async () => {
    const { viem, handleClient } = await connectionPromise;
    const publicClient = await viem.getPublicClient();
    const [owner] = await viem.getWalletClients();
    const phantom = await viem.deployContract("PhantomBatch", [owner.account.address, 300n]);

    const intent = await encryptedIntent(
      await createViemHandleClient(owner, {
        gatewayUrl: HANDLE_GATEWAY_URL,
        smartContractAddress: NOX_COMPUTE_ADDRESS,
        subgraphUrl: "https://example.com/subgraphs/id/none"
      }),
      phantom.address,
      125n,
      0n,
      20n
    );
    await publicClient.waitForTransactionReceipt({ hash: await phantom.write.submitIntent(intent) });
    await publicClient.waitForTransactionReceipt({ hash: await phantom.write.sealBatch() });

    const sealed = await phantom.read.batches([1n]);
    const route0Handle = sealed[11] as Handle<"uint256">;
    const route1Handle = sealed[12] as Handle<"uint256">;
    const routeCodeHandle = sealed[15] as Handle<"uint16">;
    await Promise.all([
      waitForHandleResolved(route0Handle),
      waitForHandleResolved(route1Handle),
      waitForHandleResolved(routeCodeHandle)
    ]);
    const [route0, route1, routeCode] = await Promise.all([
      handleClient.publicDecrypt(route0Handle),
      handleClient.publicDecrypt(route1Handle),
      handleClient.publicDecrypt(routeCodeHandle)
    ]);
    assert.equal(route0.value, 20n);
    assert.equal(route1.value, 0n);
    assert.equal(routeCode.value, 2n);

    const executionRef = `0x${"cd".repeat(32)}` as Hex;
    await publicClient.waitForTransactionReceipt({
      hash: await phantom.write.markExecuted([
        routeCode.decryptionProof,
        route0.decryptionProof,
        route1.decryptionProof,
        executionRef
      ])
    });
    await publicClient.waitForTransactionReceipt({ hash: await phantom.write.openNextBatch([60n]) });

    const first = await phantom.read.batches([1n]);
    const second = await phantom.read.batches([2n]);
    assert.equal(first[16], 2);
    assert.equal(first[17], 20n);
    assert.equal(second[4], first[13]);
    assert.equal(second[19], true);
  });
});
