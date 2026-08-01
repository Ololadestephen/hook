"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseUnits, zeroHash, type Address } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract
} from "wagmi";
import {
  erc20ApprovalAbi,
  hookFlowLiquidityRouterAbi,
  liquidityForAmounts,
  txUrl,
  verifiedHookDefaults
} from "../../lib/createPool";
import { hookFlowDeployment } from "../../lib/contracts";
import { compactLiquidity, getManagedPools, type ManagedPool } from "../../lib/managePools";
import { hookFlowChain } from "../../lib/wagmi";
import { AppNav } from "../components/AppNav";
import { TransactionNotice, type TransactionTone } from "../components/TransactionNotice";
import { Providers } from "../providers";

type ManageMode = "add" | "remove" | "fees";
type TransactionAction = "idle" | "approve0" | "approve1" | "add" | "remove" | "fees";

function shortHash(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function parseTokenAmount(value: string, decimals: number) {
  try {
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
}

function friendlyPoolError(error: Error) {
  const message = error.message.toLowerCase();
  if (message.includes("reject") || message.includes("denied")) return "Transaction cancelled in your wallet.";
  if (message.includes("allowance") || message.includes("transferfrom")) return "Approve the required token amount before adding liquidity.";
  if (message.includes("insufficient funds")) return "You need more Sepolia ETH for gas or more test tokens.";
  if (message.includes("amount0exceeded") || message.includes("amount1exceeded")) return "The position needs more tokens than the entered maximum. Increase the amount or try again.";
  return "The transaction reverted. Check your balance, approvals, and selected pool.";
}

function PoolsContent() {
  const [pools, setPools] = useState<ManagedPool[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [mode, setMode] = useState<ManageMode>("add");
  const [amount0, setAmount0] = useState("1");
  const [amount1, setAmount1] = useState("0.001");
  const [removePercent, setRemovePercent] = useState(25);
  const [isLoadingPools, setIsLoadingPools] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [transactionAction, setTransactionAction] = useState<TransactionAction>("idle");

  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: hookFlowChain.id });
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
    chainId: hookFlowChain.id
  });

  const wrongNetwork = isConnected && chainId !== hookFlowChain.id;
  const transactionBusy = isPending || isConfirming;
  const selectedPool = useMemo(
    () => pools.find((pool) => pool.poolId === selectedPoolId) ?? pools[0] ?? null,
    [pools, selectedPoolId]
  );
  const activePools = pools.filter((pool) => pool.liquidity > BigInt(0)).length;

  const loadPools = useCallback(async () => {
    if (!address || !publicClient) {
      setPools([]);
      return;
    }
    setIsLoadingPools(true);
    setLoadError("");
    try {
      const nextPools = await getManagedPools(publicClient, address);
      setPools(nextPools);
      setSelectedPoolId((current) => current && nextPools.some((pool) => pool.poolId === current)
        ? current
        : nextPools[0]?.poolId ?? null);
    } catch (poolError) {
      console.error(poolError);
      setLoadError("We couldn’t load your pools from Sepolia. Check your connection and try again.");
    } finally {
      setIsLoadingPools(false);
    }
  }, [address, publicClient]);

  useEffect(() => {
    void loadPools();
  }, [loadPools]);

  useEffect(() => {
    if (isConfirmed && hash) void loadPools();
  }, [hash, isConfirmed, loadPools]);

  const amount0Max = selectedPool ? parseTokenAmount(amount0, selectedPool.decimals0) : null;
  const amount1Max = selectedPool ? parseTokenAmount(amount1, selectedPool.decimals1) : null;
  const addLiquidity = selectedPool && amount0Max !== null && amount1Max !== null
    ? liquidityForAmounts(
        selectedPool.sqrtPriceX96,
        selectedPool.tickLower,
        selectedPool.tickUpper,
        amount0Max,
        amount1Max
      )
    : null;
  const removeLiquidity = selectedPool
    ? (selectedPool.liquidity * BigInt(removePercent)) / BigInt(100)
    : BigInt(0);

  const transactionNotice: { message: string; title: string; tone: TransactionTone } = error
    ? { title: "Transaction didn’t go through", message: friendlyPoolError(error), tone: "error" }
    : isConfirmed
      ? transactionAction === "add"
        ? { title: "Liquidity added", message: "Your position has been updated on Sepolia.", tone: "success" }
        : transactionAction === "remove"
          ? { title: "Liquidity removed", message: "The withdrawn tokens were sent to your wallet.", tone: "success" }
          : transactionAction === "fees"
            ? { title: "Fees collected", message: "Accrued pool fees were sent to your wallet.", tone: "success" }
            : { title: "Token approved", message: "You can now continue with your liquidity transaction.", tone: "success" }
      : isConfirming
        ? { title: "Confirming on Sepolia", message: "Your pool update is almost complete.", tone: "pending" }
        : isPending
          ? { title: "Check your wallet", message: "Confirm the pool transaction to continue.", tone: "pending" }
          : { title: "Ready", message: "Choose an action for this liquidity position.", tone: "neutral" };

  function approveToken(token: Address, amount: bigint, tokenNumber: 0 | 1) {
    setTransactionAction(tokenNumber === 0 ? "approve0" : "approve1");
    writeContract({
      address: token,
      abi: erc20ApprovalAbi,
      functionName: "approve",
      args: [verifiedHookDefaults.liquidityRouter, amount],
      chainId: hookFlowChain.id
    });
  }

  function modifyPool(liquidityDelta: bigint, max0: bigint, max1: bigint, action: TransactionAction) {
    if (!selectedPool) return;
    setTransactionAction(action);
    writeContract({
      address: hookFlowDeployment.liquidityRouter,
      abi: hookFlowLiquidityRouterAbi,
      functionName: "modifyLiquidity",
      args: [
        selectedPool.key,
        {
          tickLower: selectedPool.tickLower,
          tickUpper: selectedPool.tickUpper,
          liquidityDelta,
          salt: zeroHash
        },
        max0,
        max1,
        BigInt(Math.floor(Date.now() / 1000) + 20 * 60),
        "0x"
      ],
      chainId: hookFlowChain.id
    });
  }

  return (
    <main className="min-h-screen bg-background pb-24 text-on-background lg:pb-0 lg:pl-[250px]">
      <AppNav active="pools" />
      <section className="px-4 py-4 md:px-8 md:py-6">
        <div className="mx-auto max-w-6xl">
          <header className="mb-5 flex flex-col gap-4 border-b border-outline-variant/60 pb-5 md:mb-6 md:flex-row md:items-end md:justify-between md:pb-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Liquidity</p>
              <h1 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-[-0.035em] md:text-[34px]">My pools</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {wrongNetwork && (
                <button className="rounded-xl bg-primary px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-primary" disabled={isSwitching} onClick={() => switchChain({ chainId: hookFlowChain.id })}>
                  {isSwitching ? "Switching…" : "Switch to Sepolia"}
                </button>
              )}
              {isConnected ? (
                <>
                  <button className="rounded-xl border border-outline-variant px-4 py-3 text-xs font-bold uppercase tracking-wider transition hover:border-primary/40" disabled={isLoadingPools} onClick={() => void loadPools()}>
                    {isLoadingPools ? "Loading…" : "Refresh"}
                  </button>
                  <button className="rounded-xl border border-outline-variant px-4 py-3 text-xs font-bold uppercase tracking-wider" onClick={() => disconnect()}>Disconnect</button>
                </>
              ) : (
                <button className="rounded-xl bg-primary px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-primary" disabled={isConnecting || !connectors[0]} onClick={() => connectors[0] && connect({ connector: connectors[0] })}>
                  {isConnecting ? "Connecting…" : "Connect wallet"}
                </button>
              )}
            </div>
          </header>

          {!isConnected ? (
            <article className="grid min-h-[360px] place-items-center rounded-2xl border border-outline-variant/60 bg-surface-container-low p-6 text-center">
              <div className="max-w-sm">
                <span className="material-symbols-outlined grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-3xl text-primary mx-auto">account_balance_wallet</span>
                <h2 className="mt-5 font-display text-xl font-bold text-white">Connect your wallet</h2>
                <p className="mt-2 text-sm leading-6 text-on-surface-variant">Use the wallet that created your HookFlow pools.</p>
                <button className="mt-5 rounded-xl bg-primary px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-on-primary" disabled={isConnecting || !connectors[0]} onClick={() => connectors[0] && connect({ connector: connectors[0] })}>Connect wallet</button>
              </div>
            </article>
          ) : loadError ? (
            <article className="rounded-2xl border border-error/25 bg-error/5 p-6">
              <h2 className="font-display text-xl font-bold text-white">Pools unavailable</h2>
              <p className="mt-2 text-sm text-on-surface-variant">{loadError}</p>
              <button className="mt-4 rounded-xl border border-error/30 px-4 py-2.5 text-xs font-bold text-error" onClick={() => void loadPools()}>Try again</button>
            </article>
          ) : isLoadingPools && pools.length === 0 ? (
            <article className="grid min-h-[320px] place-items-center rounded-2xl border border-outline-variant/60 bg-surface-container-low p-6 text-center">
              <div><span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span><p className="mt-3 text-sm text-on-surface-variant">Finding your Sepolia pools…</p></div>
            </article>
          ) : pools.length === 0 ? (
            <article className="grid min-h-[360px] place-items-center rounded-2xl border border-outline-variant/60 bg-surface-container-low p-6 text-center">
              <div className="max-w-sm">
                <span className="material-symbols-outlined grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-3xl text-primary mx-auto">waterfall_chart</span>
                <h2 className="mt-5 font-display text-xl font-bold text-white">No pools yet</h2>
                <p className="mt-2 text-sm leading-6 text-on-surface-variant">Pools created with this wallet will appear here.</p>
                <Link className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-on-primary" href="/create">Create a pool <span className="material-symbols-outlined text-base">arrow_forward</span></Link>
              </div>
            </article>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between rounded-2xl border border-outline-variant/60 bg-surface-container-low px-4 py-3.5 md:px-5">
                <p className="text-sm font-semibold text-white">{pools.length} {pools.length === 1 ? "pool" : "pools"}</p>
                <p className="font-mono text-xs text-primary">{activePools} active</p>
              </div>

              <div className="grid items-start gap-4 lg:grid-cols-[.9fr_1.1fr] lg:gap-6">
                <div className="space-y-3">
                  {pools.map((pool) => {
                    const selected = pool.poolId === selectedPool?.poolId;
                    const active = pool.liquidity > BigInt(0);
                    return (
                      <button
                        className={`w-full rounded-2xl border p-4 text-left transition md:p-5 ${selected ? "border-primary/50 bg-primary/[0.08] shadow-glow" : "border-outline-variant/60 bg-surface-container-low hover:border-primary/25"}`}
                        key={pool.poolId}
                        onClick={() => setSelectedPoolId(pool.poolId)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0"><h2 className="truncate font-display text-lg font-bold text-white">{pool.symbol0} / {pool.symbol1}</h2><p className="mt-1 text-xs text-on-surface-variant">{pool.presetLabel}</p></div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider ${active ? "bg-primary/10 text-primary" : "bg-white/5 text-on-surface-variant"}`}>{active ? "Active" : "Exited"}</span>
                        </div>
                        <div className="mt-4 flex items-end justify-between gap-3 border-t border-outline-variant/60 pt-4">
                          <div><p className="text-[10px] uppercase tracking-wider text-on-surface-variant">Liquidity</p><p className="mt-1 font-mono text-sm text-white">{compactLiquidity(pool.liquidity)}</p></div>
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">Manage <span className="material-symbols-outlined text-base">arrow_forward</span></span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedPool && (
                  <article className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] to-surface-container-low p-4 md:p-6 lg:sticky lg:top-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary">Manage position</p><h2 className="mt-2 truncate font-display text-xl font-bold text-white">{selectedPool.symbol0} / {selectedPool.symbol1}</h2></div>
                      <a className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-outline-variant text-primary transition hover:border-primary/40" href={txUrl(selectedPool.transactionHash)} rel="noreferrer" target="_blank" title="View pool creation"><span className="material-symbols-outlined text-lg">open_in_new</span></a>
                    </div>

                    <dl className="mt-5 grid grid-cols-2 gap-2.5 text-xs">
                      <div className="rounded-xl bg-background/45 p-3"><dt className="text-on-surface-variant">Liquidity</dt><dd className="mt-1.5 break-all font-mono text-white">{compactLiquidity(selectedPool.liquidity)}</dd></div>
                      <div className="rounded-xl bg-background/45 p-3"><dt className="text-on-surface-variant">Current tick</dt><dd className="mt-1.5 font-mono text-white">{selectedPool.tick.toLocaleString()}</dd></div>
                      <div className="col-span-2 rounded-xl bg-background/45 p-3"><dt className="text-on-surface-variant">Pool ID</dt><dd className="mt-1.5 font-mono text-white">{shortHash(selectedPool.poolId)}</dd></div>
                    </dl>

                    <div className="mt-5 grid grid-cols-3 rounded-xl border border-outline-variant bg-background/50 p-1">
                      {(["add", "remove", "fees"] as const).map((option) => (
                        <button className={`rounded-lg px-2 py-2.5 text-xs font-bold capitalize transition ${mode === option ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-white"}`} key={option} onClick={() => setMode(option)}>{option === "fees" ? "Collect" : option}</button>
                      ))}
                    </div>

                    {mode === "add" && (
                      <div className="mt-5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{selectedPool.symbol0} maximum<div className="mt-2 flex items-center rounded-xl border border-outline-variant bg-background/60 px-3 focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/20"><input className="min-w-0 flex-1 bg-transparent py-3 font-mono text-base text-white outline-none" inputMode="decimal" onChange={(event) => setAmount0(event.target.value)} value={amount0} /></div></label>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{selectedPool.symbol1} maximum<div className="mt-2 flex items-center rounded-xl border border-outline-variant bg-background/60 px-3 focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/20"><input className="min-w-0 flex-1 bg-transparent py-3 font-mono text-base text-white outline-none" inputMode="decimal" onChange={(event) => setAmount1(event.target.value)} value={amount1} /></div></label>
                        </div>
                        <p className="mt-3 text-xs text-on-surface-variant">Position liquidity: <span className="font-mono text-primary">{addLiquidity?.toString() ?? "Enter valid amounts"}</span></p>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          <button className="rounded-xl border border-primary/30 px-3 py-3 text-xs font-bold text-primary disabled:opacity-40" disabled={transactionBusy || wrongNetwork || amount0Max === null || amount0Max <= BigInt(0)} onClick={() => amount0Max !== null && approveToken(selectedPool.key.currency0, amount0Max, 0)}>Approve {selectedPool.symbol0}</button>
                          <button className="rounded-xl border border-primary/30 px-3 py-3 text-xs font-bold text-primary disabled:opacity-40" disabled={transactionBusy || wrongNetwork || amount1Max === null || amount1Max <= BigInt(0)} onClick={() => amount1Max !== null && approveToken(selectedPool.key.currency1, amount1Max, 1)}>Approve {selectedPool.symbol1}</button>
                        </div>
                        <button className="mt-2 w-full rounded-xl bg-primary px-4 py-3.5 text-xs font-extrabold uppercase tracking-wider text-on-primary disabled:opacity-40" disabled={transactionBusy || wrongNetwork || !addLiquidity || amount0Max === null || amount1Max === null} onClick={() => addLiquidity && amount0Max !== null && amount1Max !== null && modifyPool(addLiquidity, amount0Max, amount1Max, "add")}>Add liquidity</button>
                      </div>
                    )}

                    {mode === "remove" && (
                      <div className="mt-5">
                        <p className="text-sm text-on-surface-variant">Choose how much of this position to withdraw.</p>
                        <div className="mt-4 grid grid-cols-4 gap-2">{[25, 50, 75, 100].map((percent) => <button className={`rounded-xl border px-2 py-3 text-xs font-bold transition ${removePercent === percent ? "border-primary bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant"}`} key={percent} onClick={() => setRemovePercent(percent)}>{percent}%</button>)}</div>
                        <div className="mt-4 rounded-xl bg-background/45 p-4"><p className="text-xs text-on-surface-variant">Liquidity to remove</p><p className="mt-2 break-all font-mono text-sm text-white">{removeLiquidity.toString()}</p></div>
                        <button className="mt-3 w-full rounded-xl bg-primary px-4 py-3.5 text-xs font-extrabold uppercase tracking-wider text-on-primary disabled:opacity-40" disabled={transactionBusy || wrongNetwork || removeLiquidity <= BigInt(0)} onClick={() => modifyPool(-removeLiquidity, BigInt(0), BigInt(0), "remove")}>Remove {removePercent}%</button>
                      </div>
                    )}

                    {mode === "fees" && (
                      <div className="mt-5">
                        <div className="rounded-xl border border-primary/15 bg-primary/[0.06] p-4"><span className="material-symbols-outlined text-xl text-primary">savings</span><h3 className="mt-3 font-display text-lg font-bold text-white">Collect earned fees</h3><p className="mt-1 text-sm leading-6 text-on-surface-variant">This claims available fees without changing your liquidity.</p></div>
                        <button className="mt-3 w-full rounded-xl bg-primary px-4 py-3.5 text-xs font-extrabold uppercase tracking-wider text-on-primary disabled:opacity-40" disabled={transactionBusy || wrongNetwork || selectedPool.liquidity <= BigInt(0)} onClick={() => modifyPool(BigInt(0), BigInt(0), BigInt(0), "fees")}>Collect fees</button>
                      </div>
                    )}

                    <div className="mt-5"><TransactionNotice href={hash ? txUrl(hash) : undefined} {...transactionNotice} /></div>
                  </article>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default function PoolsPage() {
  return <Providers><PoolsContent /></Providers>;
}
