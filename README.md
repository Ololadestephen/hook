# HookFlow

HookFlow is a Sepolia-native Uniswap v4 liquidity launcher with adaptive LP protection and optional confidential order batching through iExec Nox.

It solves two connected problems:

- New LPs can create a protected v4 pool and supply its first liquidity directly from the app.
- Risky public flow pays adaptive fees, while Phantom Smart Router privately compresses opposing stablecoin intents and chooses how much residual may reach the AMM.

## Atomic pool creation

The `/create` flow now performs a real permissionless launch on Ethereum Sepolia:

1. The creator selects two ERC-20 contracts, maximum deposits, opening price, tick range, and a HookFlow protection preset.
2. The app sorts the currencies, derives the v4 pool ID and Q64.96 opening price, and calculates supported liquidity.
3. The creator approves both tokens to `HookFlowLiquidityRouter`.
4. `createPoolAndAddLiquidity` atomically registers the preset, initializes the canonical v4 pool, and adds the creator's position.
5. If configuration, initialization, or token settlement fails, the entire launch reverts.

The hook authorizes only the deployed liquidity router as `presetOperator`. This removes the old owner-only UI restriction without exposing pool configuration to a separate front-runnable transaction.

## Ethereum Sepolia infrastructure

- Chain ID: `11155111`
- Uniswap v4 PoolManager: `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`
- Uniswap v4 PositionManager: `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4`
- Uniswap v4 StateView: `0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c`
- NoxCompute: `0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf`
- Circle test USDC: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- Sepolia WETH: `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`

Live HookFlow deployment:

- HookFlow hook: `0x1652dd23c6253d855648F81A737fEf811Ab480c0`
- Atomic liquidity router: `0x0c57E18D8eE175087EFc31c3E5855724d9ECa463`
- Exact-input swap router: `0x7Ce373A874c5FF56959859d525315d263C1e33ac`
- Public CREATE2 factory: `0xFffd73b95b0A72381ea60Fe6560Ce9d991eCA5af`
- Phantom Batch: `0x6746265fD2B884096c6936ab27f07922f81f2596`

The live demo market and confidential execution evidence are documented in [docs/LIVE_CONFIDENTIAL_ROUTE.md](docs/LIVE_CONFIDENTIAL_ROUTE.md).

## Adaptive protection

At `beforeSwap`, HookFlow returns a bounded dynamic-fee override:

```text
effectiveFee = baseFee + sizePremium + toxicityPremium
effectiveFee = min(effectiveFee, maxFee)
```

After each swap, it tracks executed directional volume, repeated same-direction flow, toxicity, and defensive cooldown. Four safe presets cover stable, volatile, launch, and long-tail markets.

## Phantom Smart Router

Phantom Smart Router uses iExec Nox encrypted types to hide order amount, direction, and maximum public clip. Nox privately selects no public swap, a direct HookFlow swap, or a capped HookFlow clip. Any encrypted remainder rolls into the next batch; public-decryption proofs bind the executor to the selected route and amount.

See [docs/PHANTOM_BATCH.md](docs/PHANTOM_BATCH.md).

## Project layout

- [src/HookFlowHook.sol](src/HookFlowHook.sol): adaptive fee hook and protected preset registry
- [src/HookFlowLiquidityRouter.sol](src/HookFlowLiquidityRouter.sol): atomic pool launch, first liquidity, and later liquidity modifications
- [src/HookFlowSwapRouter.sol](src/HookFlowSwapRouter.sol): slippage-protected exact-input execution through HookFlow
- [frontend/app/create/page.tsx](frontend/app/create/page.tsx): Sepolia pool launcher interface
- [nox/contracts/PhantomBatch.sol](nox/contracts/PhantomBatch.sol): confidential aggregation layer
- [script/DeployHookFlowPublicSelfServe.s.sol](script/DeployHookFlowPublicSelfServe.s.sol): Sepolia deployment script
- [docs/SEPOLIA_DEPLOYMENT.md](docs/SEPOLIA_DEPLOYMENT.md): deployment and frontend handoff

## Local verification

```sh
forge test --offline
npm --prefix frontend install
npm --prefix frontend run build
```

Nox integration tests require Node.js 22 and Docker:

```sh
npm --prefix nox install
npm run nox:build
npm run nox:test
```

## Deploy to Sepolia

Copy `.env.example` to `.env`, provide a funded testnet key and RPC, then run:

```sh
set -a
source .env
set +a
forge script script/DeployHookFlowPublicSelfServe.s.sol:DeployHookFlowPublicSelfServe \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --broadcast \
  -vvvv
```

Copy the printed hook, factory, and router addresses into `frontend/.env.local` using [frontend/.env.example](frontend/.env.example), then rebuild the app.

## Historical deployment

The previous X Layer mainnet proof remains documented in [docs/MAINNET_DEPLOYMENT.md](docs/MAINNET_DEPLOYMENT.md) as an archived behavior proof. It is no longer the active frontend network.

## Current boundary

HookFlow and Phantom Smart Router are deployed and wired on Sepolia. The app can permissionlessly create a protected pool with first liquidity and can submit encrypted Phantom intents. A live proof has already encrypted a 125-unit intent, privately selected a 20-unit public clip, executed that clip through the HookFlow pool, authenticated the swap reference with Nox proofs, and carried the encrypted remainder forward. Token custody, matched-order settlement, and cryptographic inspection of the separate HookFlow swap remain future work.
