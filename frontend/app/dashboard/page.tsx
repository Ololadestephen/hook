"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useBlockNumber } from "wagmi";
import {
  hookFlowDemoMarket,
  hookFlowDeployment,
  isHookFlowConfigured,
  liveHookFlowContracts
} from "../../lib/contracts";
import { AppNav } from "../components/AppNav";
import { Providers } from "../providers";

function shortValue(value: string) {
  return value.length > 30 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function addressUrl(address: string) {
  return `${hookFlowDeployment.explorerBaseUrl}/address/${address}`;
}

function DashboardContent() {
  const { data: blockNumber } = useBlockNumber({
    chainId: hookFlowDeployment.chainId,
    query: { refetchInterval: 12_000 }
  });
  const blockLabel = useMemo(() => blockNumber?.toLocaleString() ?? "connecting", [blockNumber]);
  const contracts = [
    ["Canonical v4 PoolManager", hookFlowDeployment.poolManager, true],
    ["HookFlow hook", hookFlowDeployment.hook, isHookFlowConfigured],
    ["Atomic liquidity router", hookFlowDeployment.liquidityRouter, isHookFlowConfigured],
    ["Exact-input swap router", hookFlowDeployment.swapRouter, isHookFlowConfigured],
    ["Phantom Batch", liveHookFlowContracts.phantomBatch, true],
    ["NoxCompute", "0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf", true],
    ["Demo hfUSD-A", hookFlowDemoMarket.token0, true],
    ["Demo hfUSD-B", hookFlowDemoMarket.token1, true]
  ] as const;

  return (
    <main className="min-h-screen bg-background pb-24 text-on-background lg:pb-0 lg:pl-[250px]">
      <AppNav active="dashboard" />
      <section className="px-4 py-4 md:px-8 md:py-6">
        <div className="mx-auto max-w-6xl">
          <header className="mb-5 flex flex-col gap-4 border-b border-outline-variant/60 pb-5 md:mb-6 md:flex-row md:items-end md:justify-between md:pb-6">
            <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.035em] md:text-[34px]">Dashboard</h1>
            <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 md:px-5 md:py-4"><p className="text-[10px] uppercase tracking-wider text-on-surface-variant md:text-xs">Ethereum Sepolia RPC</p><p className="mt-1.5 font-mono text-lg text-primary md:mt-2 md:text-xl">Block {blockLabel}</p></div>
          </header>

          <section className="mb-5 grid gap-3 md:mb-6 md:grid-cols-3 md:gap-4">
            {[
              ["add_chart", "Pool creation", "Atomic"],
              ["shield", "Protection", "4 presets"],
              ["encrypted", "Private routing", "Nox native"]
            ].map(([icon, label, value]) => (
              <article className="group rounded-2xl border border-outline-variant bg-surface-container-low p-4 transition hover:border-primary/30 md:p-5" key={label}>
                <div className="flex items-center justify-between"><p className="text-xs uppercase tracking-wider text-on-surface-variant">{label}</p><span className="material-symbols-outlined text-xl text-primary/70 transition group-hover:text-primary">{icon}</span></div>
                <p className="mt-2.5 text-xl font-bold text-primary md:mt-3 md:text-2xl">{value}</p>
              </article>
            ))}
          </section>

          <section className="mb-6 rounded-xl border border-primary/25 bg-gradient-to-r from-primary/15 to-transparent p-5 md:p-6">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h2 className="font-display text-lg font-bold leading-7 md:text-xl">125 private → 20 routed</h2>
                <p className="mt-2 text-sm text-on-surface-variant">Verified with Nox on Sepolia.</p>
              </div>
              <div className="grid min-w-52 gap-2 text-xs">
                <Link className="rounded-lg bg-primary px-4 py-3 text-center font-bold text-on-primary" href={`${hookFlowDeployment.explorerBaseUrl}/tx/${hookFlowDemoMarket.routedSwapTx}`} target="_blank">View real swap ↗</Link>
                <Link className="rounded-lg border border-primary/30 px-4 py-3 text-center font-bold text-primary" href={`${hookFlowDeployment.explorerBaseUrl}/tx/${hookFlowDemoMarket.executionProofTx}`} target="_blank">View Nox proof ↗</Link>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <details className="rounded-2xl border border-outline-variant bg-surface-container-low p-5 md:p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3"><h2 className="font-display text-lg font-bold md:text-xl">Sepolia contracts</h2><span className={`rounded-full px-3 py-1 text-xs font-bold ${isHookFlowConfigured ? "bg-primary/15 text-primary" : "bg-amber-300/10 text-amber-100"}`}>{isHookFlowConfigured ? "APP READY" : "DEPLOYMENT PENDING"}</span></summary>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{contracts.map(([label, value, active]) => <div className="rounded-xl border border-outline-variant bg-background/50 p-4" key={label}><div className="flex items-start justify-between gap-3"><p className="text-[10px] font-bold uppercase leading-4 tracking-wider text-on-surface-variant">{label}</p><span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-primary shadow-[0_0_8px_rgba(78,222,163,.8)]" : "bg-amber-200"}`} /></div><code className={`mt-3 block text-xs ${active ? "text-white" : "text-amber-100"}`} title={value}>{active ? shortValue(value) : "Address required"}</code>{active && <Link className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline" href={addressUrl(value)} target="_blank">View contract <span aria-hidden>↗</span></Link>}</div>)}</div>
            </details>

            <aside className="grid gap-6 md:grid-cols-2">
              <article className="rounded-2xl border border-primary/20 bg-primary/10 p-5 md:p-6"><span className="material-symbols-outlined text-xl text-primary">rocket_launch</span><h2 className="mt-4 font-display text-xl font-bold">{isHookFlowConfigured ? "Create a protected pool" : "Deploy HookFlow"}</h2><Link className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-primary" href={isHookFlowConfigured ? "/create" : "https://sepolia.etherscan.io"}>{isHookFlowConfigured ? "Create pool" : "Open Sepolia"}<span aria-hidden>→</span></Link></article>
              <article className="rounded-2xl border border-outline-variant bg-surface-container-low p-5 md:p-6"><span className="material-symbols-outlined text-xl text-primary">hub</span><h2 className="mt-4 font-display text-xl font-bold">PoolManager</h2><p className="mt-2 text-sm text-on-surface-variant">Uniswap v4 · Sepolia</p><code className="mt-4 block rounded-xl bg-background/60 p-3 text-xs text-white">{shortValue(hookFlowDeployment.poolManager)}</code><Link className="mt-4 inline-flex text-xs font-semibold text-primary hover:underline" href="/phantom">Open Phantom Router →</Link></article>
            </aside>
          </section>
        </div>
      </section>
    </main>
  );
}

export default function DashboardPage() {
  return <Providers><DashboardContent /></Providers>;
}
