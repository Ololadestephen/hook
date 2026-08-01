"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { isAddress, parseUnits, zeroHash, type Address } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract
} from "wagmi";
import {
  DEFAULT_TICK_SPACING,
  erc20ApprovalAbi,
  erc20MetadataAbi,
  hookFlowLiquidityRouterAbi,
  liquidityForAmounts,
  poolIdFor,
  poolKeyFor,
  presetOptions,
  sortTokenAddresses,
  sqrtPriceX96FromHumanPrice,
  txUrl,
  verifiedHookDefaults
} from "../../lib/createPool";
import { hookFlowDemoMarket, isHookFlowConfigured, sepoliaContracts } from "../../lib/contracts";
import { hookFlowChain } from "../../lib/wagmi";
import { AppNav } from "../components/AppNav";
import { TransactionNotice, type TransactionTone } from "../components/TransactionNotice";
import { Providers } from "../providers";

const USDC = verifiedHookDefaults.token0;
const WETH = verifiedHookDefaults.token1;
const FULL_RANGE_LOWER = "-887220";
const FULL_RANGE_UPPER = "887220";

const tokenOptions = [
  { id: "usdc", symbol: "USDC", name: "USD Coin", address: sepoliaContracts.usdc, decimals: 6, accent: "bg-blue-400/15 text-blue-200" },
  { id: "weth", symbol: "WETH", name: "Wrapped Ether", address: sepoliaContracts.weth, decimals: 18, accent: "bg-violet-400/15 text-violet-200" },
  { id: "hfusd-a", symbol: hookFlowDemoMarket.token0Symbol, name: "HookFlow demo A", address: hookFlowDemoMarket.token0, decimals: 6, accent: "bg-primary/15 text-primary" },
  { id: "hfusd-b", symbol: hookFlowDemoMarket.token1Symbol, name: "HookFlow demo B", address: hookFlowDemoMarket.token1, decimals: 6, accent: "bg-emerald-300/15 text-emerald-100" }
] as const;

type TokenChoice = (typeof tokenOptions)[number]["id"] | "custom";

function knownTokenForAddress(address: string | undefined) {
  return tokenOptions.find((token) => token.address.toLowerCase() === address?.toLowerCase());
}

function shortValue(value: string) {
  return value.length > 30 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function metadataValue(value: unknown, fallback: string) {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function parseAmount(value: string, decimals: number) {
  try {
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
}

function friendlyError(error: Error) {
  const message = error.message.toLowerCase();
  if (message.includes("reject") || message.includes("denied")) return "Transaction cancelled in your wallet.";
  if (message.includes("allowance")) return "Approve both token amounts before launching the pool.";
  if (message.includes("already initialized") || message.includes("poolalreadyinitialized")) return "This exact pool already exists. Change the pair, hook, or tick spacing.";
  if (message.includes("amount0exceeded") || message.includes("amount1exceeded")) return "The calculated position needs more tokens than your maxima. Reduce liquidity or widen the limits.";
  if (message.includes("insufficient funds")) return "Not enough Sepolia ETH for gas or not enough test tokens.";
  return "The launch reverted. Recheck token addresses, approvals, price, range, and deployment configuration.";
}

type TokenPickerProps = {
  address: string;
  amount: string;
  choice: TokenChoice;
  label: string;
  otherAddress: string;
  onAddressChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onChoiceChange: (value: TokenChoice) => void;
};

function TokenPicker({ address, amount, choice, label, otherAddress, onAddressChange, onAmountChange, onChoiceChange }: TokenPickerProps) {
  const selectedToken = knownTokenForAddress(address);
  const customAddressValid = choice !== "custom" || address.length === 0 || isAddress(address);

  return (
    <section className="min-w-0 rounded-2xl border border-outline-variant bg-background/45 p-3.5 transition focus-within:border-primary/50 md:p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">{label}</p>
        {selectedToken && <span className={`grid h-8 w-8 place-items-center rounded-full text-[10px] font-extrabold ${selectedToken.accent}`}>{selectedToken.symbol.slice(0, 2)}</span>}
      </div>

      <label className="mt-3 block">
        <span className="sr-only">Select {label}</span>
        <select
          className="w-full appearance-none truncate rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-3 text-sm font-semibold text-white outline-none transition focus:border-primary md:px-4"
          onChange={(event) => onChoiceChange(event.target.value as TokenChoice)}
          value={choice}
        >
          {tokenOptions.map((token) => (
            <option disabled={token.address.toLowerCase() === otherAddress.toLowerCase()} key={token.id} value={token.id}>
              {token.symbol} · {token.name}
            </option>
          ))}
          <option value="custom">Custom token · paste address</option>
        </select>
      </label>

      {choice === "custom" ? (
        <label className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
          ERC-20 contract address
          <input
            aria-invalid={!customAddressValid}
            className={`mt-2 w-full rounded-xl border bg-surface-container-lowest px-3 py-3 font-mono text-xs text-white outline-none ${customAddressValid ? "border-outline-variant focus:border-primary" : "border-error/60 focus:border-error"}`}
            onChange={(event) => onAddressChange(event.target.value.trim())}
            placeholder="0x…"
            value={address}
          />
          {!customAddressValid && address && <span className="mt-2 block normal-case tracking-normal text-error">Enter a valid Ethereum address.</span>}
        </label>
      ) : (
        <p className="mt-3 truncate font-mono text-[10px] text-on-surface-variant" title={address}>{shortValue(address)}</p>
      )}

      <label className="mt-4 block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
        Maximum deposit
        <div className="mt-2 flex items-center rounded-xl border border-outline-variant bg-surface-container-lowest px-4 focus-within:border-primary">
          <input className="min-w-0 flex-1 bg-transparent py-3.5 font-mono text-base text-white outline-none md:text-lg" inputMode="decimal" onChange={(event) => onAmountChange(event.target.value)} value={amount} />
          <span className="ml-3 text-xs font-bold text-primary">{selectedToken?.symbol ?? "TOKEN"}</span>
        </div>
      </label>
    </section>
  );
}

function CreatePoolContent() {
  const [tokenAChoice, setTokenAChoice] = useState<TokenChoice>("usdc");
  const [tokenBChoice, setTokenBChoice] = useState<TokenChoice>("weth");
  const [tokenA, setTokenA] = useState<string>(USDC);
  const [tokenB, setTokenB] = useState<string>(WETH);
  const [tokenAAmount, setTokenAAmount] = useState("10");
  const [tokenBAmount, setTokenBAmount] = useState("0.003");
  const [initialPrice, setInitialPrice] = useState("0.000333333333333333");
  const [tickLower, setTickLower] = useState(FULL_RANGE_LOWER);
  const [tickUpper, setTickUpper] = useState(FULL_RANGE_UPPER);
  const [liquidityOverride, setLiquidityOverride] = useState("");
  const [preset, setPreset] = useState<(typeof presetOptions)[number]["value"]>(1);
  const [transactionKind, setTransactionKind] = useState<"idle" | "approval" | "launch">("idle");
  const [transactionLabel, setTransactionLabel] = useState("Token");

  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
    chainId: hookFlowChain.id
  });

  const sortedTokens = useMemo(() => sortTokenAddresses(tokenA, tokenB), [tokenA, tokenB]);
  const metadataContracts = sortedTokens
    ? ([
        { address: sortedTokens.token0, abi: erc20MetadataAbi, functionName: "symbol", chainId: hookFlowChain.id },
        { address: sortedTokens.token0, abi: erc20MetadataAbi, functionName: "decimals", chainId: hookFlowChain.id },
        { address: sortedTokens.token1, abi: erc20MetadataAbi, functionName: "symbol", chainId: hookFlowChain.id },
        { address: sortedTokens.token1, abi: erc20MetadataAbi, functionName: "decimals", chainId: hookFlowChain.id }
      ] as const)
    : undefined;
  const { data: metadata } = useReadContracts({
    contracts: metadataContracts,
    query: { enabled: Boolean(metadataContracts) }
  });

  const knownToken0 = knownTokenForAddress(sortedTokens?.token0);
  const knownToken1 = knownTokenForAddress(sortedTokens?.token1);
  const symbol0 = metadataValue(metadata?.[0]?.result, knownToken0?.symbol ?? "TOKEN0");
  const decimals0 = Number(metadataValue(metadata?.[1]?.result, String(knownToken0?.decimals ?? 18)));
  const symbol1 = metadataValue(metadata?.[2]?.result, knownToken1?.symbol ?? "TOKEN1");
  const decimals1 = Number(metadataValue(metadata?.[3]?.result, String(knownToken1?.decimals ?? 18)));
  const tokenASymbol = knownTokenForAddress(tokenA)?.symbol ?? (isAddress(tokenA) && sortedTokens ? (tokenA.toLowerCase() === sortedTokens.token0.toLowerCase() ? symbol0 : symbol1) : "TOKEN A");
  const tokenBSymbol = knownTokenForAddress(tokenB)?.symbol ?? (isAddress(tokenB) && sortedTokens ? (tokenB.toLowerCase() === sortedTokens.token0.toLowerCase() ? symbol0 : symbol1) : "TOKEN B");
  const tokenADecimals = sortedTokens && tokenA.toLowerCase() === sortedTokens.token0.toLowerCase() ? decimals0 : decimals1;
  const tokenBDecimals = sortedTokens && tokenB.toLowerCase() === sortedTokens.token0.toLowerCase() ? decimals0 : decimals1;
  const amountA = parseAmount(tokenAAmount, tokenADecimals);
  const amountB = parseAmount(tokenBAmount, tokenBDecimals);
  const maxAmounts = sortedTokens && amountA !== null && amountB !== null
    ? tokenA.toLowerCase() === sortedTokens.token0.toLowerCase()
      ? { amount0: amountA, amount1: amountB }
      : { amount0: amountB, amount1: amountA }
    : null;
  const sqrtPriceX96 = sqrtPriceX96FromHumanPrice(initialPrice, decimals0, decimals1);
  const parsedTickLower = Number(tickLower);
  const parsedTickUpper = Number(tickUpper);
  const ticksValid = Number.isInteger(parsedTickLower) && Number.isInteger(parsedTickUpper) &&
    parsedTickLower < parsedTickUpper && parsedTickLower % DEFAULT_TICK_SPACING === 0 &&
    parsedTickUpper % DEFAULT_TICK_SPACING === 0;
  const suggestedLiquidity = sqrtPriceX96 && ticksValid && maxAmounts
    ? liquidityForAmounts(sqrtPriceX96, parsedTickLower, parsedTickUpper, maxAmounts.amount0, maxAmounts.amount1)
    : null;
  const liquidity = liquidityOverride ? (() => { try { return BigInt(liquidityOverride); } catch { return BigInt(0); } })() : suggestedLiquidity;
  const poolKey = sortedTokens ? poolKeyFor(sortedTokens.token0, sortedTokens.token1) : null;
  const poolId = sortedTokens ? poolIdFor(sortedTokens.token0, sortedTokens.token1) : null;
  const isExistingDemoPair = Boolean(
    sortedTokens &&
    sortedTokens.token0.toLowerCase() === hookFlowDemoMarket.token0.toLowerCase() &&
    sortedTokens.token1.toLowerCase() === hookFlowDemoMarket.token1.toLowerCase()
  );
  const wrongNetwork = isConnected && chainId !== hookFlowChain.id;
  const transactionBusy = isPending || isConfirming;
  const selectedPreset = presetOptions.find((option) => option.value === preset);
  const launchReady = Boolean(
    isHookFlowConfigured && !isExistingDemoPair && poolKey && sqrtPriceX96 && maxAmounts && liquidity && liquidity > BigInt(0) && ticksValid
  );
  const transactionNotice: { message: string; title: string; tone: TransactionTone } = error
    ? { title: "Transaction didn’t go through", message: friendlyError(error), tone: "error" }
    : isConfirmed
      ? transactionKind === "launch"
        ? { title: "Your pool is live!", message: "Your protected pool and first liquidity position are now live on Sepolia.", tone: "success" }
        : { title: `${transactionLabel} approved`, message: "You can continue with the next step.", tone: "success" }
      : isConfirming
        ? { title: "Almost there", message: transactionKind === "launch" ? "Sepolia is confirming your new pool." : `Sepolia is confirming your ${transactionLabel} approval.`, tone: "pending" }
        : isPending
          ? { title: "Check your wallet", message: transactionKind === "launch" ? "Confirm pool creation and your initial liquidity deposit." : `Confirm the ${transactionLabel} approval to continue.`, tone: "pending" }
          : isConnected
            ? { title: "Ready to launch", message: "Approve both tokens, then create your pool.", tone: "neutral" }
            : { title: "Connect your wallet", message: "Connect to Sepolia to approve tokens and create your pool.", tone: "neutral" };

  function useSepoliaDefaults() {
    setTokenAChoice("usdc");
    setTokenBChoice("weth");
    setTokenA(USDC);
    setTokenB(WETH);
    setTokenAAmount("10");
    setTokenBAmount("0.003");
    setInitialPrice("0.000333333333333333");
    setTickLower(FULL_RANGE_LOWER);
    setTickUpper(FULL_RANGE_UPPER);
    setLiquidityOverride("");
    setPreset(1);
  }

  function selectToken(side: "A" | "B", choice: TokenChoice) {
    const token = tokenOptions.find((option) => option.id === choice);
    if (side === "A") {
      setTokenAChoice(choice);
      setTokenA(token?.address ?? "");
    } else {
      setTokenBChoice(choice);
      setTokenB(token?.address ?? "");
    }
  }

  function approveToken(token: string, amount: bigint | null, label: string) {
    if (!isAddress(token) || amount === null) return;
    setTransactionKind("approval");
    setTransactionLabel(label);
    writeContract({
      address: token as Address,
      abi: erc20ApprovalAbi,
      functionName: "approve",
      args: [verifiedHookDefaults.liquidityRouter, amount],
      chainId: hookFlowChain.id
    });
  }

  function launchPool() {
    if (!poolKey || !sqrtPriceX96 || !maxAmounts || !liquidity || !ticksValid) return;
    setTransactionKind("launch");
    writeContract({
      address: verifiedHookDefaults.liquidityRouter,
      abi: hookFlowLiquidityRouterAbi,
      functionName: "createPoolAndAddLiquidity",
      args: [
        poolKey,
        sqrtPriceX96,
        preset,
        { tickLower: parsedTickLower, tickUpper: parsedTickUpper, liquidityDelta: liquidity, salt: zeroHash },
        maxAmounts.amount0,
        maxAmounts.amount1,
        BigInt(Math.floor(Date.now() / 1000) + 20 * 60),
        "0x"
      ],
      chainId: hookFlowChain.id
    });
  }

  return (
    <main className="app-shell min-h-screen bg-background pb-36 text-on-background lg:pb-0 lg:pl-[250px]">
      <AppNav active="create" />
      <section className="px-4 py-4 md:px-8 md:py-6">
        <div className="mx-auto max-w-6xl">
          <header className="mb-4 flex flex-col gap-3 border-b border-outline-variant/60 pb-4 md:mb-6 md:flex-row md:items-end md:justify-between md:pb-6">
            <div>
              <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.035em] md:text-[34px]">Create pool</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {wrongNetwork && <button className="rounded bg-primary px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-primary" disabled={isSwitching} onClick={() => switchChain({ chainId: hookFlowChain.id })}>{isSwitching ? "Switching…" : "Switch to Sepolia"}</button>}
              {isConnected ? <button className="rounded border border-outline-variant px-4 py-3 text-xs font-bold uppercase tracking-wider" onClick={() => disconnect()}>Disconnect</button> : <button className="rounded bg-primary px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-primary" disabled={isConnecting || !connectors[0]} onClick={() => connectors[0] && connect({ connector: connectors[0] })}>{isConnecting ? "Connecting…" : "Connect wallet"}</button>}
            </div>
          </header>

          <ol className="mb-5 grid grid-cols-3 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low md:mb-6 md:rounded-2xl">
            {[
              ["01", "Tokens"],
              ["02", "Settings"],
              ["03", "Launch"]
            ].map(([number, label], index) => (
              <li className={`flex min-w-0 flex-col items-start gap-2 px-2.5 py-3 md:flex-row md:items-center md:gap-3 md:px-4 md:py-4 ${index > 0 ? "border-l border-outline-variant" : ""}`} key={number}>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-[10px] font-bold text-primary md:h-8 md:w-8 md:text-xs">{number}</span>
                <p className="truncate text-xs font-semibold text-white md:text-sm">{label}</p>
              </li>
            ))}
          </ol>

          {!isHookFlowConfigured && <div className="mb-6 rounded-xl border border-amber-300/25 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100">The Sepolia PoolManager is configured, but the new HookFlow hook and atomic router still need deployment addresses in the frontend environment. The form is ready and remains transaction-disabled until those addresses are set.</div>}

          <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr] lg:gap-6">
            <div className="space-y-4 md:space-y-6">
              <article className="rounded-2xl border border-outline-variant/60 bg-surface-container-low p-4 md:p-6">
                <div className="flex items-center justify-between gap-3"><h2 className="font-display text-lg font-bold md:text-xl">Choose tokens</h2><button className="shrink-0 rounded-xl border border-primary/30 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/[0.06]" onClick={useSepoliaDefaults}>Reset</button></div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <TokenPicker address={tokenA} amount={tokenAAmount} choice={tokenAChoice} label="Token A" onAddressChange={setTokenA} onAmountChange={setTokenAAmount} onChoiceChange={(choice) => selectToken("A", choice)} otherAddress={tokenB} />
                  <TokenPicker address={tokenB} amount={tokenBAmount} choice={tokenBChoice} label="Token B" onAddressChange={setTokenB} onAmountChange={setTokenBAmount} onChoiceChange={(choice) => selectToken("B", choice)} otherAddress={tokenA} />
                </div>
                {isExistingDemoPair && <div className="mt-4 flex gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-100"><span className="material-symbols-outlined mt-0.5 text-lg">info</span><p>The hfUSD-A / hfUSD-B demo pool is already live. Choose one demo token with USDC or WETH to launch a new market.</p></div>}
              </article>

              <article className="rounded-2xl border border-outline-variant/60 bg-surface-container-low p-4 md:p-6">
                <h2 className="font-display text-lg font-bold md:text-xl">Starting price</h2>
                <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-on-surface-variant">Opening price · {symbol1} per {symbol0}<div className="mt-2 flex items-center rounded-xl border border-outline-variant bg-background/70 px-4 focus-within:border-primary"><input className="min-w-0 flex-1 bg-transparent py-4 font-mono text-lg text-white outline-none" inputMode="decimal" onChange={(e) => setInitialPrice(e.target.value)} value={initialPrice} /><span className="ml-3 text-xs font-semibold text-on-surface-variant">{symbol1} / {symbol0}</span></div></label>
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.06] p-4"><span className="material-symbols-outlined text-xl text-primary">all_inclusive</span><p className="text-sm font-semibold text-white">Full range · Recommended</p></div>
                <details className="mt-4 rounded-xl border border-outline-variant bg-background/40 p-4"><summary className="text-xs font-bold uppercase tracking-wider text-primary">Advanced range settings</summary><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Lower tick<input className="mt-2 w-full rounded-xl border border-outline-variant bg-background/70 px-3 py-3 font-mono text-white outline-none focus:border-primary" onChange={(e) => setTickLower(e.target.value)} value={tickLower} /></label><label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Upper tick<input className="mt-2 w-full rounded-xl border border-outline-variant bg-background/70 px-3 py-3 font-mono text-white outline-none focus:border-primary" onChange={(e) => setTickUpper(e.target.value)} value={tickUpper} /></label></div><button className="mt-3 text-xs font-semibold text-primary hover:underline" onClick={() => { setTickLower(FULL_RANGE_LOWER); setTickUpper(FULL_RANGE_UPPER); }} type="button">Reset to full range</button></details>
              </article>

              <article className="rounded-2xl border border-outline-variant/60 bg-surface-container-low p-4 md:p-6">
                <h2 className="font-display text-lg font-bold md:text-xl">Protection</h2>
                <div className="mt-4 grid grid-cols-2 gap-2.5 md:mt-5 md:gap-3">{presetOptions.map((option) => <button className={`rounded-xl border p-3 text-left transition md:p-4 ${preset === option.value ? "border-primary bg-primary/10" : "border-outline-variant bg-background/50 hover:border-primary/30"}`} key={option.value} onClick={() => setPreset(option.value)}><span className="text-sm font-semibold text-primary md:text-base">{option.label}</span><span className="mt-1.5 block text-xs leading-5 text-on-surface-variant md:mt-2 md:text-sm md:leading-6">{option.description}</span></button>)}</div>
              </article>
            </div>

            <aside className="space-y-6">
              <article className="scroll-mt-20 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-surface-container-low p-4 md:p-6 lg:sticky lg:top-6" id="launch-summary">
                <div className="flex items-center justify-between gap-3"><div><p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Review</p><h2 className="mt-2 font-display text-xl text-white">{tokenASymbol} / {tokenBSymbol}</h2></div><span className="material-symbols-outlined rounded-xl bg-primary/10 p-3 text-primary">add_chart</span></div>
                <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
                  <div className="col-span-2 rounded-xl bg-background/45 p-4"><dt className="text-xs text-on-surface-variant">Pair</dt><dd className="mt-2 text-lg font-semibold text-white">{tokenASymbol} / {tokenBSymbol}</dd></div>
                  <div className="rounded-xl bg-background/45 p-4"><dt className="text-xs text-on-surface-variant">Max {tokenASymbol}</dt><dd className="mt-2 font-mono text-sm text-white">{tokenAAmount}</dd></div>
                  <div className="rounded-xl bg-background/45 p-4"><dt className="text-xs text-on-surface-variant">Max {tokenBSymbol}</dt><dd className="mt-2 font-mono text-sm text-white">{tokenBAmount}</dd></div>
                  <div className="rounded-xl bg-background/45 p-4"><dt className="text-xs text-on-surface-variant">Opening price</dt><dd className="mt-2 break-all font-mono text-xs text-white">{initialPrice || "Invalid"}</dd></div>
                  <div className="rounded-xl bg-background/45 p-4"><dt className="text-xs text-on-surface-variant">Protection</dt><dd className="mt-2 text-sm font-semibold text-primary">{selectedPreset?.label ?? "Unknown"}</dd></div>
                </dl>
                <div className="mt-3 rounded-xl border border-primary/15 bg-primary/[0.06] p-4"><p className="text-xs text-on-surface-variant">Calculated liquidity</p><p className="mt-2 break-all font-mono text-sm text-primary">{suggestedLiquidity?.toString() ?? "Range does not contain price"}</p></div>

                <details className="mt-4 rounded-xl border border-outline-variant bg-background/40 p-4"><summary className="text-xs font-bold uppercase tracking-wider text-primary">Advanced transaction details</summary><dl className="mt-4 space-y-4 text-xs"><div><dt className="text-on-surface-variant">Pool ID</dt><dd className="mt-1 break-all font-mono text-white">{poolId ?? "Invalid pair"}</dd></div><div><dt className="text-on-surface-variant">Opening sqrtPriceX96</dt><dd className="mt-1 break-all font-mono text-white">{sqrtPriceX96?.toString() ?? "Invalid price"}</dd></div></dl><label className="mt-4 block text-xs text-on-surface-variant">Liquidity override<input className="mt-2 w-full rounded-lg border border-outline-variant bg-background px-3 py-3 font-mono text-white" placeholder={suggestedLiquidity?.toString() ?? "0"} onChange={(e) => setLiquidityOverride(e.target.value)} value={liquidityOverride} /></label></details>

                <div className="mt-6 grid gap-3">
                  <button className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/35 px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary transition hover:bg-primary/[0.06] disabled:opacity-40" disabled={!isConnected || wrongNetwork || !isAddress(tokenA) || isExistingDemoPair || amountA === null || transactionBusy || !isHookFlowConfigured} onClick={() => approveToken(tokenA, amountA, tokenASymbol)}><span className="material-symbols-outlined text-base">approval</span>Approve {tokenASymbol}</button>
                  <button className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/35 px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary transition hover:bg-primary/[0.06] disabled:opacity-40" disabled={!isConnected || wrongNetwork || !isAddress(tokenB) || isExistingDemoPair || amountB === null || transactionBusy || !isHookFlowConfigured} onClick={() => approveToken(tokenB, amountB, tokenBSymbol)}><span className="material-symbols-outlined text-base">approval</span>Approve {tokenBSymbol}</button>
                  <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-xs font-extrabold uppercase tracking-[0.14em] text-on-primary shadow-glow transition hover:bg-primary-fixed disabled:cursor-not-allowed disabled:opacity-40" disabled={!isConnected || wrongNetwork || !launchReady || transactionBusy} onClick={launchPool}><span className="material-symbols-outlined text-lg">rocket_launch</span>Create pool + liquidity</button>
                </div>

                <div className="mt-5">
                  <TransactionNotice href={hash ? txUrl(hash) : undefined} {...transactionNotice} />
                  {isConfirmed && transactionKind === "launch" && (
                    <Link className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline" href="/pools">
                      Manage this pool <span className="material-symbols-outlined text-base">arrow_forward</span>
                    </Link>
                  )}
                </div>
              </article>
            </aside>
          </div>
        </div>
      </section>
      <a className="fixed inset-x-3 bottom-[68px] z-50 flex items-center justify-between rounded-2xl border border-primary/30 bg-surface-container-high/95 px-4 py-3 shadow-[0_16px_50px_rgba(0,0,0,.55)] backdrop-blur-xl lg:hidden" href="#launch-summary">
        <span className="block text-sm font-bold text-white">{tokenASymbol} / {tokenBSymbol}</span>
        <span className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.06em] text-on-primary">Review <span className="material-symbols-outlined text-base">arrow_downward</span></span>
      </a>
    </main>
  );
}

export default function CreatePoolPage() {
  return <Providers><CreatePoolContent /></Providers>;
}
