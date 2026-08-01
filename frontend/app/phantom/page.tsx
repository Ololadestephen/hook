"use client";

import { createViemHandleClient } from "@iexec-nox/handle";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, type Hex } from "viem";
import { sepolia } from "viem/chains";
import {
  useAccount,
  useConnect,
  useReadContract,
  useSwitchChain,
  useWalletClient,
  useWriteContract
} from "wagmi";
import {
  liveConfidentialRouteProof,
  phantomBatchAbi,
  phantomBatchAddress,
  phantomPhases,
  phantomRoutes
} from "../../lib/phantomBatch";
import { AppNav } from "../components/AppNav";
import { TransactionNotice, type TransactionTone } from "../components/TransactionNotice";
import { Providers } from "../providers";

type Side = "hfUSD-A" | "hfUSD-B";
type NoticeState = { message: string; title: string; tone: TransactionTone };

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function PhantomBatchContent() {
  const [side, setSide] = useState<Side>("hfUSD-A");
  const [amount, setAmount] = useState("100");
  const [maxPublicClip, setMaxPublicClip] = useState("25");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1_000));
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: walletClient } = useWalletClient({ chainId: sepolia.id });
  const { writeContractAsync, isPending: isSubmitting, data: hash } = useWriteContract();

  useEffect(() => {
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: owner } = useReadContract({
    address: phantomBatchAddress,
    abi: phantomBatchAbi,
    functionName: "owner",
    chainId: sepolia.id,
    query: { enabled: Boolean(phantomBatchAddress) }
  });

  const { data: currentBatchId } = useReadContract({
    address: phantomBatchAddress,
    abi: phantomBatchAbi,
    functionName: "currentBatchId",
    chainId: sepolia.id,
    query: { enabled: Boolean(phantomBatchAddress), refetchInterval: 8_000 }
  });
  const { data: batch } = useReadContract({
    address: phantomBatchAddress,
    abi: phantomBatchAbi,
    functionName: "batches",
    args: [currentBatchId ?? BigInt(0)],
    chainId: sepolia.id,
    query: { enabled: Boolean(phantomBatchAddress && currentBatchId), refetchInterval: 8_000 }
  });
  const { data: receipt } = useReadContract({
    address: phantomBatchAddress,
    abi: phantomBatchAbi,
    functionName: "receipts",
    args: [currentBatchId ?? BigInt(0), address ?? "0x0000000000000000000000000000000000000000"],
    chainId: sepolia.id,
    query: { enabled: Boolean(phantomBatchAddress && currentBatchId && address), refetchInterval: 8_000 }
  });

  const parsedAmount = useMemo(() => {
    try {
      return parseUnits(amount, 6);
    } catch {
      return BigInt(0);
    }
  }, [amount]);
  const parsedMaxPublicClip = useMemo(() => {
    try {
      return parseUnits(maxPublicClip, 6);
    } catch {
      return BigInt(0);
    }
  }, [maxPublicClip]);
  const wrongNetwork = isConnected && chainId !== sepolia.id;
  const phaseIndex = Number(batch?.[3] ?? 0);
  const batchClosed = Boolean(batch && BigInt(nowSeconds) >= batch[1]);
  const phase = batch
    ? phaseIndex === 0 && batchClosed
      ? "Awaiting seal"
      : phantomPhases[phaseIndex] ?? "Unknown"
    : "Awaiting deployment";
  const alreadySubmitted = Boolean(receipt?.[2]);
  const isOwner = Boolean(address && owner && address.toLowerCase() === owner.toLowerCase());
  const secondsRemaining = batch && phaseIndex === 0
    ? Math.max(0, Number(batch[1]) - nowSeconds)
    : 0;
  const canSubmit = Boolean(
    phantomBatchAddress && walletClient && parsedAmount > BigInt(0) && parsedMaxPublicClip > BigInt(0) &&
      !wrongNetwork && phaseIndex === 0 && !batchClosed && !alreadySubmitted
  );
  const executedRoute = phaseIndex === 2 ? phantomRoutes[batch?.[16] ?? 0] ?? "Unknown" : "Private until execution";
  const publicDisclosure = phaseIndex === 2 && batch
    ? `${formatUnits(batch[17], 6)} token0 · ${formatUnits(batch[18], 6)} token1`
    : "Hidden until execution";

  async function manageBatch(action: "seal" | "cancel" | "open") {
    if (!phantomBatchAddress || !isOwner) return;
    try {
      setNotice({
        title: "Check your wallet",
        message: action === "open" ? "Confirm the new confidential batch." : `Confirm that you want to ${action} this batch.`,
        tone: "pending"
      });
      const transactionHash = action === "open"
        ? await writeContractAsync({
            address: phantomBatchAddress,
            abi: phantomBatchAbi,
            functionName: "openNextBatch",
            args: [BigInt(3_600)],
            chainId: sepolia.id
          })
        : await writeContractAsync({
            address: phantomBatchAddress,
            abi: phantomBatchAbi,
            functionName: action === "seal" ? "sealBatch" : "cancelBatch",
            chainId: sepolia.id
          });
      setNotice({
        title: action === "open" ? "New batch submitted" : action === "seal" ? "Batch seal submitted" : "Batch cancellation submitted",
        message: "Sepolia received your transaction.",
        tone: "success"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown batch action error";
      setNotice(message.toLowerCase().includes("reject")
        ? { title: "Nothing was submitted", message: "You cancelled the request in your wallet.", tone: "neutral" }
        : { title: "We couldn’t update the batch", message: "Please check your network and try again.", tone: "error" });
    }
  }

  async function submitPrivateIntent() {
    if (!phantomBatchAddress || !walletClient || !canSubmit) return;
    setIsEncrypting(true);
    setNotice({ title: "Preparing your private swap", message: "Nox is encrypting your amount, direction, and limit.", tone: "pending" });

    try {
      const handleClient = await createViemHandleClient(walletClient);
      const sell0 = side === "hfUSD-A" ? parsedAmount : BigInt(0);
      const sell1 = side === "hfUSD-B" ? parsedAmount : BigInt(0);
      const [encrypted0, encrypted1, encryptedRouteCap] = await Promise.all([
        handleClient.encryptInput(sell0, "uint256", phantomBatchAddress),
        handleClient.encryptInput(sell1, "uint256", phantomBatchAddress),
        handleClient.encryptInput(parsedMaxPublicClip, "uint256", phantomBatchAddress)
      ]);

      setNotice({ title: "Check your wallet", message: "Confirm your encrypted private intent to continue.", tone: "pending" });
      const transactionHash = await writeContractAsync({
        address: phantomBatchAddress,
        abi: phantomBatchAbi,
        functionName: "submitIntent",
        args: [
          encrypted0.handle as Hex,
          encrypted0.handleProof as Hex,
          encrypted1.handle as Hex,
          encrypted1.handleProof as Hex,
          encryptedRouteCap.handle as Hex,
          encryptedRouteCap.handleProof as Hex
        ],
        chainId: sepolia.id
      });
      setNotice({ title: "Private intent submitted!", message: `Your intent is sealed in batch #${currentBatchId?.toString() ?? "?"}.`, tone: "success" });
      return transactionHash;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown encryption error";
      setNotice(message.toLowerCase().includes("reject")
        ? { title: "Nothing was submitted", message: "You cancelled the request in your wallet.", tone: "neutral" }
        : { title: "We couldn’t submit that", message: "Check your wallet connection and try again.", tone: "error" });
    } finally {
      setIsEncrypting(false);
    }
  }

  return (
    <main className="app-shell relative min-h-screen overflow-x-hidden bg-background pb-24 text-on-background lg:pb-0 lg:pl-[250px]">
      <AppNav active="phantom" />
      <div className="particle-field" />
      <section className="relative z-10 mx-auto w-full max-w-[1400px] px-4 py-4 md:px-8 md:py-5 lg:px-10">
        <header className="mb-4 flex flex-col justify-between gap-3 border-b border-white/10 pb-4 md:flex-row md:items-end md:gap-5">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-primary md:mb-3">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-primary" />
              iExec Nox
            </div>
            <h1 className="max-w-4xl font-display text-[28px] font-bold leading-tight tracking-[-0.035em] text-white md:text-[34px]">
              Phantom <span className="text-primary">Router</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-on-surface-variant md:leading-6">
              Route a private swap through Nox and HookFlow.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-surface-container-low/80 px-3.5 py-2.5 font-mono text-[10px] md:px-4 md:py-3">
            <p className="text-on-surface-variant">BATCH</p>
            <p className="mt-1 text-sm text-white md:text-base">#{currentBatchId?.toString() ?? "—"} · <span className="text-primary">{phase}</span></p>
          </div>
        </header>

        <div className="grid items-start gap-4 xl:grid-cols-[1.08fr_.92fr]">
          <article className="glass min-w-0 self-start rounded-2xl p-4 md:p-6">
            <div className="mb-4 flex items-center justify-between gap-4 md:mb-5">
              <div>
                <h2 className="font-display text-lg font-bold text-white md:text-xl">Private swap</h2>
              </div>
              <span className="material-symbols-outlined rounded-lg bg-primary/10 p-2 text-xl text-primary">encrypted</span>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-container-lowest p-1.5">
              {(["hfUSD-A", "hfUSD-B"] as const).map((token) => (
                <button
                  className={`min-w-0 rounded-lg px-2 py-2.5 text-xs font-bold transition md:px-4 md:py-3 ${side === token ? "bg-primary text-on-primary shadow-glow" : "text-on-surface-variant hover:bg-white/5"}`}
                  key={token}
                  onClick={() => setSide(token)}
                  type="button"
                >
                  Sell {token}
                </button>
              ))}
            </div>

            <label className="mt-4 block font-mono text-[10px] uppercase tracking-[0.13em] text-on-surface-variant md:mt-5" htmlFor="phantom-amount">
              Private amount
            </label>
            <div className="mt-2 flex items-center rounded-xl border border-white/10 bg-surface-container-lowest px-4 transition focus-within:border-primary/70 focus-within:ring-1 focus-within:ring-primary/20">
              <input
                className="min-w-0 flex-1 bg-transparent py-3.5 font-mono text-xl text-white outline-none focus-visible:outline-none md:text-2xl"
                id="phantom-amount"
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                value={amount}
              />
              <span className="shrink-0 text-xs font-bold text-primary sm:text-sm md:text-base">{side}</span>
            </div>
            <label className="mt-4 block font-mono text-[10px] uppercase tracking-[0.13em] text-on-surface-variant md:mt-5" htmlFor="phantom-route-cap">
              Maximum public clip
            </label>
            <div className="mt-2 flex items-center rounded-xl border border-white/10 bg-surface-container-lowest px-4 transition focus-within:border-primary/70 focus-within:ring-1 focus-within:ring-primary/20">
              <input
                className="min-w-0 flex-1 bg-transparent py-3.5 font-mono text-xl text-white outline-none focus-visible:outline-none md:text-2xl"
                id="phantom-route-cap"
                inputMode="decimal"
                onChange={(event) => setMaxPublicClip(event.target.value)}
                placeholder="0.00"
                value={maxPublicClip}
              />
              <span className="shrink-0 text-xs font-bold text-primary sm:text-sm md:text-base">PRIVATE</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-on-surface-variant">
              Only this amount may reach the public pool.
            </p>

            {!isConnected ? (
              <button
                className="mt-5 w-full rounded-xl bg-primary px-5 py-3.5 text-xs font-extrabold uppercase tracking-[0.12em] text-on-primary disabled:opacity-50"
                disabled={isConnecting}
                onClick={() => connectors[0] && connect({ connector: connectors[0] })}
                type="button"
              >
                {isConnecting ? "Connecting…" : "Connect wallet"}
              </button>
            ) : wrongNetwork ? (
              <button
                className="mt-5 w-full rounded-xl bg-primary px-5 py-3.5 text-xs font-extrabold uppercase tracking-[0.12em] text-on-primary disabled:opacity-50"
                disabled={isSwitching}
                onClick={() => switchChain({ chainId: sepolia.id })}
                type="button"
              >
                {isSwitching ? "Switching…" : "Switch to Ethereum Sepolia"}
              </button>
            ) : (
              <button
                className="mt-5 w-full rounded-xl bg-primary px-5 py-3.5 text-xs font-extrabold uppercase tracking-[0.12em] text-on-primary shadow-glow transition hover:bg-primary-fixed disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canSubmit || isEncrypting || isSubmitting}
                onClick={submitPrivateIntent}
                type="button"
              >
                {alreadySubmitted ? "Intent already sealed" : isEncrypting ? "Encrypting with Nox…" : isSubmitting ? "Confirming…" : "Encrypt & submit intent"}
              </button>
            )}

            {!phantomBatchAddress && (
              <p className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-100">
                Set NEXT_PUBLIC_PHANTOM_BATCH_ADDRESS after deploying the Nox contract to enable live submissions.
              </p>
            )}
            {notice && <div className="mt-3"><TransactionNotice href={hash ? `https://sepolia.etherscan.io/tx/${hash}` : undefined} {...notice} /></div>}
            {hash && <p className="break-all font-mono text-[11px] text-primary">tx {hash}</p>}
          </article>

          <div className="min-w-0 space-y-4">
            <article className="glass rounded-2xl p-4 md:p-5">
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-on-surface-variant">Batch status</p>
                <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_rgba(78,222,163,.9)]" />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-surface-container-lowest p-3"><dt className="text-[11px] text-on-surface-variant">Intents</dt><dd className="mt-1.5 font-mono text-xl text-white">{batch?.[2]?.toString() ?? "—"}</dd></div>
                <div className="rounded-xl bg-surface-container-lowest p-3"><dt className="text-[11px] text-on-surface-variant">Time left</dt><dd className="mt-1.5 font-mono text-sm text-primary">{phaseIndex === 0 ? formatCountdown(secondsRemaining) : "closed"}</dd></div>
                <div className="col-span-2 rounded-xl bg-surface-container-lowest p-3"><dt className="text-[11px] text-on-surface-variant">Your receipt</dt><dd className="mt-1.5 font-mono text-xs text-white">{alreadySubmitted ? "ACL-granted · decryptable only by you" : "No intent in this batch"}</dd></div>
                <div className="col-span-2 rounded-xl bg-surface-container-lowest p-3"><dt className="text-[11px] text-on-surface-variant">Route</dt><dd className="mt-1.5 font-mono text-xs text-primary">{executedRoute}</dd></div>
                <div className="col-span-2 rounded-xl bg-surface-container-lowest p-3"><dt className="text-[11px] text-on-surface-variant">Public amount</dt><dd className="mt-1.5 font-mono text-xs text-primary">{publicDisclosure}</dd></div>
              </dl>
              {isOwner && (
                <div className="mt-5 border-t border-white/10 pt-5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-on-surface-variant">Owner lifecycle controls</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {phaseIndex === 0 && (
                      <button className="rounded-lg border border-primary/30 px-3 py-3 text-xs font-bold text-primary disabled:opacity-40" disabled={isSubmitting} onClick={() => manageBatch("seal")} type="button">Seal now</button>
                    )}
                    {(phaseIndex === 0 || phaseIndex === 1) && (
                      <button className="rounded-lg border border-red-300/30 px-3 py-3 text-xs font-bold text-red-200 disabled:opacity-40" disabled={isSubmitting} onClick={() => manageBatch("cancel")} type="button">Cancel batch</button>
                    )}
                    {(phaseIndex === 2 || phaseIndex === 3) && (
                      <button className="col-span-2 rounded-lg bg-primary px-3 py-3 text-xs font-extrabold uppercase tracking-[0.12em] text-on-primary disabled:opacity-40" disabled={isSubmitting} onClick={() => manageBatch("open")} type="button">Open next one-hour batch</button>
                    )}
                  </div>
                </div>
              )}
            </article>

            <article className="rounded-2xl border border-primary/25 bg-primary/10 p-4 md:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold text-white">125 private → 20 routed</h2>
                </div>
                <span className="material-symbols-outlined text-2xl text-primary">verified</span>
              </div>
              <div className="mt-4 grid gap-2 text-[11px] sm:grid-cols-3">
                {[
                  ["Encrypted intent", liveConfidentialRouteProof.intentTx],
                  ["HookFlow swap", liveConfidentialRouteProof.swapTx],
                  ["Proof recorded", liveConfidentialRouteProof.executionTx]
                ].map(([label, transaction]) => (
                  <Link className="rounded-lg border border-primary/20 bg-background/50 px-2.5 py-2.5 text-center font-bold text-primary hover:border-primary/50" href={`https://sepolia.etherscan.io/tx/${transaction}`} key={label} target="_blank">
                    {label} ↗
                  </Link>
                ))}
              </div>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function PhantomBatchPage() {
  return <Providers><PhantomBatchContent /></Providers>;
}
